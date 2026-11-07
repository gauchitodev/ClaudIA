// Texas Hold'em at the casino, for plugins/coins-poker.js, coins-poker-mesa.js and coins-poker-cartas.js: one table
// per group, two to six seats, chips bought with UruCoins at a buy-in the opener fixes (50 to 100), blinds of 5 % and
// 10 % of it, no-limit betting with side pots, sixty seconds a turn. The opener says when the first hand is dealt
// (arrancar), and the ones after it follow on their own. Claudia never writes first: each player asks for their two
// cards with .cartas in a private chat, every hand. The tables live here, in memory, like the rest of the
// casino: a hand that doesn't end gets refunded on the way out (devolverPoker, lib/cierre.js). Chips only touch the
// balance on the way in (casino_poker, through cobrarApuesta, so the casino's caps apply) and on the way out
// (casino_poker_cobro when someone stands up or the table closes, casino_poker_devolucion when the bot or an admin
// closes it): what moves between players in a hand stays at the table.
import { ganarCoins, getChat } from "../database-functions.js";
import { cobrarApuesta } from "./casino.js";
import { juegosAbiertos } from "./horario-juegos.js";
import { estaApagado } from "./juegos-apagados.js";
import { marcarMensajeDeJuego } from "./mensajes-de-juego.js";
import { nombreDe } from "./menciones.js";
import { mazoNuevo, mejorMano, describirMano, textoCartas } from "./poker-manos.js";
import { armarPozos, repartirPozos, totalPorJugador } from "./poker-pozos.js";
import { conexion } from "./conexion.js";

export const POKER = {
  ASIENTOS_MAX: 6,
  ENTRADA_MIN: 50,
  ENTRADA_MAX: 100, // the casino's own cap per charge (COINS.CASINO_APUESTA_MAX) bounds it too
  TURNO_MS: 60_000, // to decide; past it, the player checks if they can, or folds
  AUSENCIAS_PARA_LEVANTAR: 2, // turns in a row let run out: the player stands up with their chips after the hand
  ENTRE_MANOS_MS: 10_000, // so people read how the hand ended before the next one is dealt
  INACTIVIDAD_MS: 10 * 60_000, // no hand possible for this long (one player, or the casino closed): the table closes
  ARRANQUE_MS: 10 * 60_000, // from the second seat, for the opener to deal the first hand; past it, it's dealt alone
};

// The commands, in one place: the plugins declare them from here and the texts name them. The moves go by poker's own
// words with a p in front: bare, .leave is the owner's (the bot leaves the group), and .check or .call could be
// anything. They used to be Spanish (.paso, .pago, .subo, .novoy), and with a space allowed after the dot, ". voy para
// allá" was a call. The keys are still the moves' Spanish names: accion() takes them as the move's type.
export const CMD = {
  poker: ["poker"],
  paso: ["pcheck"],
  pago: ["pcall"],
  subo: ["praise"],
  allin: ["allin"],
  novoy: ["pfold"],
  levantarme: ["levantarme", "pleave"],
  mesa: ["mesa"],
  cartas: ["cartas"],
  cancelar: ["delpoker"],
};
// The words after .poker that deal the first hand (arrancar), read without accents: "arrancá" is "arranca".
export const EMPEZAR = ["empezar", "arrancar", "empeza", "arranca"];

// So the tests hand over their clock, their deck and where the notices go. avisar is for what no message triggers (a
// turn that ran out, the next hand, the table closing): the live socket, as plugins/avisar-todos.js does.
export const _dep = { ahora: () => Date.now(), mazo: mazoNuevo, avisar: (chat, texto, mentions) => conexion.client?.sendMessage(chat, { text: texto, mentions }) };

// chat -> mesa: { chat, entrada, ciegas: { chica, grande }, estado: "ESPERANDO" | "MANO", asientos (in the order they
// sat: the first one deals the first hand), boton (index into asientos of the last hand's dealer), manos (dealt so
// far), mano, timers: { turno, entreManos, inactividad, arranque }, esperaHasta (when the first hand is dealt alone,
// while that wait runs; null otherwise), avisoCerrado }. A seat: { id, jid, fichas, ausencias, quiereIrse,
// porAusencia, manosJugadas }. A hand: { numero, mazo, mesa (the board), calle, jugadores, boton (index into
// jugadores), apuestaActual, ultimaSubida, subidaIncompleta, turno }; a player in it: { asiento, id, cartas,
// aporteCalle, aporteTotal, estado: "activo" | "allin" | "retirado", actuo }.
export const mesasPoker = new Map();

const mencion = (id) => `@${String(id).split("@")[0]}`;
const lista = (partes) => (partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}` : partes[0] || "");
export const ciegasDe = (entrada) => {
  const grande = Math.ceil(entrada / 10);
  return { grande, chica: Math.ceil(grande / 2) };
};
const esDe = (asiento, quien) => asiento.id === quien || (Boolean(asiento.jid) && asiento.jid === quien);
const asientoDe = (mesa, quien) => mesa.asientos.find((a) => esDe(a, quien)) || null;
const pozo = (mano) => mano.jugadores.reduce((suma, j) => suma + j.aporteTotal, 0);
const participantes = (mesa) => mesa.asientos.filter((a) => a.fichas > 0 && !a.quiereIrse);
const jugadorDe = (mesa, asiento) => mesa.mano?.jugadores.find((j) => j.asiento === asiento) || null;
export const mesaDe = (chat) => mesasPoker.get(chat) || null;

// Whether the group lets a hand start right now: its games, its casino and its coins on, the game hours open, and the
// poker itself not switched off one by one (.juego poker off): the hand going on is played out, no other starts.
function grupoCerrado(chat) {
  const fila = getChat(chat);
  return Boolean(fila) && (!fila.games || fila.casino === 0 || fila.monedas === 0 || !juegosAbiertos(fila) || estaApagado(fila, "poker"));
}

// ---------- notices that no message triggers ----------
function anunciar(mesa, texto, mentions = []) {
  Promise.resolve(_dep.avisar(mesa.chat, texto, mentions))
    .then((enviado) => marcarMensajeDeJuego(enviado?.key?.id, mesa.chat, { juego: "poker" }))
    .catch((e) => console.error("[poker] no se pudo avisar:", e?.message || e));
}
function timer(mesa, nombre, ms, fn) {
  clearTimeout(mesa.timers[nombre]);
  mesa.timers[nombre] = setTimeout(() => {
    try {
      if (mesasPoker.get(mesa.chat) !== mesa) return;
      fn();
    } catch (e) {
      console.error(`[poker] falló el timer ${nombre}:`, e);
    }
  }, ms);
  mesa.timers[nombre].unref?.();
}
const pararTimers = (mesa) => Object.values(mesa.timers).forEach((t) => clearTimeout(t));

// ---------- the table ----------
const nuevoAsiento = (id, jid, fichas) => ({ id, jid: jid || "", fichas, ausencias: 0, quiereIrse: false, porAusencia: false, manosJugadas: 0 });

// .poker <entrada>: opens the group's table, sits whoever asks at the one waiting, or lets someone who went broke back
// in. The buy-in is charged now, through the casino's own checks. { ok: true, texto, mentions } or { ok: false, error
// }.
export function abrirOSentarse(chat, quien, jid, entrada) {
  let mesa = mesasPoker.get(chat);
  if (!mesa) {
    if (!Number.isInteger(entrada) || entrada < POKER.ENTRADA_MIN || entrada > POKER.ENTRADA_MAX) return { ok: false, error: `La entrada va de ${POKER.ENTRADA_MIN} a ${POKER.ENTRADA_MAX} UruCoins: .${CMD.poker[0]} ${POKER.ENTRADA_MAX}` };
    const cobro = cobrarApuesta(chat, quien, entrada, "casino_poker");
    if (!cobro.ok) return { ok: false, error: cobro.error };
    mesa = { chat, entrada, ciegas: ciegasDe(entrada), estado: "ESPERANDO", asientos: [nuevoAsiento(quien, jid, entrada)], boton: -1, manos: 0, mano: null, timers: {}, esperaHasta: null, avisoCerrado: false };
    mesasPoker.set(chat, mesa);
    timer(mesa, "inactividad", POKER.INACTIVIDAD_MS, () => cerrarPorInactividad(mesa));
    return { ok: true, texto: `🃏 *Mesa de póker* · entrada *${entrada}* UruCoins · ciegas ${mesa.ciegas.chica}/${mesa.ciegas.grande}\n${mencion(quien)} se sentó y espera gente (de 2 a ${POKER.ASIENTOS_MAX}).\nPara sentarte: .${CMD.poker[0]} ${entrada}. Cuando estén todos, ${mencion(quien)} arranca con .${CMD.poker[0]} ${EMPEZAR[0]}. Si en 10 minutos no se sienta nadie más, se cierra y cobra sus fichas.`, mentions: [quien] };
  }
  const asiento = asientoDe(mesa, quien);
  if (asiento) return { ok: false, error: `Ya estás en la mesa, con ${asiento.fichas} fichas.` };
  if (entrada !== mesa.entrada) return { ok: false, error: `Esta mesa es por ${mesa.entrada} de entrada: para sentarte, .${CMD.poker[0]} ${mesa.entrada}` };
  if (mesa.asientos.length >= POKER.ASIENTOS_MAX) return { ok: false, error: `La mesa está llena (${POKER.ASIENTOS_MAX} lugares).` };
  const cobro = cobrarApuesta(chat, quien, entrada, "casino_poker");
  if (!cobro.ok) return { ok: false, error: cobro.error };
  mesa.asientos.push(nuevoAsiento(quien, jid, entrada));
  const sentados = mesa.asientos.map((a) => `${mencion(a.id)} (${a.fichas})`).join(", ");
  const todos = mesa.asientos.map((a) => a.id);
  if (mesa.estado === "MANO") return { ok: true, texto: `🪑 ${mencion(quien)} se sienta con ${entrada} (entra en la próxima mano). En la mesa: ${sentados}.`, mentions: todos };
  const sienta = `🪑 ${mencion(quien)} se sienta con ${entrada}. En la mesa: ${sentados}.`;
  if (participantes(mesa).length < 2) return { ok: true, texto: sienta, mentions: todos };
  clearTimeout(mesa.timers.inactividad);
  // the game going already: the next hand in a moment, as between hands
  if (mesa.manos > 0) {
    timer(mesa, "entreManos", POKER.ENTRE_MANOS_MS, () => avisarInicio(mesa));
    return { ok: true, texto: `${sienta} La mano arranca en unos segundos.`, mentions: todos };
  }
  // The first hand waits for the opener's word (arrancar): it used to be dealt ten seconds after the second one sat,
  // and in a group hardly anyone else had read it by then. A full table has nobody left to wait for.
  if (mesa.asientos.length >= POKER.ASIENTOS_MAX) {
    const inicio = empezarMano(mesa);
    if (mesa.estado === "MANO") return { ok: true, texto: `${sienta} La mesa está llena: reparto.\n\n${inicio.texto}`, mentions: [...new Set([...todos, ...inicio.mentions])] };
    return { ok: true, texto: inicio ? `${sienta}\n${inicio.texto}` : sienta, mentions: todos };
  }
  // The wait counts from the second seat: whoever comes later doesn't stretch it.
  if (!mesa.esperaHasta) {
    mesa.esperaHasta = _dep.ahora() + POKER.ARRANQUE_MS;
    timer(mesa, "arranque", POKER.ARRANQUE_MS, () => avisarInicio(mesa));
  }
  return { ok: true, texto: `${sienta}\n${quienArranca(mesa)}`, mentions: todos };
}

// Who deals the first hand, as the table says it while it waits: whoever has sat longest, the opener unless they stood
// up. While the wait runs, when Claudia deals it instead, in whole minutes rounded up.
function quienArranca(mesa) {
  const minutos = mesa.esperaHasta ? Math.max(1, Math.ceil((mesa.esperaHasta - _dep.ahora()) / 60_000)) : 0;
  const sola = minutos ? `; si no, la reparto yo en ${minutos === 1 ? "1 minuto" : `${minutos} minutos`}` : "";
  return `La primera mano la arranca ${mencion(mesa.asientos[0].id)} con .${CMD.poker[0]} ${EMPEZAR[0]}${sola}.`;
}

// .poker empezar: the first hand, dealt when whoever sat first says so, with two or more seated. People sit as they
// get to read the group, and the opener knows whom they're waiting for; past ARRANQUE_MS from the second seat, or with
// the table full, it's dealt alone (abrirOSentarse). The hands after it follow on their own. { ok: true, texto,
// mentions } or { ok: false, error }.
export function arrancar(chat, quien) {
  const mesa = mesasPoker.get(chat);
  if (!mesa) return { ok: false, error: `No hay mesa de póker en este grupo: .${CMD.poker[0]} 100 abre una.` };
  if (mesa.manos > 0) return { ok: false, error: "La mesa ya arrancó: las manos se reparten solas mientras haya dos para jugar." };
  if (participantes(mesa).length < 2) return { ok: false, error: `Falta gente: se juega de 2 a ${POKER.ASIENTOS_MAX}. Para sentarse: .${CMD.poker[0]} ${mesa.entrada}.` };
  if (!esDe(mesa.asientos[0], quien)) return { ok: false, error: quienArranca(mesa) };
  const inicio = empezarMano(mesa);
  // only with the group closed (the casino, its hours, the coins, the games or the poker off), which .poker's own
  // checks stop before this
  if (mesa.estado !== "MANO") return { ok: false, error: inicio?.texto || "⏸️ El casino está cerrado acá: la mesa espera." };
  return { ok: true, texto: inicio.texto, mentions: inicio.mentions };
}

function avisarInicio(mesa) {
  const r = empezarMano(mesa);
  if (r) anunciar(mesa, r.texto, r.mentions);
}

// Pays a seat its chips and takes it out. The reason is the caller's: cobro for someone standing up, devolucion when
// the table is closed on them.
function sacarAsiento(mesa, asiento) {
  mesa.asientos = mesa.asientos.filter((a) => a !== asiento);
}
function siQuedaAlguien(mesa) {
  if (!mesa.asientos.length) {
    pararTimers(mesa);
    mesasPoker.delete(mesa.chat);
    return;
  }
  if (mesa.estado === "ESPERANDO" && participantes(mesa).length < 2) {
    // back to waiting for people: the first hand's wait starts over with the next second one
    clearTimeout(mesa.timers.entreManos);
    clearTimeout(mesa.timers.arranque);
    mesa.esperaHasta = null;
    timer(mesa, "inactividad", POKER.INACTIVIDAD_MS, () => cerrarPorInactividad(mesa));
  }
}

// .levantarme: between hands, the chips go back to the balance right away; in a hand, the player folds now and is
// paid when it ends (their chips in the pot stay there). { ok: true, texto, mentions } or { ok: false, error }.
export function levantarse(chat, quien) {
  const mesa = mesasPoker.get(chat);
  if (!mesa) return { ok: false, error: "No hay mesa de póker en este grupo." };
  const asiento = asientoDe(mesa, quien);
  if (!asiento) return { ok: false, error: "No estás en la mesa de póker." };
  const jugador = jugadorDe(mesa, asiento);
  if (jugador && jugador.estado !== "retirado") {
    asiento.quiereIrse = true;
    // all-in already: nothing left to decide, the hand is played out for them and they're paid at the end
    if (jugador.estado === "allin") return { ok: true, texto: `🪑 ${mencion(quien)} se levanta al terminar la mano (va all-in: la mano sigue).`, mentions: [quien] };
    const eraSuTurno = mesa.mano.jugadores[mesa.mano.turno] === jugador;
    jugador.estado = "retirado";
    const frase = `🏳️ ${mencion(quien)} no va y se levanta al terminar la mano`;
    const total = pozo(mesa.mano);
    const r = continuar(mesa, eraSuTurno ? mesa.mano.turno + 1 : mesa.mano.turno);
    return { ok: true, texto: textoJugada(mesa, total, frase, r), mentions: [...new Set([quien, ...r.mentions])] };
  }
  const fichas = asiento.fichas;
  // whoever was to deal the first hand: the next one who sat does, and the table is told who
  const arrancaba = mesa.manos === 0 && mesa.asientos[0] === asiento;
  if (fichas > 0) ganarCoins(chat, asiento.id, fichas, "casino_poker_cobro");
  sacarAsiento(mesa, asiento);
  siQuedaAlguien(mesa);
  const texto = `💰 ${mencion(quien)} se levanta con ${fichas} UruCoins.`;
  if (arrancaba && participantes(mesa).length >= 2) return { ok: true, texto: `${texto}\n${quienArranca(mesa)}`, mentions: [quien, mesa.asientos[0].id] };
  return { ok: true, texto, mentions: [quien] };
}

// .delpoker, for an admin: the table closes and everyone gets back their chips and what they had in the hand.
export function cancelar(chat, quien, esAdmin = false) {
  const mesa = mesasPoker.get(chat);
  if (!mesa) return { ok: false, error: "No hay mesa de póker en este grupo." };
  if (!esAdmin) return { ok: false, error: `Para irte de la mesa: .${CMD.levantarme[0]}. Cerrarla entera es de los admins.` };
  const devueltos = cerrar(mesa, false);
  return { ok: true, texto: `Mesa de póker cerrada: ${lista(devueltos.map(({ id, total }) => `${mencion(id)} recupera ${total}`))}.`, mentions: devueltos.map((d) => d.id) };
}

// Closes a table: every seat gets its chips plus what it put in the hand being played. porInactividad: the table
// simply ran out of players, so someone who played counts it as a cash-out; otherwise (an admin, the bot going down)
// it's a refund, which .mitimba doesn't count as a play. Returns [{ id, total }].
function cerrar(mesa, porInactividad) {
  pararTimers(mesa);
  mesasPoker.delete(mesa.chat);
  const devueltos = [];
  for (const a of mesa.asientos) {
    const total = a.fichas + (jugadorDe(mesa, a)?.aporteTotal || 0);
    if (total > 0) ganarCoins(mesa.chat, a.id, total, porInactividad && a.manosJugadas > 0 ? "casino_poker_cobro" : "casino_poker_devolucion");
    devueltos.push({ id: a.id, total });
  }
  return devueltos;
}

// Exported for the tests: what the closing clock does when it fires.
export function cerrarPorInactividad(mesa) {
  if (mesasPoker.get(mesa.chat) !== mesa) return;
  const solo = mesa.asientos.length === 1 && mesa.manos === 0 ? mesa.asientos[0] : null;
  const devueltos = cerrar(mesa, true);
  const texto = solo
    ? `⌛ Nadie se sentó a la mesa de póker de ${mencion(solo.id)} en 10 minutos: recupera sus ${solo.fichas} UruCoins.`
    : `⌛ La mesa de póker se cierra: 10 minutos sin dos para jugar. ${lista(devueltos.map(({ id, total }) => `${mencion(id)} cobra ${total}`))}.`;
  anunciar(mesa, texto, devueltos.map((d) => d.id));
}

// On the way out (lib/cierre.js): every table gives back chips and stakes, and is forgotten. { apuestas, monedas }.
export function devolverPoker() {
  let apuestas = 0;
  let monedas = 0;
  for (const mesa of [...mesasPoker.values()]) {
    for (const { total } of cerrar(mesa, false)) {
      if (!total) continue;
      apuestas += 1;
      monedas += total;
    }
  }
  return { apuestas, monedas };
}
// For the tests: tables and timers gone, nothing paid.
export function olvidarMesas() {
  for (const mesa of mesasPoker.values()) pararTimers(mesa);
  mesasPoker.clear();
}

// ---------- the hand ----------
function poner(jugador, cantidad) {
  const puesto = Math.min(cantidad, jugador.asiento.fichas);
  jugador.asiento.fichas -= puesto;
  jugador.aporteCalle += puesto;
  jugador.aporteTotal += puesto;
  if (jugador.asiento.fichas === 0) jugador.estado = "allin";
  return puesto;
}

// Deals the next hand if the table can play one: two with chips who aren't leaving, and the group's switches open.
// Otherwise the table waits, says so once if the casino is the reason, and closes after INACTIVIDAD_MS. Returns
// { texto, mentions } to announce, or null. Whatever calls it, the first hand's wait is over: with the group closed,
// the table goes on waiting as any other does, and the opener can still deal it (arrancar).
export function empezarMano(mesa) {
  clearTimeout(mesa.timers.entreManos);
  clearTimeout(mesa.timers.arranque);
  mesa.esperaHasta = null;
  if (mesa.estado === "MANO") return null;
  const listos = participantes(mesa);
  const cerrado = grupoCerrado(mesa.chat);
  if (cerrado || listos.length < 2) {
    timer(mesa, "inactividad", POKER.INACTIVIDAD_MS, () => cerrarPorInactividad(mesa));
    if (cerrado && !mesa.avisoCerrado) {
      mesa.avisoCerrado = true;
      return { texto: "⏸️ El casino está cerrado acá: la mesa espera. Si en 10 minutos no se puede jugar, se cierra y cada uno cobra sus fichas.", mentions: [] };
    }
    return null;
  }
  clearTimeout(mesa.timers.inactividad);
  mesa.avisoCerrado = false;
  // the button moves to the next seat in the hand; the first hand it's the opener's
  const n = listos.length;
  const indices = listos.map((a) => mesa.asientos.indexOf(a));
  const boton = indices.find((i) => i > mesa.boton) ?? indices[0];
  mesa.boton = boton;
  const desdeBoton = listos.indexOf(mesa.asientos[boton]);
  // heads-up the button is the small blind and goes first; with more, the small blind is the seat after it
  const primero = n === 2 ? desdeBoton : (desdeBoton + 1) % n;
  const ordenados = [...listos.slice(primero), ...listos.slice(0, primero)];
  const mano = {
    numero: ++mesa.manos,
    mazo: _dep.mazo(),
    mesa: [],
    calle: "preflop",
    jugadores: ordenados.map((a) => ({ asiento: a, id: a.id, cartas: [], aporteCalle: 0, aporteTotal: 0, estado: "activo", actuo: false })),
    boton: n === 2 ? 0 : n - 1,
    apuestaActual: 0,
    ultimaSubida: 0,
    subidaIncompleta: false,
    turno: 0,
  };
  mesa.mano = mano;
  mesa.estado = "MANO";
  for (const a of listos) a.manosJugadas++;
  const [chica, grande] = mano.jugadores;
  poner(chica, mesa.ciegas.chica);
  poner(grande, mesa.ciegas.grande);
  mano.apuestaActual = mesa.ciegas.grande; // a short big blind is still matched up to the full one
  mano.ultimaSubida = mesa.ciegas.grande;
  for (let vuelta = 0; vuelta < 2; vuelta++) for (const j of mano.jugadores) j.cartas.push(mano.mazo.pop());
  const cabecera = `🃏 *Mano ${mano.numero}* · botón ${mencion(mano.jugadores[mano.boton].id)} · ciegas ${mencion(chica.id)} ${chica.aporteCalle} / ${mencion(grande.id)} ${grande.aporteCalle} · pozo ${pozo(mano)}\nPedime tus cartas por privado con .${CMD.cartas[0]}`;
  const r = continuar(mesa, n === 2 ? 0 : 2, { conAyuda: true });
  return { texto: r.texto.startsWith("\n") ? `${cabecera}${r.texto}` : `${cabecera}\n${r.texto}`, mentions: [...new Set([...mano.jugadores.map((j) => j.id), ...r.mentions])] };
}

const pendiente = (mano, j) => j.estado === "activo" && (!j.actuo || j.aporteCalle < mano.apuestaActual);
function siguienteTurno(mano, desde) {
  const n = mano.jugadores.length;
  for (let k = 0; k < n; k++) {
    const i = (((desde + k) % n) + n) % n;
    if (pendiente(mano, mano.jugadores[i])) return i;
  }
  return -1;
}
const puedeSubir = (mano, j) => !(mano.subidaIncompleta && j.actuo);
function queHacer(mano, j) {
  const falta = mano.apuestaActual - j.aporteCalle;
  if (falta <= 0) return "puede pasar";
  if (falta >= j.asiento.fichas) return `${j.asiento.fichas} para igualar y quedar all-in, o .${CMD.novoy[0]}`;
  return puedeSubir(mano, j) ? `${falta} para igualar` : `${falta} para igualar, solo .${CMD.pago[0]} o .${CMD.novoy[0]}`;
}
function prompt(mesa, { conAyuda = false } = {}) {
  const mano = mesa.mano;
  const j = mano.jugadores[mano.turno];
  if (!conAyuda) return `👉 ${mencion(j.id)}: ${queHacer(mano, j)}`;
  const falta = mano.apuestaActual - j.aporteCalle;
  const opciones = falta > 0 ? `.${CMD.pago[0]} · .${CMD.subo[0]} ${mano.ultimaSubida} · .${CMD.allin[0]} · .${CMD.novoy[0]}` : `.${CMD.paso[0]} · .${CMD.subo[0]} ${mano.ultimaSubida} · .${CMD.allin[0]} · .${CMD.novoy[0]}`;
  return `👉 ${mencion(j.id)}: ${queHacer(mano, j)} · ${opciones} (${Math.round(POKER.TURNO_MS / 1000)} s)`;
}
const NOMBRE_CALLE = { flop: "Flop", turn: "Turn", river: "River" };
const CALLES = ["preflop", "flop", "turn", "river"];

// After an action: whose turn it is, or the street is over (next one, or showdown), or the hand is over. "desde" is
// the index to look from for the next one to act. Returns { texto, mentions, fin, calleNueva }: while the hand goes
// on, texto is whose turn it is ("👉 @… : 10 para igualar") and calleNueva says if a street was just dealt; when it
// ends, texto starts with a line break and shows the end.
function continuar(mesa, desde, opciones = {}) {
  const mano = mesa.mano;
  const noRetirados = mano.jugadores.filter((j) => j.estado !== "retirado");
  if (noRetirados.length === 1) return terminarMano(mesa, noRetirados[0]);
  const idx = siguienteTurno(mano, desde);
  if (idx !== -1) {
    mano.turno = idx;
    armarTurno(mesa);
    return { texto: prompt(mesa, opciones), mentions: [mano.jugadores[idx].id], fin: false, calleNueva: false };
  }
  const activos = noRetirados.filter((j) => j.estado === "activo");
  if (activos.length <= 1) {
    while (mano.mesa.length < 5) mano.mesa.push(mano.mazo.pop());
    const r = terminarMano(mesa, null);
    return { ...r, texto: `\n— no queda nadie por apostar, voy hasta el final${r.texto}` };
  }
  if (mano.calle === "river") return terminarMano(mesa, null);
  mano.calle = CALLES[CALLES.indexOf(mano.calle) + 1];
  for (let i = 0; i < (mano.calle === "flop" ? 3 : 1); i++) mano.mesa.push(mano.mazo.pop());
  for (const j of mano.jugadores) {
    j.aporteCalle = 0;
    if (j.estado === "activo") j.actuo = false;
  }
  mano.apuestaActual = 0;
  mano.ultimaSubida = mesa.ciegas.grande;
  mano.subidaIncompleta = false;
  mano.turno = siguienteTurno(mano, (mano.boton + 1) % mano.jugadores.length);
  armarTurno(mesa);
  return { texto: prompt(mesa, opciones), mentions: [mano.jugadores[mano.turno].id], fin: false, calleNueva: true };
}

// Everyone's chips in the hand, by name and without tagging them: tagging the whole table on every move would send each
// of them a notification for each one. Who went all-in or folded says so, and so does who sat down during the hand.
const fichasDeLaMano = (mesa) =>
  mesa.asientos
    .map((a) => {
      const j = jugadorDe(mesa, a);
      const nombre = nombreDe(a.id);
      if (!j) return `${nombre} ${a.fichas} (entra en la próxima)`;
      if (j.estado === "allin") return `${nombre} all-in`;
      return `${nombre} ${a.fichas}${j.estado === "retirado" ? " (no va)" : ""}`;
    })
    .join(" · ");

// What a move answers (a play, a turn run out, someone standing up in the hand): the move, and then the hand as it
// stands, since the message with the table goes far up the chat. The board with the pot (the street's name when it
// was just dealt), everyone's chips, and whose turn it is, the only one tagged. When the hand ends there, the move with
// the pot it left, and the end.
function textoJugada(mesa, total, frase, r) {
  if (r.fin) return `${frase} · pozo ${total}${r.texto}`;
  const mano = mesa.mano;
  const calle = r.calleNueva ? `*${NOMBRE_CALLE[mano.calle]}:*` : "Mesa:";
  const cartas = mano.mesa.length ? textoCartas(mano.mesa) : "todavía nada";
  return `${frase}\n🂠 ${calle} ${cartas} · pozo ${total}\n💰 ${fichasDeLaMano(mesa)}\n${r.texto}`;
}

// A hand that's over: by folds (ganador) or at showdown (null: the board is complete). Pays the seats, sits out those
// who are leaving or broke, and arms the next hand or the closing clock. Returns { texto, mentions, fin: true }.
function terminarMano(mesa, ganador) {
  const mano = mesa.mano;
  clearTimeout(mesa.timers.turno);
  const lineas = [];
  const mentions = new Set(mano.jugadores.map((j) => j.id));
  const aportes = mano.jugadores.map((j) => ({ id: j.id, aporte: j.aporteTotal, retirado: j.estado === "retirado" }));
  if (ganador) {
    ganador.asiento.fichas += pozo(mano);
    lineas.push(`🏆 ${mencion(ganador.id)} se lleva ${pozo(mano)}: todos se retiraron.`);
  } else {
    const fuerza = new Map(mano.jugadores.filter((j) => j.estado !== "retirado").map((j) => [j.id, mejorMano([...j.cartas, ...mano.mesa])]));
    const orden = mano.jugadores.map((j) => j.id);
    const desdeBoton = [...orden.slice(mano.boton + 1), ...orden.slice(0, mano.boton + 1)];
    const pozos = repartirPozos(armarPozos(aportes), (id) => fuerza.get(id).valor, desdeBoton);
    const pagos = totalPorJugador(pozos);
    for (const j of mano.jugadores) j.asiento.fichas += pagos[j.id] || 0;
    lineas.push(`🏁 *Mesa:* ${textoCartas(mano.mesa)}`);
    for (const j of mano.jugadores) if (j.estado !== "retirado") lineas.push(`${mencion(j.id)}: ${textoCartas(j.cartas)} · ${describirMano(fuerza.get(j.id))}`);
    const disputados = pozos.filter((p) => !p.soloSuyo);
    const devuelto = pozos.find((p) => p.soloSuyo);
    if (disputados.length === 1) {
      const [p] = disputados;
      if (p.ganadores.length === 1) lineas.push(`🏆 ${mencion(p.ganadores[0])} gana ${p.monto} con ${describirMano(fuerza.get(p.ganadores[0]))}`);
      else lineas.push(`🏆 Empate: ${lista(p.ganadores.map(mencion))} se reparten ${p.monto} (${p.ganadores.map((id) => p.pagos[id]).join(" y ")})`);
    } else {
      lineas.push(`🏆 ${disputados.map((p, i) => `${i === 0 ? "Pozo principal" : "pozo lateral"} (${p.monto}): ${p.ganadores.map((id) => `${mencion(id)}, ${describirMano(fuerza.get(id))}`).join(" y ")}`).join(" · ")}`);
    }
    if (devuelto) lineas.push(`${mencion(devuelto.ganadores[0])} recupera ${devuelto.monto} sin igualar`);
  }
  // the stacks, and who leaves: the broke, those who asked to, those who let two turns run out
  const fichas = [];
  const salidas = [];
  for (const a of [...mesa.asientos]) {
    if (a.fichas === 0 && !jugadorDe(mesa, a)) continue; // sat down during the hand with nothing? can't happen; kept safe
    if (a.fichas === 0) {
      fichas.push(`${mencion(a.id)} se quedó sin fichas y deja la mesa (.${CMD.poker[0]} ${mesa.entrada} para volver)`);
      sacarAsiento(mesa, a);
    } else if (a.quiereIrse) {
      ganarCoins(mesa.chat, a.id, a.fichas, "casino_poker_cobro");
      salidas.push(a.porAusencia ? `⏳ ${mencion(a.id)} no jugó dos turnos seguidos: se levanta con ${a.fichas} UruCoins.` : `💰 ${mencion(a.id)} se levanta con ${a.fichas} UruCoins.`);
      sacarAsiento(mesa, a);
    } else {
      fichas.push(`${mencion(a.id)} ${a.fichas}`);
    }
    mentions.add(a.id);
  }
  if (fichas.length) lineas.push(`💰 ${fichas.join(" · ")}`);
  lineas.push(...salidas);
  mesa.mano = null;
  mesa.estado = "ESPERANDO";
  // the next hand in a moment (empezarMano decides if the group still lets it start), or the closing clock
  if (!mesa.asientos.length) {
    pararTimers(mesa);
    mesasPoker.delete(mesa.chat);
  } else if (participantes(mesa).length >= 2) {
    timer(mesa, "entreManos", POKER.ENTRE_MANOS_MS, () => avisarInicio(mesa));
  } else {
    timer(mesa, "inactividad", POKER.INACTIVIDAD_MS, () => cerrarPorInactividad(mesa));
  }
  return { texto: `\n${lineas.join("\n")}`, mentions: [...mentions], fin: true };
}

// A turn that ran out: the player checks if they can, or folds; two in a row and they stand up after the hand.
function armarTurno(mesa) {
  const mano = mesa.mano;
  const idx = mano.turno;
  timer(mesa, "turno", POKER.TURNO_MS, () => vencerTurno(mesa, mano, idx));
}
// Exported for the tests, which don't wait a minute: what the turn's timer does when it fires.
export function vencerTurno(mesa, mano = mesa.mano, idx = mano?.turno) {
  if (!mano || mesa.mano !== mano || mano.turno !== idx) return;
  const j = mano.jugadores[idx];
  j.asiento.ausencias++;
  const pasa = j.aporteCalle >= mano.apuestaActual;
  if (pasa) j.actuo = true;
  else j.estado = "retirado";
  let frase = `⏳ ${mencion(j.id)} se quedó sin tiempo: ${pasa ? "pasa" : "no va"}`;
  if (j.asiento.ausencias >= POKER.AUSENCIAS_PARA_LEVANTAR) {
    j.asiento.quiereIrse = true;
    j.asiento.porAusencia = true;
    frase += " · se levanta al terminar la mano";
  }
  const total = pozo(mano);
  const r = continuar(mesa, idx + 1);
  anunciar(mesa, textoJugada(mesa, total, frase, r), [...new Set([j.id, ...r.mentions])]);
}

// .pcheck, .pcall, .praise N, .allin, .pfold from the one whose turn it is, as tipo "paso", "pago", "subo", "allin" or
// "novoy" (CMD's keys). { ok: true, texto, mentions }, or
// { ok: false, error } to answer, or { ok: false, reaccion } when it isn't their turn (a reaction, not a message).
export function accion(chat, quien, tipo, monto = null) {
  const mesa = mesasPoker.get(chat);
  if (!mesa) return { ok: false, error: `No hay mesa de póker en este grupo: .${CMD.poker[0]} ${POKER.ENTRADA_MAX} abre una.` };
  const asiento = asientoDe(mesa, quien);
  if (!asiento) return { ok: false, error: "No estás en la mesa de póker." };
  const mano = mesa.mano;
  if (!mano) return { ok: false, error: "Todavía no arrancó la mano." };
  const j = jugadorDe(mesa, asiento);
  if (!j) return { ok: false, error: "Entrás en la próxima mano." };
  if (mano.jugadores[mano.turno] !== j || j.estado !== "activo") return { ok: false, reaccion: "✋" };
  const falta = mano.apuestaActual - j.aporteCalle;
  const fichas = asiento.fichas;
  let frase;
  if (tipo === "paso" || (tipo === "pago" && falta <= 0)) {
    if (falta > 0) return { ok: false, error: `Hay ${falta} para igualar: .${CMD.pago[0]}, .${CMD.subo[0]} ${mano.ultimaSubida}, .${CMD.allin[0]} o .${CMD.novoy[0]}.` };
    j.actuo = true;
    frase = `👌 ${mencion(quien)} pasa`;
  } else if (tipo === "pago") {
    const puesto = poner(j, falta);
    j.actuo = true;
    frase = j.estado === "allin" ? `🔥 ${mencion(quien)} paga ${puesto} y queda all-in` : `✅ ${mencion(quien)} paga ${puesto}`;
  } else if (tipo === "subo" && !(Number.isInteger(monto) && monto > 0 && falta + monto === fichas)) {
    if (!Number.isInteger(monto) || monto <= 0) return { ok: false, error: `¿Cuánto subís? .${CMD.subo[0]} ${mano.ultimaSubida} (sube ${mano.ultimaSubida} por encima de la apuesta; es el mínimo ahora)` };
    if (!puedeSubir(mano, j)) return { ok: false, error: `Ya no se puede subir en esta ronda (un all-in corto no la reabre): .${CMD.pago[0]} o .${CMD.novoy[0]}.` };
    if (falta + monto > fichas) return { ok: false, error: `Tenés ${fichas} fichas: para ir con todo, .${CMD.allin[0]}.` };
    if (monto < mano.ultimaSubida) return { ok: false, error: `La subida mínima es ${mano.ultimaSubida} (.${CMD.subo[0]} ${mano.ultimaSubida}), o .${CMD.allin[0]}.` };
    poner(j, falta + monto);
    mano.apuestaActual += monto;
    mano.ultimaSubida = monto;
    mano.subidaIncompleta = false;
    for (const otro of mano.jugadores) if (otro !== j && otro.estado === "activo") otro.actuo = false;
    j.actuo = true;
    frase = `⬆️ ${mencion(quien)} sube ${monto} (la apuesta queda en ${mano.apuestaActual})`;
  } else if (tipo === "allin" || tipo === "subo") {
    const nuevo = j.aporteCalle + fichas;
    poner(j, fichas);
    j.actuo = true;
    if (nuevo > mano.apuestaActual) {
      const subida = nuevo - mano.apuestaActual;
      mano.apuestaActual = nuevo;
      if (subida >= mano.ultimaSubida) {
        mano.ultimaSubida = subida;
        mano.subidaIncompleta = false;
        for (const otro of mano.jugadores) if (otro !== j && otro.estado === "activo") otro.actuo = false;
      } else {
        mano.subidaIncompleta = true;
      }
    }
    frase = `🔥 ${mencion(quien)} va all-in con ${fichas}`;
  } else if (tipo === "novoy") {
    j.estado = "retirado";
    frase = `🏳️ ${mencion(quien)} no va`;
  } else {
    return { ok: false, error: "No entendí la jugada." };
  }
  asiento.ausencias = 0;
  const total = pozo(mano);
  const r = continuar(mesa, mano.turno + 1);
  return { ok: true, texto: textoJugada(mesa, total, frase, r), mentions: [...new Set([quien, ...r.mentions])] };
}

// ---------- what's shown ----------
// .mesa / .poker during a game: the seats with their chips, the board, the pot and whose turn it is.
export function textoMesa(mesa) {
  const cabecera = `🃏 *Mesa de póker* · entrada ${mesa.entrada} · ciegas ${mesa.ciegas.chica}/${mesa.ciegas.grande}`;
  const mano = mesa.mano;
  if (!mano) {
    const sentados = mesa.asientos.map((a) => `${mencion(a.id)} (${a.fichas})`).join(", ");
    const listos = participantes(mesa).length >= 2;
    const falta = listos ? "" : ` Falta gente: se juega de 2 a ${POKER.ASIENTOS_MAX}.`;
    // before the first hand, who deals it and when Claudia does instead
    const arranque = listos && mesa.manos === 0 ? `\n${quienArranca(mesa)}` : "";
    return { texto: `${cabecera}\nSentados: ${sentados}. Para sentarte: .${CMD.poker[0]} ${mesa.entrada}.${falta}${arranque}`, mentions: mesa.asientos.map((a) => a.id) };
  }
  const asientos = mesa.asientos.map((a) => {
    const j = jugadorDe(mesa, a);
    const estado = !j ? " (entra en la próxima)" : j.estado === "allin" ? " (all-in)" : j.estado === "retirado" ? " (no va)" : "";
    return `${mesa.asientos.indexOf(a) === mesa.boton ? "🔘 " : ""}${mencion(a.id)} ${a.fichas}${estado}`;
  });
  const j = mano.jugadores[mano.turno];
  return {
    texto: `${cabecera} · mano ${mano.numero} (${mano.calle})\n${asientos.join(" · ")} · pozo ${pozo(mano)}\nMesa: ${mano.mesa.length ? textoCartas(mano.mesa) : "todavía nada"}\n👉 Le toca a ${mencion(j.id)} (${queHacer(mano, j)})`,
    mentions: mesa.asientos.map((a) => a.id),
  };
}

// The tables someone sits at, under any of these ids: [{ mesa, asiento }].
export function mesasDeJugador(ids) {
  const encontradas = [];
  for (const mesa of mesasPoker.values()) {
    const asiento = mesa.asientos.find((a) => ids.some((id) => esDe(a, id)));
    if (asiento) encontradas.push({ mesa, asiento });
  }
  return encontradas;
}

// .cartas in private: what this player holds and where the hand stands, without a group header (the plugin adds it,
// with the group's name). Other players are named, never tagged: it's a private chat.
export function textoCartasDe(mesa, asiento) {
  const mano = mesa.mano;
  if (!mano) return `Estás sentado con ${asiento.fichas} fichas, pero todavía no repartí: cuando arranque la mano, pedímelas de nuevo con .${CMD.cartas[0]}.`;
  const j = jugadorDe(mesa, asiento);
  if (!j) return "Hay una mano en juego, pero vos entrás en la próxima.";
  const cartas = `Tus cartas: *${textoCartas(j.cartas)}*`;
  if (j.estado === "retirado") return `Ya te retiraste de esta mano (tenías ${textoCartas(j.cartas)}).`;
  const tablero = `Mesa: ${mano.mesa.length ? textoCartas(mano.mesa) : "todavía nada"} · pozo ${pozo(mano)} · tus fichas ${asiento.fichas}`;
  if (j.estado === "allin") return `${cartas}\n${tablero}\nFuiste all-in: queda ver la mesa.`;
  const turno = mano.jugadores[mano.turno];
  const quien = turno === j ? `👉 Te toca a vos: ${queHacer(mano, j)}` : `Le toca a ${nombreDe(turno.id)}`;
  return `${cartas}\n${tablero}\n${quien}`;
}
