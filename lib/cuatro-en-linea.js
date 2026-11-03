// 4 en línea (four in a row) in plain text, for plugins/fun-4enlinea.js: the board is a grid of emojis with the column
// numbers underneath, so there is no image to draw. Two people from the group play in their chat's room, and each move
// is a plain message with the column number.
//
// The rooms live here and not in the plugin: a lib/ module isn't loaded again when its plugin is (load-functions.js),
// so saving the plugin's file doesn't lose the games being played, and they need no global (EN_GLOBALTHIS,
// eslint.config.js).

export const CUATRO_EN_LINEA = {
  INACTIVIDAD_MS: 10 * 60 * 1000, // a room with no moves for this long is dropped
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

// chat -> { j1, j2, estado: "ESPERANDO" | "JUGANDO", tablero, turno: 1 | 2, ultimo }: one room per chat.
export const salas = new Map();

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

// The chat's room, or null. One with no moves for INACTIVIDAD_MS is dropped when it's looked at: with one room per chat
// at most, there's nothing to sweep.
export function salaVigente(chat, ahora = Date.now()) {
  const sala = salas.get(chat);
  if (!sala) return null;
  if (ahora - sala.ultimo > CUATRO_EN_LINEA.INACTIVIDAD_MS) {
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
