// Claudia's tact: the rules that decide, in code and before any AI call, whether a glance reads the chat at all,
// whether she may write or only react, and how much. They are pure functions over a snapshot of the chat (the
// "situación", built by lib/vistazos.js or by hand in the tests):
//   { ahora, fila (chats row), estado (iniciativa_estado row), nuevos (buffer entries since the last glance, hers
//     included, commands left out), previos, propiasHoy (today's intervenciones), promedio ({ personas, total }),
//     juegoAbierto, llamadasHoy, vistazosHoy, hayApiKey, forzado (.vistazo), prueba (.vistazo prueba) }
import { INICIATIVA, TEMA_SERIO, normalizar } from "./iniciativa.js";
import { franjaAbierta, franjaDesdeTexto } from "./horario-juegos.js";
import { juegoRecienteEn } from "./mensajes-de-juego.js";

const TIPOS_TEXTO = new Set(["respuesta", "comentario"]); // what she writes on her own
const TIPOS_HABLA = new Set(["charla", "respuesta", "comentario"]); // everything she says, named or not
const humanos = (entradas) => entradas.filter((e) => !e.esBot);

export function esHoraDespierta(ahora) {
  const hora = new Date(ahora).getHours();
  return hora >= INICIATIVA.DESDE_HORA && hora < INICIATIVA.HASTA_HORA;
}

// Closed by its schedule (.horariogrupo): closed by the bot, or outside the window.
export function grupoCerrado(fila, ahora) {
  if (fila?.grupoCerradoPorHorario === 1) return true;
  const h = franjaDesdeTexto(fila?.horarioGrupo);
  return Boolean(h) && !franjaAbierta(h, new Date(ahora));
}

// The first message from someone that touches something serious (a death, a hospital, an accident), or null.
export function hayTemaSerio(entradas) {
  return humanos(entradas).find((e) => TEMA_SERIO.test(normalizar(e.texto)))?.texto || null;
}

// The last MANO_A_MANO_MENSAJES messages from people, all inside the window and between exactly two of them: their
// conversation, which a third party doesn't barge into.
export function esManoAMano(entradas, ahora) {
  const ultimos = humanos(entradas).slice(-INICIATIVA.MANO_A_MANO_MENSAJES);
  if (ultimos.length < INICIATIVA.MANO_A_MANO_MENSAJES) return false;
  if (ahora - ultimos[0].fecha > INICIATIVA.MANO_A_MANO_VENTANA_MS) return false;
  return new Set(ultimos.map((e) => e.usuario || e.nombre)).size === 2;
}

// A game in play: a trivia round, the roulette table, a horse race, a fight, or a game message (riddle, flags, words,
// hangman) in the last few minutes. The registries are read from globalThis, without importing the games.
export function hayJuegoAbierto(chat, ahora = Date.now()) {
  if (globalThis.rondasTrivia?.has(chat) || globalThis.mesasRuleta?.has(chat) || globalThis.carreras?.has(chat)) return true;
  for (const clave of globalThis.peleas?.keys() || []) if (clave.startsWith(`${chat}|`)) return true;
  return juegoRecienteEn(chat, ahora, INICIATIVA.JUEGO_RECIENTE_MS);
}

// Does the glance read the chat at all? { ok } or { ok: false, motivo, marcarLeido, pausaMs }. The reasons show up
// in the log, in .iniciativa and in .vistazo.
export function puedeMirar(s) {
  const no = (motivo, extra = {}) => ({ ok: false, motivo, ...extra });
  if (s.fila?.iniciativa !== 1 && !s.prueba) return no("la iniciativa está apagada");
  if (s.fila?.charla === 0) return no("la charla está apagada (.charla)");
  if (s.fila?.isBanned || s.fila?.adminMode) return no("el grupo está baneado o en modo solo admins");
  if (!s.hayApiKey) return no("no hay API key de Gemini");
  if (!s.forzado && !esHoraDespierta(s.ahora)) return no("es de noche");
  if (grupoCerrado(s.fila, s.ahora)) return no("el grupo está cerrado por horario");
  if (s.estado?.silencioHasta > s.ahora) return no(`está callada (${s.estado.silencioMotivo || "pausa"})`);
  if (humanos(s.nuevos).length === 0) return no("no hay nada nuevo", { marcarLeido: true });
  if (hayTemaSerio(s.nuevos)) return no("están hablando de algo serio", { marcarLeido: true, pausaMs: INICIATIVA.PAUSA_TEMA_SERIO_MS });
  if (s.juegoAbierto) return no("hay un juego abierto");
  if (s.llamadasHoy >= INICIATIVA.TOPE_LLAMADAS_DIA) return no("se llegó al tope de llamadas a la IA del día");
  if (!s.forzado && s.vistazosHoy >= INICIATIVA.VISTAZOS_MAX_DIA) return no("se llegó al tope de vistazos del día");
  return { ok: true };
}

// May she write (reply to a message or comment)? { ok } or { ok: false, motivo }.
export function permisoTexto(s) {
  const no = (motivo) => ({ ok: false, motivo });
  const propios = s.propiasHoy.filter((i) => TIPOS_TEXTO.has(i.tipo));
  if (propios.length >= INICIATIVA.TOPE_TEXTOS_DIA) return no("hoy ya escribió todo lo que escribe por su cuenta");
  const ultimo = propios[propios.length - 1];
  if (ultimo && !ultimo.respondida && !ultimo.reaccionada) return no("nadie le dio bola a lo último que dijo");
  const habla = s.propiasHoy.filter((i) => TIPOS_HABLA.has(i.tipo));
  const promedio = s.promedio?.personas ? s.promedio.total / s.promedio.personas : 0;
  if (habla.length >= Math.max(1, promedio)) return no("hoy ya habló más que el promedio del grupo");
  const gente = humanos(s.nuevos);
  if (gente.length < INICIATIVA.MIN_NUEVOS_PARA_HABLAR) return no("hay muy poco nuevo como para meterse");
  if (s.ahora - gente[gente.length - 1].fecha > INICIATIVA.VIVO_MS) return no("el grupo está quieto");
  const ultimaVez = habla.length ? habla[habla.length - 1].fecha : 0;
  if (s.ahora - ultimaVez < INICIATIVA.PAUSA_TRAS_HABLAR_MS) return no("habló hace muy poco");
  if (esManoAMano(s.nuevos, s.ahora)) return no("dos están charlando mano a mano");
  return { ok: true };
}

// How many reactions this glance may send: { max, motivo }.
export function permisoReacciones(s) {
  const hechas = s.propiasHoy.filter((i) => i.tipo === "reaccion").length;
  const max = Math.min(INICIATIVA.REACCIONES_POR_VISTAZO, INICIATIVA.TOPE_REACCIONES_DIA - hechas);
  if (max <= 0) return { max: 0, motivo: "hoy ya reaccionó todo lo que reacciona" };
  if (!humanos(s.nuevos).some((e) => e.id && s.ahora - e.fecha <= INICIATIVA.REACCION_MAX_EDAD_MS)) return { max: 0, motivo: "no hay mensajes recientes a los que reaccionar" };
  return { max, motivo: "" };
}
