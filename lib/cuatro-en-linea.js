// 4 en línea (four in a row) in plain text, for plugins/fun-4enlinea.js: the board is a grid of emojis with the column
// numbers underneath, so there is no image to draw. Two people from the group play in their chat's room, and each move
// is a plain message with the column number. Free, or for the same amount of UruCoins each (.4enlinea 100): then, as in
// a duel (lib/duelos.js), each one is charged on sitting down, the winner takes both stakes and the house takes none.
//
// The rooms live here and not in the plugin: a lib/ module isn't loaded again when its plugin is (load-functions.js),
// so saving the plugin's file doesn't lose the games being played, and they need no global (EN_GLOBALTHIS,
// eslint.config.js). What's at stake goes back if the bot shuts down (devolverCuatroEnLinea, lib/cierre.js).
import { gastarCoins, ganarCoins, getSaldoCoins, getChat } from "../database-functions.js";
import { protegerApuesta } from "./tienda.js";
import { COINS, apuestaMaxima, textoApuestaMaxima } from "./urucoins.js";

export const CUATRO_EN_LINEA = {
  INACTIVIDAD_MS: 10 * 60 * 1000, // a room with no moves for this long is dropped; with a bet, whoever had the turn loses
};

const FILAS = 6;
const COLUMNAS = 7;

// tablero[fila][columna]: 0 empty, 1 red, 2 yellow. Row 0 is the top one, so a disc falls to the highest free row.
export const FICHA = { 1: "🔴", 2: "🟡" };
const GANADORA = { 1: "🟥", 2: "🟨" }; // the four that won are drawn as squares so they stand out
const VACIO = "🟩";
const NUMEROS = "1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣";

const DIRECCIONES = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

// chat -> { chat, j1, j2, estado: "ESPERANDO" | "JUGANDO", tablero, turno: 1 | 2, ultimo, apuesta (0: free), avisar,
// timeout }: one room per chat.
export const salas = new Map();

const mencion = (id) => `@${String(id).split("@")[0]}`;

export const tableroVacio = () => Array.from({ length: FILAS }, () => Array(COLUMNAS).fill(0));

// The cells of the line of four or more that goes through (r, c), or [] if there isn't one.
function lineaGanadora(tablero, r, c, ficha) {
  for (const [dr, dc] of DIRECCIONES) {
    const celdas = [[r, c]];
    for (const sentido of [1, -1]) {
      let rr = r + dr * sentido;
      let cc = c + dc * sentido;
      while (rr >= 0 && rr < FILAS && cc >= 0 && cc < COLUMNAS && tablero[rr][cc] === ficha) {
        celdas.push([rr, cc]);
        rr += dr * sentido;
        cc += dc * sentido;
      }
    }
    if (celdas.length >= 4) return celdas;
  }
  return [];
}

// Drops a disc in a column (0 to 6). Returns { ok: false, motivo } or { ok: true, celdas, ganador, empate }.
export function soltar(tablero, columna, ficha) {
  if (!Number.isInteger(columna) || columna < 0 || columna >= COLUMNAS) return { ok: false, motivo: "columna-invalida" };
  let fila = -1;
  for (let r = FILAS - 1; r >= 0; r--) {
    if (tablero[r][columna] === 0) {
      fila = r;
      break;
    }
  }
  if (fila === -1) return { ok: false, motivo: "columna-llena" };
  tablero[fila][columna] = ficha;
  const celdas = lineaGanadora(tablero, fila, columna, ficha);
  const lleno = tablero[0].every((v) => v !== 0);
  return { ok: true, celdas, ganador: celdas.length ? ficha : 0, empate: !celdas.length && lleno };
}

// The board as text: the grid, and the numbers of the columns underneath.
export function dibujar(tablero, ganadoras = []) {
  const ganan = new Set(ganadoras.map(([r, c]) => r * COLUMNAS + c));
  const filas = tablero.map((fila, r) => fila.map((v, c) => (v === 0 ? VACIO : ganan.has(r * COLUMNAS + c) ? GANADORA[v] : FICHA[v])).join(""));
  return [...filas, NUMEROS].join("\n");
}

// The chat's room, or null. A free one with no moves for INACTIVIDAD_MS is dropped when it's looked at: with one room
// per chat at most, there's nothing to sweep. One with a bet is closed by its own timer, which settles what's at stake:
// dropped here, the coins would have gone with it.
export function salaVigente(chat, ahora = Date.now()) {
  const sala = salas.get(chat);
  if (!sala) return null;
  if (!sala.apuesta && ahora - sala.ultimo > CUATRO_EN_LINEA.INACTIVIDAD_MS) {
    salas.delete(chat);
    return null;
  }
  return sala;
}

// Whether someone sits at a table, waiting or playing, in any chat. The tic-tac-toe asks before opening a game: both
// take plain numbers as moves, and it takes its own from any chat (plugins/_fun-ttt.js).
export function juegaCuatroEnLinea(usuario, ahora = Date.now()) {
  for (const chat of [...salas.keys()]) {
    const sala = salaVigente(chat, ahora);
    if (sala && (sala.j1 === usuario || sala.j2 === usuario)) return true;
  }
  return false;
}

// ---------- the tables, free or with a bet ----------

export const textoLimitesCuatroEnLinea = () => `mínimo ${COINS.APUESTA_MIN}, máximo ${textoApuestaMaxima(COINS.CUATRO_EN_LINEA_APUESTA_MAX)}`;

// Opens the chat's table for whoever asks: free (apuesta null) or for that amount each, charged now. "avisar(texto,
// mentions)" is how a table with a bet tells the group that its time ran out. Returns { ok: true, sala } or
// { ok: false, error }.
export function abrirMesa(chat, quien, apuesta = null, avisar = null) {
  if (salaVigente(chat)) return { ok: false, error: "Ya hay una mesa de 4 en línea en este grupo." };
  if (apuesta !== null) {
    if (!Number.isInteger(apuesta) || apuesta < COINS.APUESTA_MIN) return { ok: false, error: `La apuesta mínima es ${COINS.APUESTA_MIN} UruCoins.` };
    const maximo = apuestaMaxima(chat, quien, COINS.CUATRO_EN_LINEA_APUESTA_MAX);
    if (apuesta > maximo) return { ok: false, error: `Tu apuesta máxima en el 4 en línea es ${maximo} UruCoins (${textoApuestaMaxima(COINS.CUATRO_EN_LINEA_APUESTA_MAX)}).` };
    if (!gastarCoins(chat, quien, apuesta, "cuatroenlinea_apuesta")) return { ok: false, error: `No te alcanza: tenés ${getSaldoCoins(chat, quien)} UruCoins.` };
  }
  const sala = { chat, j1: quien, j2: "", estado: "ESPERANDO", tablero: tableroVacio(), turno: 1, ultimo: Date.now(), apuesta: apuesta ?? 0, avisar, timeout: null };
  salas.set(chat, sala);
  programar(sala);
  return { ok: true, sala };
}

// Sits the second one down at the waiting table, and the game starts. They write the table's amount (null: none), so
// nobody bets without meaning to; it's charged now. { ok: true, sala } or { ok: false, error }.
export function sentarse(chat, quien, apuesta = null) {
  const sala = salaVigente(chat);
  if (!sala || sala.estado !== "ESPERANDO" || sala.j1 === quien) return { ok: false, error: "No hay ninguna mesa de 4 en línea esperando rival." };
  if (sala.apuesta && apuesta !== sala.apuesta) return { ok: false, error: `Esta mesa es por ${sala.apuesta} UruCoins cada uno: para sentarte, escribí .4enlinea ${sala.apuesta}` };
  if (!sala.apuesta && apuesta !== null) return { ok: false, error: "Esta mesa es sin apuesta: para sentarte, escribí .4enlinea solo." };
  if (sala.apuesta && !gastarCoins(chat, quien, sala.apuesta, "cuatroenlinea_apuesta")) return { ok: false, error: `No te alcanza: tenés ${getSaldoCoins(chat, quien)} UruCoins.` };
  sala.j2 = quien;
  sala.estado = "JUGANDO";
  anotarJugada(sala);
  return { ok: true, sala };
}

// After each move, and on sitting down: the 10 minutes start over.
export function anotarJugada(sala) {
  sala.ultimo = Date.now();
  programar(sala);
}

// The timer of a table with a bet (a free one is dropped when looked at, salaVigente), started over with each move. An
// error in there would get to no catch, and take the bot down with it. It doesn't hold the process up by itself: the
// bot has its connection for that, and a test that fails with a table open waited ten minutes for it.
function programar(sala) {
  if (!sala.apuesta) return;
  clearTimeout(sala.timeout);
  sala.timeout = setTimeout(() => {
    try {
      vencer(sala);
    } catch (e) {
      console.error("[4enlinea] no se pudo cerrar la mesa vencida:", e);
    }
  }, CUATRO_EN_LINEA.INACTIVIDAD_MS);
  sala.timeout.unref?.();
}

function quitar(sala) {
  clearTimeout(sala.timeout);
  if (salas.get(sala.chat) === sala) salas.delete(sala.chat);
}

// Each one seated gets their stake back. Returns who did.
function devolverApuestas(sala) {
  const sentados = [sala.j1, sala.j2].filter(Boolean);
  for (const u of sentados) ganarCoins(sala.chat, u, sala.apuesta, "cuatroenlinea_devolucion");
  return sentados;
}

// Frees the table and settles what's at stake: the winner takes both stakes and the loser's shield gives back what it
// can, as in a duel; with no winner (a draw), each one gets theirs back. The line for the final message ("" if free).
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
  ganarCoins(chat, ganador, pozo, "cuatroenlinea_premio");
  const perdedor = ganador === sala.j1 ? sala.j2 : sala.j1;
  const devuelto = protegerApuesta(chat, perdedor, sala.apuesta, "escudo_cuatroenlinea");
  return `\n💰 Se lleva ${pozo} UruCoins.${devuelto ? `\n🛡️ ${mencion(perdedor)} tenía escudo y recupera ${devuelto}.` : ""}`;
}

// .rendirse from someone at the table (plugins/fun-rendirse.js): the other wins. { ok: true, texto, mentions } or
// { ok: false, error }.
export function rendirse(chat, quien) {
  const sala = salaVigente(chat);
  if (!sala || ![sala.j1, sala.j2].includes(quien)) return { ok: false, error: "No estás jugando al 4 en línea." };
  if (sala.estado !== "JUGANDO") return { ok: false, error: "Todavía no empezó: si querés dejar la mesa, usá .del4enlinea." };
  const rival = sala.j1 === quien ? sala.j2 : sala.j1;
  return { ok: true, texto: `🏳️ ${mencion(quien)} se rindió. ¡Ganó ${mencion(rival)}! 🎉${terminar(chat, rival)}`, mentions: [quien, rival] };
}

// .del4enlinea (plugins/fun-4enlinea-del.js): the ones at the table, or an admin ("esAdmin" counts the owner too). With
// UruCoins in play, cancelling would be the way out of a game you're losing: the two give up instead, and only an admin
// who isn't playing can call it off, giving each their coins back. Returns { ok: true, texto, mentions } or
// { ok: false, error }.
export function cancelar(chat, quien, esAdmin = false) {
  const sala = salaVigente(chat);
  if (!sala) return { ok: false, error: "No hay ninguna partida de 4 en línea en este grupo." };
  const juega = [sala.j1, sala.j2].includes(quien);
  const enJuego = Boolean(sala.apuesta) && sala.estado === "JUGANDO";
  if (enJuego && juega) return { ok: false, error: "Esta partida es por UruCoins: para dejarla, .rendirse (y gana el otro)." };
  if (!juega && !esAdmin) return { ok: false, error: enJuego ? "Solo un admin puede cancelar una partida por UruCoins." : "Solo los que juegan o un admin pueden cancelar la partida." };
  quitar(sala);
  if (!sala.apuesta) return { ok: true, texto: "Partida de 4 en línea cancelada.", mentions: [] };
  const devueltos = devolverApuestas(sala);
  const quienes = devueltos.length > 1 ? `${devueltos.map(mencion).join(" y ")} recuperan sus ${sala.apuesta} UruCoins cada uno` : `${mencion(devueltos[0])} recupera sus ${sala.apuesta} UruCoins`;
  return { ok: true, texto: `Partida de 4 en línea cancelada: ${quienes}.`, mentions: devueltos };
}

// Whether the group switched its games off (.juegos off). With no row for the chat, they're on, as they start.
function juegosApagados(chat) {
  const fila = getChat(chat);
  return Boolean(fila) && !fila.games;
}

// A table with a bet whose 10 minutes ran out. Nobody sat down: whoever opened it gets their coins back. In a game:
// whoever had the turn loses, or giving up would be just stopping. With the games off, though, the hook took no moves
// (plugins/fun-4enlinea.js): nobody could play, so nobody loses, and each one gets theirs back.
function vencer(sala) {
  if (salas.get(sala.chat) !== sala) return;
  const sentados = [sala.j1, sala.j2].filter(Boolean);
  let texto;
  if (sala.estado === "ESPERANDO") {
    quitar(sala);
    devolverApuestas(sala);
    texto = `⌛ Nadie se sentó a la mesa de 4 en línea de ${mencion(sala.j1)} en 10 minutos: recupera sus ${sala.apuesta} UruCoins.`;
  } else if (juegosApagados(sala.chat)) {
    quitar(sala);
    devolverApuestas(sala);
    texto = `⌛ La partida de 4 en línea de ${mencion(sala.j1)} y ${mencion(sala.j2)} quedó parada con los juegos apagados: cada uno recupera sus ${sala.apuesta} UruCoins.`;
  } else {
    const ausente = sala.turno === 1 ? sala.j1 : sala.j2;
    const ganador = ausente === sala.j1 ? sala.j2 : sala.j1;
    texto = `⌛ ${mencion(ausente)} no jugó en 10 minutos: ¡ganó ${mencion(ganador)}! 🎉${terminar(sala.chat, ganador)}`;
  }
  Promise.resolve(sala.avisar?.(texto, sentados)).catch((e) => console.error("[4enlinea] no se pudo avisar:", e.message));
}

// On the way out (lib/cierre.js): each table with a bet gives its stakes back and is forgotten, so a second call finds
// nothing. The free ones have nothing to give back. Returns { apuestas, monedas }.
export function devolverCuatroEnLinea() {
  let apuestas = 0;
  let monedas = 0;
  for (const sala of [...salas.values()]) {
    if (!sala.apuesta) continue;
    quitar(sala);
    const devueltos = devolverApuestas(sala).length;
    apuestas += devueltos;
    monedas += devueltos * sala.apuesta;
  }
  return { apuestas, monedas };
}
