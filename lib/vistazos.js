// Claudia's glances (her initiative, see lib/iniciativa.js). In the groups that switched it on, a few times a day she
// "picks up the phone", reads what she missed since the last glance and decides, in a single Gemini call, whether to
// react to something, answer a message from a while ago, comment, or (most of the time) do nothing. When she glances is
// drawn at random, weighted by the hours the group usually talks, and a burst of messages brings the next glance
// forward. The rules that decide whether she may speak at all (lib/tacto.js) run before any AI call, so a glance with
// nothing to do costs nothing.
//
// Only Gemini, never the backup providers: those are kept for when people talk to her. And a global daily cap on the
// calls, because a 429 here also idles that model for the chat (lib/gemini.js).
import { getChat, updateChat, chatsConOpcion, mensajesPorHora, estadoIniciativa, guardarEstadoIniciativa, adelantarVistazo, contarVistazo, llamadasDelDia, registrarIntervencion, intervencionesDesde, promedioPorPersona, podarIntervenciones } from "../database-functions.js";
import { INICIATIVA, EMOJIS_INICIATIVA, normalizar, inicioDelDia } from "./iniciativa.js";
import { puedeMirar, permisoTexto, permisoReacciones, hayJuegoAbierto, hayTemaSerio, esHoraDespierta, grupoCerrado } from "./tacto.js";
import { mensajesRecientes, mensajesAntesDe, recordarMensaje } from "./contexto-chat.js";
import { preguntarGemini } from "./gemini.js";
import { tipear } from "./ritmo.js";
import { yaReaccionoElBot } from "./envios.js";
import { textoParaPrompt as memoriaDelGrupo } from "./memoria-grupo.js";
import { nombreDeGrupo } from "./cache-grupos.js";
import { franjaAbierta, franjaDesdeTexto } from "./horario-juegos.js";
import { claveDia, ultimosDias } from "./actividad.js";
import { DIA_MS, duracion } from "./tiempo.js";

const MIN = 60 * 1000;

// Randomness and waiting, swappable by the tests (the pattern of lib/parejas.js).
export const _dep = { random: Math.random, esperar: (ms) => new Promise((r) => setTimeout(r, ms)) };

if (!globalThis.vistazosEnCurso) globalThis.vistazosEnCurso = new Set(); // chats with a glance under way
if (!globalThis.rafagasVistazo) globalThis.rafagasVistazo = new Map(); // chat -> times of its latest messages
if (!globalThis.ultimaRafaga) globalThis.ultimaRafaga = new Map(); // chat -> when a burst last brought a glance forward
if (!globalThis.decisionesVistazo) globalThis.decisionesVistazo = new Map(); // chat -> the last glance's report
if (!globalThis.autoIaCooldown) globalThis.autoIaCooldown = new Map(); // shared with plugins/_auto-ia.js

// ---------- when she glances ----------

// The hours she may glance at: awake, and open in the group's schedule (.horariogrupo), checked at half past.
export function horasPermitidas(fila) {
  const franja = franjaDesdeTexto(fila?.horarioGrupo);
  const horas = [];
  for (let hora = INICIATIVA.DESDE_HORA; hora < INICIATIVA.HASTA_HORA; hora++) {
    if (!franja || franjaAbierta(franja, new Date(2000, 0, 1, hora, 30))) horas.push(hora);
  }
  return horas;
}

// Each allowed hour weighs what the group usually talks at that hour, plus a floor so a quiet hour isn't impossible.
// A group with no history comes out even.
function pesosPorHora(perfil, permitidas) {
  const media = permitidas.reduce((t, h) => t + (perfil[h] || 0), 0) / permitidas.length;
  const suavizado = Math.max(1, media * 0.15);
  const pesos = Array(24).fill(0);
  for (const h of permitidas) pesos[h] = (perfil[h] || 0) + suavizado;
  return pesos;
}

// The moment of the next glance, counting from "desde": a Poisson process whose rate follows the group's hours (about
// "porDia" glances in a day), starting SEPARACION_MIN_MS after "desde". It walks minute by minute spending an
// exponential draw. null if nothing falls within three days (no allowed hours).
export function proximoVistazo(desde, { perfil = [], porDia = INICIATIVA.VISTAZOS_DIA, random = _dep.random, permitidas = horasPermitidas(null) } = {}) {
  if (!permitidas.length || porDia <= 0) return null;
  const pesos = pesosPorHora(perfil, permitidas);
  const total = pesos.reduce((t, p) => t + p, 0);
  let resto = -Math.log(1 - random());
  let t = desde + INICIATIVA.SEPARACION_MIN_MS;
  for (let i = 0; i < 3 * 24 * 60; i++, t += MIN) {
    resto -= (porDia * pesos[new Date(t).getHours()]) / total / 60;
    if (resto <= 0) return t + Math.floor(random() * 60) * 1000;
  }
  return null;
}

// The group's messages by hour over the last PERFIL_DIAS days.
function perfilDe(chat, ahora) {
  const perfil = Array(24).fill(0);
  for (const r of mensajesPorHora(chat, ultimosDias(new Date(ahora), INICIATIVA.PERFIL_DIAS))) perfil[r.hora] = r.total;
  return perfil;
}

// Draws and stores the group's next glance, counting from "desde". Returns it (0 when there's none).
export function reprogramar(chat, desde, ahora = Date.now()) {
  const t = proximoVistazo(desde, { perfil: perfilDe(chat, ahora), permitidas: horasPermitidas(getChat(chat)) }) || 0;
  guardarEstadoIniciativa(chat, { proximoVistazo: t, motivoProximo: "rutina" });
  return t;
}

// Brings the group's next glance forward to "momento" (a burst of messages): only while she's awake and the group is
// open, never sooner than SEPARACION_MIN_MS after the last glance, and never later than the one already scheduled.
export function adelantar(chat, momento, motivo, ahora = Date.now()) {
  const fila = getChat(chat);
  if (fila?.iniciativa !== 1 || !esHoraDespierta(momento) || grupoCerrado(fila, momento)) return false;
  if (momento < (estadoIniciativa(chat).ultimoVistazo || 0) + INICIATIVA.SEPARACION_MIN_MS) return false;
  if (momento <= ahora) return false;
  return adelantarVistazo(chat, momento, motivo);
}

// Called by the hook on every message of a group with initiative on. RAFAGA_MENSAJES in RAFAGA_VENTANA_MS is the
// phone buzzing: the next glance comes forward to one to three minutes from now, at most once per cooldown.
export function anotarMensaje(chat, ahora = Date.now()) {
  const recientes = (globalThis.rafagasVistazo.get(chat) || []).filter((t) => ahora - t < INICIATIVA.RAFAGA_VENTANA_MS);
  recientes.push(ahora);
  globalThis.rafagasVistazo.set(chat, recientes);
  if (recientes.length < INICIATIVA.RAFAGA_MENSAJES) return false;
  const ultima = globalThis.ultimaRafaga.get(chat);
  if (ultima !== undefined && ahora - ultima < INICIATIVA.RAFAGA_ENFRIAMIENTO_MS) return false;
  const demora = INICIATIVA.RAFAGA_DEMORA_MIN_MS + Math.floor(_dep.random() * (INICIATIVA.RAFAGA_DEMORA_MAX_MS - INICIATIVA.RAFAGA_DEMORA_MIN_MS));
  if (!adelantar(chat, ahora + demora, "rafaga", ahora)) return false;
  globalThis.ultimaRafaga.set(chat, ahora);
  globalThis.rafagasVistazo.set(chat, []);
  return true;
}

// .iniciativa on: the first glance reads at most PRIMERA_LECTURA_MS back and may come soon.
export function activarIniciativa(chat, ahora = Date.now()) {
  updateChat(chat, { iniciativa: 1 });
  const desde = ahora - INICIATIVA.PRIMERA_LECTURA_MS;
  if ((estadoIniciativa(chat).ultimoVistazo || 0) < desde) guardarEstadoIniciativa(chat, { ultimoVistazo: desde });
  return reprogramar(chat, ahora - INICIATIVA.SEPARACION_MIN_MS, ahora);
}

export function desactivarIniciativa(chat) {
  updateChat(chat, { iniciativa: 0 });
  guardarEstadoIniciativa(chat, { proximoVistazo: 0 });
}

let diaPodado = "";

// Every minute: launches the glances that are due. One overdue by more than VENCIDO_MS (the bot was down) isn't done
// late: a new time is drawn instead. The next one is drawn before launching, so a glance that fails can't loop.
// Returns the glances it launched (the tests wait for them).
export function tickVistazos(client = globalThis.client, ahora = Date.now()) {
  if (!client?.user || !globalThis.botConectado) return [];
  const lanzados = [];
  for (const chat of chatsConOpcion("iniciativa")) {
    try {
      const e = estadoIniciativa(chat);
      if (!e.proximoVistazo || ahora - e.proximoVistazo > INICIATIVA.VENCIDO_MS) {
        reprogramar(chat, ahora - INICIATIVA.SEPARACION_MIN_MS, ahora);
        continue;
      }
      if (e.proximoVistazo > ahora) continue;
      reprogramar(chat, ahora, ahora);
      if (globalThis.vistazosEnCurso.has(chat)) continue;
      lanzados.push(hacerVistazo(client, chat, { motivo: e.motivoProximo || "rutina", ahora }).catch((err) => console.error("[vistazo]", chat, err)));
    } catch (err) {
      console.error("[vistazo]", chat, err);
    }
  }
  const hoy = claveDia(new Date(ahora));
  if (diaPodado !== hoy) {
    diaPodado = hoy;
    podarIntervenciones(ahora - INICIATIVA.PODA_DIAS * DIA_MS);
  }
  return lanzados;
}

export function iniciarVistazos() {
  if (globalThis.vistazosIniciados) return;
  globalThis.vistazosIniciados = true;
  setInterval(() => {
    try {
      tickVistazos();
    } catch (e) {
      console.error("[vistazo]", e);
    }
  }, MIN);
}

// ---------- what she reads ----------

const esComando = (texto) => (globalThis.prefix || []).some((p) => String(texto).startsWith(p));

// Everything since the last glance (at most LECTURA_MAX_MS back), commands left out. People's messages are capped at
// the newest MAX_LEIDOS (hers stay in between); "numerados" are the ones she can react to or quote, the people's
// messages with an id. "previos" are a few lines she had already read, for context.
export function leerLoNuevo(chat, estado, ahora) {
  const desde = Math.max(estado.ultimoVistazo || ahora - INICIATIVA.PRIMERA_LECTURA_MS, ahora - INICIATIVA.LECTURA_MAX_MS);
  const todos = mensajesRecientes(chat, desde).filter((e) => e.fecha > desde && e.fecha <= ahora && !esComando(e.texto));
  const omitidos = Math.max(0, todos.filter((e) => !e.esBot).length - INICIATIVA.MAX_LEIDOS);
  let inicio = 0;
  for (let salteados = 0; salteados < omitidos; inicio++) if (!todos[inicio].esBot) salteados++;
  const nuevos = todos.slice(inicio);
  const previos = mensajesAntesDe(chat, desde + 1, INICIATIVA.CONTEXTO_PREVIO * 4)
    .filter((e) => !esComando(e.texto))
    .slice(-INICIATIVA.CONTEXTO_PREVIO);
  return { desde, nuevos, previos, numerados: nuevos.filter((e) => !e.esBot && e.id), omitidos };
}

// ---------- the prompt and the schema ----------

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const hace = (ms) => (ms < MIN ? "recién" : `hace ${duracion(ms)}`);
const linea = (e, ahora) => `${e.esBot ? "Claudia (vos)" : e.nombre} (${hace(ahora - e.fecha)}): ${e.texto}`;
const TIPOS_TEXTO = new Set(["respuesta", "comentario"]);

export function armarPrompt({ grupo, ahora, estado, lectura, permisos, propiasHoy, memoria }) {
  const d = new Date(ahora);
  const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const ultima = estado.ultimoVistazo ? ` La última vez que miraste fue ${hace(ahora - estado.ultimoVistazo)}.` : "";
  const partes = [`(Esto es solo para vos, no lo muestres.) Agarraste el celular y abriste el grupo "${grupo}". Es ${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} y son las ${hora}.${ultima} Nadie te llamó y nadie espera que digas nada.`];
  if (lectura.previos.length) partes.push(`Lo último que ya habías leído (solo para entender de qué venían hablando):\n${lectura.previos.map((e) => `- ${linea(e, ahora)}`).join("\n")}`);
  const numero = new Map(lectura.numerados.map((e, i) => [e, i + 1]));
  const lineas = lectura.nuevos.map((e) => (numero.has(e) ? `[${numero.get(e)}] ${linea(e, ahora)}` : `- ${linea(e, ahora)}`));
  partes.push(`Lo que te perdiste, del más viejo al más nuevo (el número es para decir a cuál te referís):\n${lineas.join("\n")}`);
  if (lectura.omitidos) partes.push(`(Antes de esto hubo ${lectura.omitidos} mensajes más que no alcanzaste a leer.)`);
  if (memoria) partes.push(memoria);
  const propias = propiasHoy.filter((i) => TIPOS_TEXTO.has(i.tipo));
  if (propias.length) {
    const eco = (i) => (i.respondida ? "te respondieron" : i.reaccionada ? "te reaccionaron" : "nadie te dio bola");
    partes.push(`Lo que ya dijiste hoy por tu cuenta en este grupo:\n${propias.map((i) => `- "${i.texto}" (${hace(ahora - i.fecha)}; ${eco(i)})`).join("\n")}`);
  }
  partes.push(instrucciones(permisos));
  return partes.join("\n\n");
}

function instrucciones({ maxReacciones, puedeHablar }) {
  const r = ["Decidí qué hacés, como una persona más del grupo que lee de pasada:", '- Lo más normal es no hacer nada: leer y seguir. Elegí "nada" salvo que de verdad te nazca algo.'];
  if (maxReacciones > 0) r.push(`- Podés reaccionar a hasta ${maxReacciones === 1 ? "un mensaje" : `${maxReacciones} mensajes`}, por su número, con uno de estos: ${EMOJIS_INICIATIVA.join(" ")}. Solo a lo que de verdad te cause algo, no a todo.`);
  if (puedeHablar) {
    r.push('- Podés "responder" citando uno de los mensajes numerados (en "mensaje" va su número) o "comentar" algo suelto (en "mensaje" va 0). Una o dos frases, como cualquier mensaje de WhatsApp. Si es de hace rato, que suene natural ("recién leo lo de…").');
  } else {
    r.push("- Ahora no da para que escribas: como mucho reaccionás.");
  }
  r.push("Nunca: menciones ni etiquetes a nadie con @; saludes al grupo, resumas o cuentes que estuviste leyendo; hagas preguntas de relleno; contestes algo que le preguntaron a otra persona; te metas en peleas, temas de pareja o temas delicados; repitas algo que ya dijiste; prometas hacer algo después.");
  r.push('En "motivo" poné en pocas palabras por qué hacés lo que hacés (es para un registro, en el grupo no se ve).');
  return r.join("\n");
}

// Built for each glance: what tact doesn't allow isn't even offered. Every field is required, and "motivo" goes first
// so she says why before choosing what.
export function esquemaVistazo({ maxReacciones = 0, puedeHablar = false } = {}) {
  const properties = { motivo: { type: "string" } };
  if (maxReacciones > 0) {
    properties.reacciones = {
      type: "array",
      maxItems: maxReacciones,
      items: { type: "object", properties: { mensaje: { type: "integer" }, emoji: { type: "string", enum: EMOJIS_INICIATIVA } }, required: ["mensaje", "emoji"] },
    };
  }
  properties.accion = { type: "string", enum: puedeHablar ? ["nada", "responder", "comentar"] : ["nada"] };
  if (puedeHablar) Object.assign(properties, { mensaje: { type: "integer" }, texto: { type: "string" } });
  const orden = Object.keys(properties);
  return { type: "object", properties, required: orden, propertyOrdering: orden };
}

// ---------- checking what the AI decided ----------

const sinVariante = (t) => String(t || "").replace(/️/g, "").trim();
const EMOJIS_BASE = new Map(EMOJIS_INICIATIVA.map((e) => [sinVariante(e), e]));

// Her text, ready to send: no "Claudia:" in front, no quotes around it, and no @: sendText turns every @digits into a
// mention (lib/wa-socket.js), and she never tags anyone. "" when nothing is left.
export function limpiarTexto(texto) {
  let t = String(texto || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(claudia( \(vos\))?|yo)\s*:\s*/i, "")
    .replace(/^["“”«»']+|["“”«»']+$/g, "")
    .replace(/@\d+/g, "")
    .replace(/@(?=\p{L})/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(nada|\.+|-+|…)?$/i.test(t)) return "";
  if (t.length > INICIATIVA.MAX_LARGO_TEXTO) {
    const corte = t.slice(0, INICIATIVA.MAX_LARGO_TEXTO);
    const espacio = corte.lastIndexOf(" ");
    t = `${(espacio > INICIATIVA.MAX_LARGO_TEXTO * 0.6 ? corte.slice(0, espacio) : corte).trim()}…`;
  }
  return t;
}

// What the AI asked for, trimmed to what tact allows: valid numbers pointing at people's messages, emojis from the
// list, nothing too old, no message the bot already reacted to, no repeated text. Returns { motivo, reacciones:
// [{ entrada, emoji }], accion, objetivo, texto }.
export function validarDecision(d, numerados, { maxReacciones = 0, puedeHablar = false } = {}, { ahora = Date.now(), propiasHoy = [] } = {}) {
  const motivo = String(d?.motivo || "")
    .trim()
    .slice(0, 200);
  const yaReaccionadosHoy = new Set(propiasHoy.filter((i) => i.tipo === "reaccion").map((i) => i.objetivoId));
  const reacciones = [];
  for (const r of Array.isArray(d?.reacciones) ? d.reacciones : []) {
    if (reacciones.length >= maxReacciones) break;
    const entrada = numerados[Number(r?.mensaje) - 1];
    const emoji = EMOJIS_BASE.get(sinVariante(r?.emoji));
    if (!entrada || !emoji || ahora - entrada.fecha > INICIATIVA.REACCION_MAX_EDAD_MS) continue;
    if (yaReaccionadosHoy.has(entrada.id) || yaReaccionoElBot(entrada.id) || reacciones.some((x) => x.entrada === entrada)) continue;
    reacciones.push({ entrada, emoji });
  }

  let accion = puedeHablar && (d?.accion === "responder" || d?.accion === "comentar") ? d.accion : "nada";
  let texto = accion === "nada" ? "" : limpiarTexto(d?.texto);
  const yaDicho = propiasHoy.filter((i) => TIPOS_TEXTO.has(i.tipo)).map((i) => normalizar(i.texto));
  if (!texto || yaDicho.includes(normalizar(texto))) accion = "nada";
  let objetivo = null;
  if (accion === "responder") {
    objetivo = numerados[Number(d?.mensaje) - 1] || null;
    if (!objetivo || ahora - objetivo.fecha > INICIATIVA.RESPUESTA_MAX_EDAD_MS) accion = "nada";
  }
  if (accion === "nada") {
    texto = "";
    objetivo = null;
  }
  return { motivo, reacciones, accion, objetivo, texto };
}

// ---------- the glance ----------

// The key of a stored message, the same shape m.react sends. Baileys needs the participant to quote in a group.
export const claveDe = (chat, e) => ({ remoteJid: chat, fromMe: false, id: e.id, participant: e.participant || e.usuario });
// A quote needs the message's content too: without it Baileys sends an empty quote.
export const citaDe = (chat, e) => ({ key: claveDe(chat, e), message: { conversation: e.texto } });

// motivo: what brought it on ("rutina", "rafaga", "owner"). forzado (.vistazo): the schedule, the hours and the daily
// cap of glances are skipped. prueba (.vistazo prueba): it asks the AI but sends nothing and changes nothing.
// Returns the report (also kept for .iniciativa and .vistazo).
export async function hacerVistazo(client, chat, { motivo = "rutina", ahora = Date.now(), forzado = false, prueba = false } = {}) {
  if (globalThis.vistazosEnCurso.has(chat)) return { chat, fecha: ahora, motivo, prueba, resumen: "ya había un vistazo en curso" };
  globalThis.vistazosEnCurso.add(chat);
  try {
    return await vistazo(client, chat, { motivo, ahora, forzado, prueba });
  } finally {
    globalThis.vistazosEnCurso.delete(chat);
  }
}

async function vistazo(client, chat, { motivo, ahora, forzado, prueba }) {
  // "ahora" can be pinned (the tests); the clock moves on from it while the AI and the typing take their time.
  const arranque = Date.now();
  const reloj = () => ahora + (Date.now() - arranque);
  const fila = getChat(chat);
  const estado = estadoIniciativa(chat);
  const hoy = claveDia(new Date(ahora));
  const lectura = leerLoNuevo(chat, estado, ahora);
  const gente = lectura.nuevos.filter((e) => !e.esBot);
  const informe = { chat, fecha: ahora, motivo, prueba, leidos: gente.length, personas: new Set(gente.map((e) => e.usuario || e.nombre)).size, omitidos: lectura.omitidos };
  const s = {
    ahora,
    fila,
    estado,
    prueba,
    forzado,
    nuevos: lectura.nuevos,
    previos: lectura.previos,
    propiasHoy: intervencionesDesde(chat, inicioDelDia(ahora)),
    promedio: promedioPorPersona(chat, hoy),
    juegoAbierto: hayJuegoAbierto(chat, ahora),
    llamadasHoy: llamadasDelDia(hoy),
    vistazosHoy: estado.dia === hoy ? estado.vistazos : 0,
    hayApiKey: Boolean(globalThis.geminiApiKey),
  };

  const mirar = puedeMirar(s);
  if (!mirar.ok) {
    if (!prueba) {
      const cambios = {};
      if (mirar.marcarLeido) cambios.ultimoVistazo = ahora;
      if (mirar.pausaMs) Object.assign(cambios, { silencioHasta: ahora + mirar.pausaMs, silencioMotivo: "estaban hablando de algo serio" });
      guardarEstadoIniciativa(chat, cambios);
    }
    return cerrar(Object.assign(informe, { tacto: mirar.motivo, resumen: `no miré: ${mirar.motivo}` }));
  }

  const texto = permisoTexto(s);
  const reacciones = permisoReacciones(s);
  const permisos = { maxReacciones: reacciones.max, puedeHablar: texto.ok };
  informe.permisos = { ...permisos, motivoTexto: texto.motivo || "", motivoReacciones: reacciones.motivo };
  if (!prueba) contarVistazo(chat, hoy, permisos.puedeHablar || permisos.maxReacciones > 0);
  if (!permisos.puedeHablar && !permisos.maxReacciones) {
    if (!prueba) guardarEstadoIniciativa(chat, { ultimoVistazo: ahora });
    return cerrar(Object.assign(informe, { resumen: `leí ${informe.leidos} mensajes y no me tocaba hacer nada (${texto.motivo}; ${reacciones.motivo})` }));
  }

  informe.grupo = await nombreDeGrupo(client, chat).catch(() => "el grupo");
  const prompt = armarPrompt({ grupo: informe.grupo, ahora, estado, lectura, permisos, propiasHoy: s.propiasHoy, memoria: memoriaDelGrupo(chat) });
  const r = await preguntarGemini(prompt, { schema: esquemaVistazo(permisos) });
  if (!r.ok) return cerrar(Object.assign(informe, { error: r.sinCuota ? "sin cuota" : "no respondió", resumen: `leí ${informe.leidos} mensajes, pero la IA ${r.sinCuota ? "está sin cuota" : "no respondió"}` }));
  let crudo;
  try {
    crudo = JSON.parse(r.texto);
  } catch {
    return cerrar(Object.assign(informe, { error: "JSON roto", resumen: `leí ${informe.leidos} mensajes, pero la IA devolvió cualquier cosa` }));
  }
  const decision = validarDecision(crudo, lectura.numerados, permisos, { ahora, propiasHoy: s.propiasHoy });
  informe.decision = decision;
  if (prueba) return cerrar(Object.assign(informe, { resumen: resumenDe(informe) }));

  guardarEstadoIniciativa(chat, { ultimoVistazo: ahora });
  const hechas = [];
  for (const { entrada, emoji } of decision.reacciones) {
    if (hechas.length) await _dep.esperar(1000 + Math.floor(_dep.random() * 2000));
    const enviado = await client.sendMessage(chat, { react: { text: emoji, key: claveDe(chat, entrada) } });
    if (!enviado) continue; // the reactions' queue dropped it (lib/envios.js)
    registrarIntervencion({ chat, fecha: reloj(), tipo: "reaccion", objetivoId: entrada.id, objetivoUsuario: entrada.usuario, texto: emoji, motivo: decision.motivo });
    hechas.push({ entrada, emoji });
  }
  decision.reacciones = hechas;

  if (decision.accion !== "nada") {
    if (sigueHabilitado(chat, ahora, reloj())) {
      await tipear(client, chat, decision.texto);
      const enviado = await client.sendText(chat, decision.texto, decision.accion === "responder" ? citaDe(chat, decision.objetivo) : null);
      const mensajeId = enviado?.key?.id || null;
      const tipo = decision.accion === "responder" ? "respuesta" : "comentario";
      registrarIntervencion({ chat, fecha: reloj(), tipo, mensajeId, objetivoId: decision.objetivo?.id || null, objetivoUsuario: decision.objetivo?.usuario || null, texto: decision.texto, motivo: decision.motivo });
      recordarMensaje(chat, "Claudia", decision.texto, true, { id: mensajeId, fecha: reloj() });
      globalThis.autoIaCooldown.set(chat, Date.now()); // her pace is shared with the chat: 20 s between replies
    } else {
      informe.retenido = true;
      decision.accion = "nada";
    }
  }
  return cerrar(Object.assign(informe, { resumen: resumenDe(informe) }));
}

// Right before writing, the chat is checked again: the AI took a while, and in the meantime the initiative may have
// been switched off, someone may have told her to be quiet, she may have just answered someone, or something serious
// may have come up.
function sigueHabilitado(chat, desde, ahora) {
  const fila = getChat(chat);
  if (fila?.iniciativa !== 1 || fila?.charla === 0) return false;
  if (estadoIniciativa(chat).silencioHasta > ahora) return false;
  if (Date.now() - (globalThis.autoIaCooldown.get(chat) || 0) < MIN) return false;
  return !hayTemaSerio(mensajesRecientes(chat, desde));
}

function resumenDe(i) {
  const d = i.decision;
  const hizo = [];
  if (d?.reacciones.length) hizo.push(d.reacciones.length === 1 ? "una reacción" : `${d.reacciones.length} reacciones`);
  if (d?.accion === "responder") hizo.push("una respuesta citando");
  if (d?.accion === "comentar") hizo.push("un comentario");
  const accion = hizo.length ? `${i.prueba ? "habría hecho " : ""}${hizo.join(" y ")}` : i.retenido ? "iba a escribir, pero ya no daba" : "nada";
  return `leí ${i.leidos} mensajes de ${i.personas} ${i.personas === 1 ? "persona" : "personas"} → ${accion}${d?.motivo ? ` (${d.motivo})` : ""}`;
}

// Keeps the report for .iniciativa and .vistazo and logs it, unless there was nothing to read.
function cerrar(informe) {
  globalThis.decisionesVistazo.set(informe.chat, informe);
  if (informe.leidos > 0) console.log(`[vistazo] ${informe.grupo || informe.chat} · ${informe.motivo}${informe.prueba ? " (prueba)" : ""} · ${informe.resumen}`);
  return informe;
}

// The report of a glance, for the owner (.vistazo).
export function textoInforme(i) {
  const lineas = [`🔧 *Vistazo${i.prueba ? " de prueba" : ""}* en ${i.grupo || i.chat}`];
  lineas.push(`Leí ${i.leidos ?? 0} mensajes de gente${i.omitidos ? ` (y salteé ${i.omitidos})` : ""}.`);
  if (i.tacto) lineas.push(`Tacto: no miro, ${i.tacto}.`);
  else if (i.permisos) lineas.push(`Tacto: ${i.permisos.puedeHablar ? "puedo escribir" : `no escribo (${i.permisos.motivoTexto})`} · reacciones: ${i.permisos.maxReacciones || `ninguna (${i.permisos.motivoReacciones})`}.`);
  if (i.error) lineas.push(`IA: ${i.error}.`);
  const d = i.decision;
  if (d) {
    if (d.reacciones.length) lineas.push(`Reacciones: ${d.reacciones.map((r) => `${r.emoji} a ${r.entrada.nombre} («${r.entrada.texto.slice(0, 40)}»)`).join(" · ")}`);
    if (d.accion !== "nada") lineas.push(`${d.accion === "responder" ? `Respuesta a ${d.objetivo.nombre}` : "Comentario"}: ${d.texto}`);
    if (i.retenido) lineas.push("Iba a escribir, pero cuando terminó de pensar ya no daba (la apagaron, la callaron, habló recién o apareció algo serio).");
    lineas.push(`Motivo: ${d.motivo || "—"}`);
  }
  lineas.push(`Resumen: ${i.resumen}`);
  return lineas.join("\n");
}
