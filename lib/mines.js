// Mines: a 5x5 grid with N mines. You uncover tiles one at a time: each safe tile raises the multiplier and you can
// cash out whenever you like; hit a mine and you lose the stake. The multiplier is the fair one by probability with
// 3 % for the house, and the prize is capped at MAX_MULT times the stake (uncapped, a nearly full board would pay
// millions). One game per person, in memory; with no decision within SEGUNDOS_DECISION it cashes out on its own.
import { randomInt as randomIntCrypto } from "crypto";
import { ganarCoins, getSaldoCoins } from "../database-functions.js";
import { cobrarApuesta } from "./casino.js";
import { protegerApuesta } from "./tienda.js";

export const _rng = { randomInt: randomIntCrypto };
export const MINES = { LADO: 5, MINAS_MIN: 1, MINAS_MAX: 24, MINAS_DEFAULT: 3, BANCA: 0.97, MAX_MULT: 50, SEGUNDOS_DECISION: 60 };
if (!globalThis.partidasMines) globalThis.partidasMines = new Map(); // "chat|usuario" -> partida

const N = MINES.LADO * MINES.LADO;
const FILAS = "ABCDE";
const NUMEROS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
const clave = (chat, usuario) => `${chat}|${usuario}`;
const mencion = (lid) => `@${lid.split("@")[0]}`;
const coma = (n) => n.toFixed(2).replace(".", ",");

const comb = (n, k) => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};
// The multiplier after k safe tiles with m mines: the inverse of the probability of hitting them all, with the
// house margin and the cap applied.
export const multiplicador = (m, k) => (k === 0 ? 1 : Math.min(MINES.MAX_MULT, (MINES.BANCA * comb(N, k)) / comb(N - m, k)));
const premioDe = (partida) => Math.floor(partida.apuesta * multiplicador(partida.minas.size, partida.abiertas.size));

// "B3", "b3", "3B" or a number from 1 to 25 → index 0..24, or null
export function parsearCasilla(texto) {
  const t = String(texto || "").trim().toUpperCase();
  let m = t.match(/^([A-E])([1-5])$/) || t.match(/^([1-5])([A-E])$/);
  if (m) {
    const [fila, col] = /[A-E]/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
    return FILAS.indexOf(fila) * MINES.LADO + (Number(col) - 1);
  }
  m = t.match(/^(\d{1,2})$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= N) return Number(m[1]) - 1;
  return null;
}
const nombreCasilla = (i) => `${FILAS[Math.floor(i / MINES.LADO)]}${(i % MINES.LADO) + 1}`;

function grilla(partida, { revelar = false, explotada = null } = {}) {
  const filas = [`   ${NUMEROS.join("")}`];
  for (let f = 0; f < MINES.LADO; f++) {
    const celdas = [];
    for (let c = 0; c < MINES.LADO; c++) {
      const i = f * MINES.LADO + c;
      if (i === explotada) celdas.push("💥");
      else if (partida.abiertas.has(i)) celdas.push("💎");
      else if (revelar) celdas.push(partida.minas.has(i) ? "💣" : "🟩");
      else celdas.push("🟦");
    }
    filas.push(`${FILAS[f]} ${celdas.join("")}`);
  }
  return filas.join("\n");
}

function textoPartida(partida) {
  const m = partida.minas.size;
  const k = partida.abiertas.size;
  const ahora = multiplicador(m, k);
  const proxima = multiplicador(m, k + 1);
  const lineas = [`💣 *Mines* — ${partida.apuesta} UruCoins · ${m} ${m === 1 ? "mina" : "minas"}`, grilla(partida)];
  lineas.push(k === 0 ? `La primera casilla segura paga x${coma(proxima)}.` : `Seguras: ${k} · si retirás ahora cobrás x${coma(ahora)} (${premioDe(partida)}) · la próxima paga x${coma(proxima)}${proxima >= MINES.MAX_MULT ? ", el techo" : ""}.`);
  lineas.push(`\n.destapar B3 (o .destapar 8)${k > 0 ? " · .retirar" : ""} (tenés ${MINES.SEGUNDOS_DECISION} segundos)`);
  return lineas.join("\n");
}

function armarTimer(partida) {
  clearTimeout(partida.timeout);
  partida.timeout = setTimeout(() => {
    if (globalThis.partidasMines.get(clave(partida.chat, partida.usuario)) !== partida) return;
    const r = cerrar(partida, { motivo: "tiempo" });
    Promise.resolve(partida.alVencer?.({ ...r, mensaje: `⏳ ${mencion(partida.usuario)}, se te pasó el tiempo.\n${r.mensaje}`, mentions: [partida.usuario] })).catch((e) => console.error("[mines] no se pudo avisar:", e.message));
  }, MINES.SEGUNDOS_DECISION * 1000);
}
const enJuego = (partida) => {
  armarTimer(partida);
  return { ok: true, terminada: false, mensaje: textoPartida(partida) };
};

// Cashes out: pays stake times multiplier. With no tiles uncovered it returns the stake untouched.
function cerrar(partida, { motivo = "retiro" } = {}) {
  clearTimeout(partida.timeout);
  globalThis.partidasMines.delete(clave(partida.chat, partida.usuario));
  const { chat, usuario } = partida;
  const k = partida.abiertas.size;
  const premio = k === 0 ? partida.apuesta : premioDe(partida);
  ganarCoins(chat, usuario, premio, k === 0 ? "casino_mines_devolucion" : "casino_mines_premio");
  const cabecera = k === 0 ? `↩️ ${motivo === "tiempo" ? "No destapaste nada: te devuelvo" : "Retiraste sin destapar nada: te devuelvo"} los ${partida.apuesta} UruCoins.` : `💰 *${motivo === "tiempo" ? "Retiro automático" : "Retiraste"}* con ${k} ${k === 1 ? "segura" : "seguras"}: x${coma(multiplicador(partida.minas.size, k))} → cobrás *${premio}* UruCoins.`;
  return { ok: true, terminada: true, premio, mensaje: `${cabecera}\n${grilla(partida, { revelar: true })}\nTe quedan ${getSaldoCoins(chat, usuario)}.` };
}

// ---------- acciones ----------
export function iniciar(chat, usuario, apuesta, minasTexto, alVencer) {
  const k = clave(chat, usuario);
  if (globalThis.partidasMines.has(k)) return { ok: false, error: "Ya tenés una partida de Mines abierta. Seguí con .destapar o cerrala con .retirar." };
  const minas = minasTexto === undefined || minasTexto === "" ? MINES.MINAS_DEFAULT : Number(minasTexto);
  if (!Number.isInteger(minas) || minas < MINES.MINAS_MIN || minas > MINES.MINAS_MAX) return { ok: false, error: `Las minas van de ${MINES.MINAS_MIN} a ${MINES.MINAS_MAX}, por ejemplo .mines 20 3.` };
  const cobro = cobrarApuesta(chat, usuario, apuesta, "casino_mines");
  if (!cobro.ok) return cobro;
  const partida = { chat, usuario, apuesta, minas: new Set(), abiertas: new Set(), timeout: null, alVencer };
  while (partida.minas.size < minas) partida.minas.add(_rng.randomInt(0, N));
  globalThis.partidasMines.set(k, partida);
  return enJuego(partida);
}

const SIN_PARTIDA = { ok: false, error: "No tenés ninguna partida de Mines. Empezá con .mines <cantidad> [minas]" };

export function destapar(chat, usuario, casillaTexto) {
  const partida = globalThis.partidasMines.get(clave(chat, usuario));
  if (!partida) return SIN_PARTIDA;
  const i = parsearCasilla(casillaTexto);
  if (i === null) return { ok: false, error: "¿Qué casilla? Fila y columna, como B3, o el número del 1 al 25." };
  if (partida.abiertas.has(i)) return { ok: false, error: `La ${nombreCasilla(i)} ya está destapada.` };
  if (partida.minas.has(i)) {
    clearTimeout(partida.timeout);
    globalThis.partidasMines.delete(clave(chat, usuario));
    const devuelto = protegerApuesta(chat, usuario, partida.apuesta, "escudo_mines");
    const lineas = [`💥 *¡Mina en ${nombreCasilla(i)}!* Perdiste ${partida.apuesta} UruCoins.`, grilla(partida, { revelar: true, explotada: i })];
    if (devuelto) lineas.push(`🛡️ Tu escudo te devolvió ${devuelto}.`);
    lineas.push(`Te quedan ${getSaldoCoins(chat, usuario)}.`);
    return { ok: true, terminada: true, premio: 0, mensaje: lineas.join("\n") };
  }
  partida.abiertas.add(i);
  const m = partida.minas.size;
  // with no safe tiles left to uncover, or the multiplier at its cap, there is nothing more to win: it cashes out on its own
  if (partida.abiertas.size === N - m || multiplicador(m, partida.abiertas.size) >= MINES.MAX_MULT) {
    const r = cerrar(partida);
    return { ...r, mensaje: `💎 ${nombreCasilla(i)} segura, y ${partida.abiertas.size === N - m ? "no quedan más" : `llegaste al techo de x${  MINES.MAX_MULT}`}: retiro automático.\n${r.mensaje}` };
  }
  return enJuego(partida);
}

export function retirar(chat, usuario) {
  const partida = globalThis.partidasMines.get(clave(chat, usuario));
  if (!partida) return SIN_PARTIDA;
  return cerrar(partida);
}

export function estadoPartida(chat, usuario) {
  const partida = globalThis.partidasMines.get(clave(chat, usuario));
  return partida ? textoPartida(partida) : null;
}
