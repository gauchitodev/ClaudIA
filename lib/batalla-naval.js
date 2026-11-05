// Batalla naval between two from the group, for plugins/fun-naval.js. Claudia places both fleets at random and keeps
// them to herself, so nothing has to go by private message: knowing your own sea changes nothing, the ships don't
// move, and what each one needs is their radar, the shots they fired at the other's sea. One shot per turn, always
// alternating, as a plain message with the cell ("B4"). The table, the bet, .rendirse, the cancelling and the ten
// minutes are the 4 en línea's (lib/cuatro-en-linea.js), so the two games are played the same way.
//
// The games are kept in the database (naval table, database-functions.js), whole, as JSON: a battle takes dozens of
// turns, and the bot restarts with every update. Here they're cached by chat once loaded; every change is written.
// After a restart, the clock of every game starts over, so nobody loses for the time the bot was down.
import { gastarCoins, ganarCoins, getSaldoCoins, getChat, setNaval, delNaval, listarNaval } from "../database-functions.js";
import { protegerApuesta } from "./tienda.js";
import { COINS, apuestaMaxima, textoApuestaMaxima } from "./urucoins.js";

export const NAVAL = {
  TAMANO: 8, // 8x8: a 10x10 takes fifty shots each, and every shot is a message with a grid in the group
  FLOTA: [
    ["acorazado", 4, "el"],
    ["crucero", 3, "el"],
    ["submarino", 3, "el"],
    ["lancha", 2, "la"],
  ], // name, length and article, for "era la lancha"
  INACTIVIDAD_MS: 10 * 60 * 1000, // a table or a game with nothing done for this long is over; with a bet, whoever had the turn loses
  BARRIDO_MS: 60 * 1000, // how often the games are looked at for the ten minutes, since nobody may write in the group
};

// So the tests hand over their clock, their dice and where the notices go. avisar is for the notices that no message
// triggers (a game that ran out of time): the live socket, as plugins/avisar-todos.js does.
export const _dep = { ahora: () => Date.now(), azar: Math.random, avisar: (chat, texto, mentions) => globalThis.client?.sendMessage(chat, { text: texto, mentions }) };

const LETRAS = "ABCDEFGH";
const CELDA = { agua: "🌊", tocado: "💥", hundido: "🚢" };
const SIN_TIRAR = "🟦";
const COLUMNAS = "🧭1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣";
// Each row starts with its letter as a regional-indicator symbol: emoji-wide, so the grid lines up, and never a flag,
// because no other one follows it on the line.
const FILAS = ["🇦", "🇧", "🇨", "🇩", "🇪", "🇫", "🇬", "🇭"];
export const COLOR = { 1: "🔵", 2: "🔴" };
export const LEYENDA = `${SIN_TIRAR} sin tirar · 🌊 agua · 💥 tocado · 🚢 hundido`;

const mencion = (id) => `@${String(id).split("@")[0]}`;
const clave = (r, c) => `${r},${c}`;
export const nombreDeCasilla = ([r, c]) => `${LETRAS[r]}${c + 1}`;

// ---------- the sea ----------

// "B4", "b 4" or "4B": the cell as [fila, columna], or null if it isn't one.
export function leerCasilla(texto) {
  const t = String(texto || "").trim().toUpperCase();
  let m = /^([A-H])\s?([1-8])$/.exec(t);
  if (m) return [LETRAS.indexOf(m[1]), Number(m[2]) - 1];
  m = /^([1-8])\s?([A-H])$/.exec(t);
  return m ? [LETRAS.indexOf(m[2]), Number(m[1]) - 1] : null;
}

// Every place a ship of this length fits, horizontal or vertical, clear of the cells taken and their surroundings.
function lugaresPara(largo, ocupadas) {
  const N = NAVAL.TAMANO;
  const lugares = [];
  for (const horizontal of [true, false]) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const celdas = Array.from({ length: largo }, (_, i) => (horizontal ? [r, c + i] : [r + i, c]));
        if (celdas.every(([rr, cc]) => rr < N && cc < N && !ocupadas.has(clave(rr, cc)))) lugares.push(celdas);
      }
    }
  }
  return lugares;
}

// The fleet placed at random: the ships don't touch, not even at a corner. [{ nombre, articulo, largo, celdas, tocadas
// }].
export function colocarFlota(azar = _dep.azar) {
  for (let intento = 0; intento < 100; intento++) {
    const ocupadas = new Set();
    const flota = [];
    for (const [nombre, largo, articulo] of NAVAL.FLOTA) {
      const lugares = lugaresPara(largo, ocupadas);
      if (!lugares.length) break;
      const celdas = lugares[Math.floor(azar() * lugares.length)];
      flota.push({ nombre, articulo, largo, celdas, tocadas: [] });
      for (const [r, c] of celdas) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) ocupadas.add(clave(r + dr, c + dc));
    }
    if (flota.length === NAVAL.FLOTA.length) return flota;
  }
  throw new Error("la flota no entró en el tablero");
}

// A shot by player 1 or 2 at the other's sea. { ok: false, anterior } for a cell already shot at (what it was), or
// { ok: true, resultado: "agua" | "tocado" | "hundido", barco, ganaste }.
export function disparar(sala, quien, [r, c]) {
  const k = clave(r, c);
  const tiros = sala.tiros[quien];
  if (tiros[k]) return { ok: false, anterior: tiros[k] };
  const flota = sala.flotas[quien === 1 ? 2 : 1];
  const barco = flota.find((b) => b.celdas.some(([rr, cc]) => rr === r && cc === c));
  if (!barco) {
    tiros[k] = "agua";
    return { ok: true, resultado: "agua" };
  }
  barco.tocadas.push(k);
  if (barco.tocadas.length < barco.largo) {
    tiros[k] = "tocado";
    return { ok: true, resultado: "tocado", barco };
  }
  for (const [rr, cc] of barco.celdas) tiros[clave(rr, cc)] = "hundido";
  return { ok: true, resultado: "hundido", barco, ganaste: flota.every((b) => b.tocadas.length === b.largo) };
}

export const hundidos = (sala, quien) => sala.flotas[quien === 1 ? 2 : 1].filter((b) => b.tocadas.length === b.largo).length;

// A player's radar: the other's sea as they've shot at it, with the columns on top and the rows' letters.
export function dibujarRadar(tiros) {
  const N = NAVAL.TAMANO;
  const filas = FILAS.slice(0, N).map((letra, r) => letra + Array.from({ length: N }, (_, c) => CELDA[tiros[clave(r, c)]] || SIN_TIRAR).join(""));
  return [COLUMNAS, ...filas].join("\n");
}
export const textoRadar = (sala, quien) => `*Radar de ${mencion(quien === 1 ? sala.j1 : sala.j2)}* ${COLOR[quien]} · hundió ${hundidos(sala, quien)} de ${NAVAL.FLOTA.length}\n${dibujarRadar(sala.tiros[quien])}`;
export const textoTurno = (sala) => `Turno de ${mencion(sala.turno === 1 ? sala.j1 : sala.j2)} ${COLOR[sala.turno]}. Escribí la casilla (A1 a H8). Para abandonar: .rendirse`;
export const textoJugadores = (sala) => `${COLOR[1]} ${mencion(sala.j1)}  vs  ${COLOR[2]} ${mencion(sala.j2)}${sala.apuesta ? `\n💰 ${sala.apuesta * 2} UruCoins en juego` : ""}`;
// .naval during a game, for anyone: both radars and whose turn it is. After a restart, this is how it's picked up.
export const textoEstado = (sala) => `🚢 *Batalla naval*\n${textoJugadores(sala)}\n\n${textoRadar(sala, 1)}\n\n${textoRadar(sala, 2)}\n\n${LEYENDA}\n${textoTurno(sala)}`;

// ---------- the tables, kept in the database ----------

// chat -> { chat, j1, j2, estado: "ESPERANDO" | "JUGANDO", apuesta (0: free), turno: 1 | 2, ultimo, flotas: { 1, 2 },
// tiros: { 1: { "r,c": resultado }, 2 } }: one per chat, loaded from the database once and written on every change.
export const salas = new Map();
let cargadas = false;
let barrido = null;

// The games in the database, the first time they're needed after a start: their clocks start over.
function cargar() {
  if (cargadas) return;
  cargadas = true;
  const ahora = _dep.ahora();
  for (const sala of listarNaval()) {
    sala.ultimo = ahora;
    salas.set(sala.chat, sala);
    setNaval(sala.chat, sala);
  }
  if (salas.size) asegurarBarrido();
}
// For the tests: as if the bot had restarted, with the database as it is.
export function olvidarSalas() {
  salas.clear();
  cargadas = false;
  clearInterval(barrido);
  barrido = null;
}

function guardar(sala) {
  salas.set(sala.chat, sala);
  setNaval(sala.chat, sala);
  asegurarBarrido();
}
function quitar(sala) {
  if (salas.get(sala.chat) === sala) salas.delete(sala.chat);
  delNaval(sala.chat);
}

// Looks at every game for the ten minutes (barrer) once a minute while there's one. It doesn't hold the process up:
// the bot has its connection for that, and a test that ends with a game open would wait for it.
function asegurarBarrido() {
  if (barrido) return;
  barrido = setInterval(() => {
    try {
      barrer();
    } catch (e) {
      console.error("[naval] no se pudieron cerrar las partidas vencidas:", e);
    }
  }, NAVAL.BARRIDO_MS);
  barrido.unref?.();
}
export function barrer(ahora = _dep.ahora()) {
  cargar();
  for (const sala of [...salas.values()]) if (ahora - sala.ultimo > NAVAL.INACTIVIDAD_MS) vencer(sala);
  if (!salas.size) {
    clearInterval(barrido);
    barrido = null;
  }
}

// The chat's table, or null. One that ran out of time is settled on the spot, as the sweep would.
export function salaVigente(chat, ahora = _dep.ahora()) {
  cargar();
  const sala = salas.get(chat);
  if (!sala) return null;
  if (ahora - sala.ultimo > NAVAL.INACTIVIDAD_MS) {
    vencer(sala);
    return null;
  }
  return sala;
}

export const textoLimitesNaval = () => `mínimo ${COINS.APUESTA_MIN}, máximo ${textoApuestaMaxima(COINS.NAVAL_APUESTA_MAX)}`;

// Opens the chat's table for whoever asks: free (apuesta null) or for that amount each, charged now. { ok: true, sala }
// or { ok: false, error }.
export function abrirMesa(chat, quien, apuesta = null) {
  if (salaVigente(chat)) return { ok: false, error: "Ya hay una partida de batalla naval en este grupo." };
  if (apuesta !== null) {
    if (!Number.isInteger(apuesta) || apuesta < COINS.APUESTA_MIN) return { ok: false, error: `La apuesta mínima es ${COINS.APUESTA_MIN} UruCoins.` };
    const maximo = apuestaMaxima(chat, quien, COINS.NAVAL_APUESTA_MAX);
    if (apuesta > maximo) return { ok: false, error: `Tu apuesta máxima en la batalla naval es ${maximo} UruCoins (${textoApuestaMaxima(COINS.NAVAL_APUESTA_MAX)}).` };
    if (!gastarCoins(chat, quien, apuesta, "naval_apuesta")) return { ok: false, error: `No te alcanza: tenés ${getSaldoCoins(chat, quien)} UruCoins.` };
  }
  const sala = { chat, j1: quien, j2: "", estado: "ESPERANDO", apuesta: apuesta ?? 0, turno: 1, ultimo: _dep.ahora(), flotas: null, tiros: null };
  guardar(sala);
  return { ok: true, sala };
}

// Sits the second one down, the fleets are placed and the game starts with whoever opened the table. They write the
// table's amount (null: none), so nobody bets without meaning to; it's charged now. { ok: true, sala } or
// { ok: false, error }.
export function sentarse(chat, quien, apuesta = null) {
  const sala = salaVigente(chat);
  if (!sala || sala.estado !== "ESPERANDO" || sala.j1 === quien) return { ok: false, error: "No hay ninguna mesa de batalla naval esperando rival." };
  if (sala.apuesta && apuesta !== sala.apuesta) return { ok: false, error: `Esta mesa es por ${sala.apuesta} UruCoins cada uno: para sentarte, escribí .naval ${sala.apuesta}` };
  if (!sala.apuesta && apuesta !== null) return { ok: false, error: "Esta mesa es sin apuesta: para sentarte, escribí .naval solo." };
  if (sala.apuesta && !gastarCoins(chat, quien, sala.apuesta, "naval_apuesta")) return { ok: false, error: `No te alcanza: tenés ${getSaldoCoins(chat, quien)} UruCoins.` };
  sala.j2 = quien;
  sala.estado = "JUGANDO";
  sala.flotas = { 1: colocarFlota(), 2: colocarFlota() };
  sala.tiros = { 1: {}, 2: {} };
  sala.ultimo = _dep.ahora();
  guardar(sala);
  return { ok: true, sala };
}

// A shot from one of the two, on their turn. { ok: false, error } for a cell already shot at; { ok: true, tiro,
// ganador, plata } otherwise, where plata is the money line when the game ended ("" if free).
export function jugar(chat, quien, casilla) {
  const sala = salaVigente(chat);
  if (!sala || sala.estado !== "JUGANDO") return { ok: false, error: "No hay ninguna partida de batalla naval en juego." };
  const numero = quien === sala.j1 ? 1 : quien === sala.j2 ? 2 : 0;
  if (numero !== sala.turno) return { ok: false, error: "No es tu turno." };
  const tiro = disparar(sala, numero, casilla);
  if (!tiro.ok) return { ok: false, error: `Ya tiraste en ${nombreDeCasilla(casilla)} (fue ${tiro.anterior}): elegí otra casilla.` };
  if (tiro.ganaste) return { ok: true, tiro, ganador: quien, plata: terminar(chat, quien) };
  sala.turno = numero === 1 ? 2 : 1;
  sala.ultimo = _dep.ahora();
  guardar(sala);
  return { ok: true, tiro, ganador: null, plata: "" };
}

// Each one seated gets their stake back. Returns who did.
function devolverApuestas(sala) {
  const sentados = [sala.j1, sala.j2].filter(Boolean);
  for (const u of sentados) ganarCoins(sala.chat, u, sala.apuesta, "naval_devolucion");
  return sentados;
}

// Frees the table and settles what's at stake, as the 4 en línea does: the winner takes both stakes and the loser's
// shield gives back what it can; with no winner, each one gets theirs back. The line for the final message ("" if
// free).
export function terminar(chat, ganador) {
  const sala = salas.get(chat);
  if (!sala) return "";
  quitar(sala);
  if (!sala.apuesta) return "";
  if (!ganador) {
    devolverApuestas(sala);
    return `\n💰 Cada uno recupera sus ${sala.apuesta} UruCoins.`;
  }
  const pozo = sala.apuesta * 2;
  ganarCoins(chat, ganador, pozo, "naval_premio");
  const perdedor = ganador === sala.j1 ? sala.j2 : sala.j1;
  const devuelto = protegerApuesta(chat, perdedor, sala.apuesta, "escudo_naval");
  return `\n💰 Se lleva ${pozo} UruCoins.${devuelto ? `\n🛡️ ${mencion(perdedor)} tenía escudo y recupera ${devuelto}.` : ""}`;
}

// .rendirse from someone in the game (plugins/fun-rendirse.js): the other wins. { ok: true, texto, mentions } or
// { ok: false, error }.
export function rendirse(chat, quien) {
  const sala = salaVigente(chat);
  if (!sala || ![sala.j1, sala.j2].includes(quien)) return { ok: false, error: "No estás jugando a la batalla naval." };
  if (sala.estado !== "JUGANDO") return { ok: false, error: "Todavía no empezó: si querés dejar la mesa, usá .delnaval." };
  const rival = sala.j1 === quien ? sala.j2 : sala.j1;
  return { ok: true, texto: `🏳️ ${mencion(quien)} se rindió. ¡Ganó ${mencion(rival)}! 🎉${terminar(chat, rival)}`, mentions: [quien, rival] };
}

// .delnaval (plugins/fun-naval-del.js): the ones at the table, or an admin ("esAdmin" counts the owner too). With
// UruCoins in play, cancelling would be the way out of a game you're losing: the two give up instead, and only an admin
// who isn't playing can call it off, giving each their coins back. { ok: true, texto, mentions } or { ok: false, error
// }.
export function cancelar(chat, quien, esAdmin = false) {
  const sala = salaVigente(chat);
  if (!sala) return { ok: false, error: "No hay ninguna partida de batalla naval en este grupo." };
  const juega = [sala.j1, sala.j2].includes(quien);
  const enJuego = Boolean(sala.apuesta) && sala.estado === "JUGANDO";
  if (enJuego && juega) return { ok: false, error: "Esta partida es por UruCoins: para dejarla, .rendirse (y gana el otro)." };
  if (!juega && !esAdmin) return { ok: false, error: enJuego ? "Solo un admin puede cancelar una partida por UruCoins." : "Solo los que juegan o un admin pueden cancelar la partida." };
  quitar(sala);
  if (!sala.apuesta) return { ok: true, texto: "Partida de batalla naval cancelada.", mentions: [] };
  const devueltos = devolverApuestas(sala);
  const quienes = devueltos.length > 1 ? `${devueltos.map(mencion).join(" y ")} recuperan sus ${sala.apuesta} UruCoins cada uno` : `${mencion(devueltos[0])} recupera sus ${sala.apuesta} UruCoins`;
  return { ok: true, texto: `Partida de batalla naval cancelada: ${quienes}.`, mentions: devueltos };
}

// Whether the group switched its games off (.juegos off). With no row for the chat, they're on, as they start.
function juegosApagados(chat) {
  const fila = getChat(chat);
  return Boolean(fila) && !fila.games;
}

// A table or a game with nothing done for ten minutes. Free, it's just dropped, as the 4 en línea's. With a bet:
// nobody sat down, whoever opened it gets their coins back; in a game, whoever had the turn loses, or giving up would
// be
// just stopping; with the games off, though, nobody could play, so nobody loses and each one gets theirs back.
function vencer(sala) {
  if (salas.get(sala.chat) !== sala) return;
  if (!sala.apuesta) return quitar(sala);
  const sentados = [sala.j1, sala.j2].filter(Boolean);
  let texto;
  if (sala.estado === "ESPERANDO") {
    quitar(sala);
    devolverApuestas(sala);
    texto = `⌛ Nadie se sentó a la mesa de batalla naval de ${mencion(sala.j1)} en 10 minutos: recupera sus ${sala.apuesta} UruCoins.`;
  } else if (juegosApagados(sala.chat)) {
    quitar(sala);
    devolverApuestas(sala);
    texto = `⌛ La batalla naval de ${mencion(sala.j1)} y ${mencion(sala.j2)} quedó parada con los juegos apagados: cada uno recupera sus ${sala.apuesta} UruCoins.`;
  } else {
    const ausente = sala.turno === 1 ? sala.j1 : sala.j2;
    const ganador = ausente === sala.j1 ? sala.j2 : sala.j1;
    texto = `⌛ ${mencion(ausente)} no tiró en 10 minutos: ¡ganó ${mencion(ganador)}! 🎉${terminar(sala.chat, ganador)}`;
  }
  Promise.resolve(_dep.avisar(sala.chat, texto, sentados)).catch((e) => console.error("[naval] no se pudo avisar:", e?.message || e));
}
