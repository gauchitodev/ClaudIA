// Blackjack against the house (Claudia), with UruCoins and the same casino caps. Each person plays their own hand,
// waiting for nobody; several can play at once in the same group.
// Rules: a fresh shuffled deck each game; the house hits up to 17 and stands (on soft 17 too);
// blackjack natural paga 2.5, ganar paga 2, empate devuelve. Casos especiales:
// - Double: only on a hand's first two cards; it puts up an equal bet, draws one card and stands.
// - Split: with two cards of the same value (tens among themselves too) it opens two hands with an equal bet;
//   one split only; split aces get one card each and stand; a 21 on a split hand is not a blackjack.
// - Insurance: if the house shows an ace, before playing you can insure for half the bet; it pays 2 to 1 if the
//   house has blackjack, and is lost otherwise. The house "peeks" at its hole card only on the first decision.
// - Surrender: on the first two cards, half the bet comes back and the hand ends.
// The game lives in memory: with no decision within SEGUNDOS_DECISION, every open hand stands on its own.
import { randomInt } from "crypto";
import { ganarCoins, getSaldoCoins } from "../database-functions.js";
import { cobrarApuesta } from "./casino.js";
import { protegerApuesta } from "./tienda.js";

export const BLACKJACK = { SEGUNDOS_DECISION: 60, PAGA_BLACKJACK: 2.5, PAGA_GANA: 2, PAGA_SEGURO: 3 };
if (!globalThis.manosBlackjack) globalThis.manosBlackjack = new Map(); // "chat|usuario" -> partida

const PALOS = ["♠", "♥", "♦", "♣"];
const VALORES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const clave = (chat, usuario) => `${chat}|${usuario}`;
const mencion = (lid) => `@${lid.split("@")[0]}`;
const valor10 = (c) => ["10", "J", "Q", "K"].includes(c.v);
const mismoValor = (a, b) => a.v === b.v || (valor10(a) && valor10(b));

export function mazoNuevo() {
  const mazo = [];
  for (const p of PALOS) for (const v of VALORES) mazo.push({ v, p });
  for (let i = mazo.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [mazo[i], mazo[j]] = [mazo[j], mazo[i]];
  }
  return mazo;
}

export function valorMano(cartas) {
  let total = 0;
  let ases = 0;
  for (const c of cartas) {
    if (c.v === "A") {
      ases++;
      total += 11;
    } else if (valor10(c)) total += 10;
    else total += Number(c.v);
  }
  while (total > 21 && ases > 0) {
    total -= 10;
    ases--;
  }
  return { total, blando: ases > 0 };
}

// draws the next card; if the deck ran out it opens a new one (with 52 cards a game that can't happen, it's just defensive)
const sacarCarta = (partida) => {
  if (!partida.mazo.length) partida.mazo = mazoNuevo();
  return partida.mazo.pop();
};
const esNatural = (mano) => !mano.dividida && mano.cartas.length === 2 && valorMano(mano.cartas).total === 21;
const bancaTieneBlackjack = (partida) => partida.banca.length === 2 && valorMano(partida.banca).total === 21;
const textoCarta = (c) => `${c.v}${c.p}`;
export function textoMano(cartas) {
  const { total, blando } = valorMano(cartas);
  return `${cartas.map(textoCarta).join(" ")} (${total}${blando ? " blando" : ""})`;
}

// ---------- state and messages ----------
function puedeDoblar(partida, mano) {
  return !mano.cerrada && mano.cartas.length === 2 && !mano.deAses;
}
function puedeDividir(partida, mano) {
  return partida.manos.length === 1 && mano.cartas.length === 2 && mismoValor(mano.cartas[0], mano.cartas[1]);
}
function puedeRendirse(partida, mano) {
  return partida.manos.length === 1 && mano.cartas.length === 2 && !mano.doblo;
}
const costoSeguro = (partida) => Math.max(1, Math.floor(partida.manos[0].cantidad / 2));

function textoPartida(partida) {
  const apuestas = partida.manos.map((h) => h.cantidad).join(" + ");
  const lineas = [`🃏 *Blackjack* — ${apuestas} UruCoins${partida.manos.some((h) => h.doblo) ? " (doblada)" : ""}`];
  if (partida.manos.length === 1) lineas.push(`Vos: ${textoMano(partida.manos[0].cartas)}`);
  else partida.manos.forEach((h, i) => lineas.push(`${i === partida.actual && !h.cerrada ? "▶ " : "   "}Mano ${i + 1}: ${textoMano(h.cartas)}${h.cerrada ? " ✔" : ""}`));
  lineas.push(`Banca: ${textoCarta(partida.banca[0])} ?`);
  if (partida.ofreceSeguro) lineas.push(`La banca muestra un as: podés pedir .seguro (cuesta ${costoSeguro(partida)}, paga 2 a 1 si tiene blackjack) o seguir jugando.`);
  const mano = partida.manos[partida.actual];
  const opciones = [".pedir", ".plantarse"];
  if (puedeDoblar(partida, mano)) opciones.push(".doblar");
  if (puedeDividir(partida, mano)) opciones.push(".dividir");
  if (puedeRendirse(partida, mano)) opciones.push(".rendirse");
  lineas.push(`\n${opciones.join(" · ")} (tenés ${BLACKJACK.SEGUNDOS_DECISION} segundos)`);
  return lineas.join("\n");
}

function armarTimer(partida) {
  clearTimeout(partida.timeout);
  partida.timeout = setTimeout(() => {
    if (globalThis.manosBlackjack.get(clave(partida.chat, partida.usuario)) !== partida) return;
    for (const h of partida.manos) h.cerrada = true;
    const r = resolver(partida);
    Promise.resolve(partida.alVencer?.({ ...r, mensaje: `⏳ ${mencion(partida.usuario)}, se te pasó el tiempo: te plantaste.\n${r.mensaje}`, mentions: [partida.usuario] })).catch((e) => console.error("[blackjack] no se pudo avisar:", e.message));
  }, BLACKJACK.SEGUNDOS_DECISION * 1000);
}

const enJuego = (partida) => {
  armarTimer(partida);
  return { ok: true, terminada: false, mensaje: textoPartida(partida) };
};

// moves on to the next open hand, or settles if none are left
function avanzar(partida) {
  const siguiente = partida.manos.findIndex((h) => !h.cerrada);
  if (siguiente < 0) return resolver(partida);
  partida.actual = siguiente;
  return enJuego(partida);
}

// The house peeks at its hole card (when it showed an ace, only on the first decision). Returns the result if it
// had blackjack, or null to keep playing.
function mirarCartaTapada(partida) {
  if (!partida.ofreceSeguro) return null;
  partida.ofreceSeguro = false;
  if (bancaTieneBlackjack(partida)) return resolver(partida);
  return null;
}

// Second bet of a hand (doubling, splitting): the house peeks at its hole card and then the bet is charged.
// If the charge fails the action never happened, so the insurance offer is put back: otherwise a .doblar rejected for
// lack of funds silently cost the player the right to insure against an ace they can see on the table.
function cobrarSegundaApuesta(partida, mano, accion) {
  const ofrecia = partida.ofreceSeguro;
  const resuelta = mirarCartaTapada(partida);
  if (resuelta) return { resuelta };
  // Its own reason, so one hand isn't counted as several plays: .timba used to see the initial bet, the double, the
  // split and the insurance as four separate plays of blackjack.
  const cobro = cobrarApuesta(partida.chat, partida.usuario, mano.cantidad, accion === "doblar" ? "casino_blackjack_doblar" : "casino_blackjack_dividir");
  if (!cobro.ok) {
    partida.ofreceSeguro = ofrecia;
    return { error: `Para ${accion} hay que poner otros ${mano.cantidad}. ${cobro.error}` };
  }
  return {};
}

// ---------- acciones ----------
// Deals a new game. "alVencer(resultado)" is called if the time runs out. "mazo" is only passed in tests.
export function repartir(chat, usuario, cantidad, alVencer, mazo = mazoNuevo()) {
  const k = clave(chat, usuario);
  if (globalThis.manosBlackjack.has(k)) return { ok: false, error: "Ya tenés una mano en juego. Decidí con .pedir, .plantarse, .doblar, .dividir, .seguro o .rendirse." };
  const cobro = cobrarApuesta(chat, usuario, cantidad, "casino_blackjack");
  if (!cobro.ok) return cobro;

  const partida = { chat, usuario, mazo, banca: [], manos: [{ cartas: [], cantidad, doblo: false, cerrada: false, dividida: false, deAses: false }], actual: 0, seguro: 0, ofreceSeguro: false, timeout: null, alVencer };
  partida.manos[0].cartas.push(sacarCarta(partida), sacarCarta(partida));
  partida.banca.push(sacarCarta(partida), sacarCarta(partida));

  if (esNatural(partida.manos[0])) return resolver(partida); // natural blackjack: settled on the spot
  if (partida.banca[0].v === "A") partida.ofreceSeguro = true; // the house peeks only after insurance
  else if (bancaTieneBlackjack(partida)) return resolver(partida);
  globalThis.manosBlackjack.set(k, partida);
  return enJuego(partida);
}

export function estadoMano(chat, usuario) {
  const partida = globalThis.manosBlackjack.get(clave(chat, usuario));
  return partida ? textoPartida(partida) : null;
}

const SIN_MANO = { ok: false, error: "No tenés ninguna mano en juego. Empezá con .blackjack <cantidad>" };
const partidaDe = (chat, usuario) => globalThis.manosBlackjack.get(clave(chat, usuario));

export function pedir(chat, usuario) {
  const partida = partidaDe(chat, usuario);
  if (!partida) return SIN_MANO;
  const r = mirarCartaTapada(partida);
  if (r) return r;
  const mano = partida.manos[partida.actual];
  mano.cartas.push(sacarCarta(partida));
  if (valorMano(mano.cartas).total >= 21) {
    mano.cerrada = true; // at 21 there's no point going on; over 21 it's a bust
    return avanzar(partida);
  }
  return enJuego(partida);
}

export function plantarse(chat, usuario) {
  const partida = partidaDe(chat, usuario);
  if (!partida) return SIN_MANO;
  const r = mirarCartaTapada(partida);
  if (r) return r;
  partida.manos[partida.actual].cerrada = true;
  return avanzar(partida);
}

export function doblar(chat, usuario) {
  const partida = partidaDe(chat, usuario);
  if (!partida) return SIN_MANO;
  const mano = partida.manos[partida.actual];
  if (!puedeDoblar(partida, mano)) return { ok: false, error: mano.deAses ? "Los ases divididos reciben una sola carta, no se puede doblar." : "Solo se puede doblar con las dos primeras cartas de la mano." };
  const paso = cobrarSegundaApuesta(partida, mano, "doblar");
  if (paso.resuelta) return paso.resuelta;
  if (paso.error) return { ok: false, error: paso.error };
  mano.cantidad *= 2;
  mano.doblo = true;
  mano.cartas.push(sacarCarta(partida)); // one more card and it stands
  mano.cerrada = true;
  return avanzar(partida);
}

export function dividir(chat, usuario) {
  const partida = partidaDe(chat, usuario);
  if (!partida) return SIN_MANO;
  const mano = partida.manos[0];
  if (!puedeDividir(partida, mano)) return { ok: false, error: partida.manos.length > 1 ? "Ya dividiste; se divide una sola vez." : "Solo se puede dividir con dos cartas del mismo valor (por ejemplo 8♠ 8♦, o K♥ 10♣)." };
  const paso = cobrarSegundaApuesta(partida, mano, "dividir");
  if (paso.resuelta) return paso.resuelta;
  if (paso.error) return { ok: false, error: paso.error };
  const deAses = mano.cartas[0].v === "A";
  const [c1, c2] = mano.cartas;
  partida.manos = [
    { cartas: [c1, sacarCarta(partida)], cantidad: mano.cantidad, doblo: false, cerrada: deAses, dividida: true, deAses },
    { cartas: [c2, sacarCarta(partida)], cantidad: mano.cantidad, doblo: false, cerrada: deAses, dividida: true, deAses },
  ];
  partida.actual = 0;
  if (deAses) return resolver(partida); // one card each and they stand
  return enJuego(partida);
}

export function seguro(chat, usuario) {
  const partida = partidaDe(chat, usuario);
  if (!partida) return SIN_MANO;
  if (!partida.ofreceSeguro) {
    if (partida.seguro > 0) return { ok: false, error: "Ya tomaste el seguro." };
    // With an ace showing, the real reason is that the hand already started: saying "only when the dealer shows an
    // ace" contradicted what the player has on screen.
    if (partida.banca[0].v === "A") return { ok: false, error: "El seguro se pide antes de la primera decisión de la mano." };
    return { ok: false, error: "El seguro solo se puede tomar cuando la banca muestra un as." };
  }
  const costo = costoSeguro(partida);
  const cobro = cobrarApuesta(chat, usuario, costo, "casino_blackjack_seguro", { minimo: 1 }); // it is half a bet that already cleared the minimum
  if (!cobro.ok) return { ok: false, error: `El seguro cuesta ${costo}. ${cobro.error}` };
  partida.seguro = costo;
  const r = mirarCartaTapada(partida);
  if (r) return r;
  return { ...enJuego(partida), mensaje: `🛡️ La banca no tenía blackjack: el seguro (${costo}) se pierde y seguís jugando.\n\n${textoPartida(partida)}` };
}

export function rendirse(chat, usuario) {
  const partida = partidaDe(chat, usuario);
  if (!partida) return SIN_MANO;
  const mano = partida.manos[0];
  if (!puedeRendirse(partida, mano)) return { ok: false, error: "Solo podés rendirte con las dos primeras cartas, antes de pedir, doblar o dividir." };
  const r = mirarCartaTapada(partida);
  if (r) return r; // no surrender once the house has blackjack
  clearTimeout(partida.timeout);
  globalThis.manosBlackjack.delete(clave(chat, usuario));
  const devuelto = Math.floor(mano.cantidad / 2);
  if (devuelto > 0) ganarCoins(chat, usuario, devuelto, "casino_blackjack_rendicion");
  return { ok: true, terminada: true, premio: devuelto, mensaje: `🏳️ Te rendiste con ${textoMano(mano.cartas)} contra ${textoCarta(partida.banca[0])}. Recuperás ${devuelto} de ${mano.cantidad}. Te quedan ${getSaldoCoins(chat, usuario)}.` };
}

// ---------- cierre ----------
// Plays out the house if needed, pays each hand and the insurance, and builds the final message.
function resolver(partida) {
  clearTimeout(partida.timeout);
  globalThis.manosBlackjack.delete(clave(partida.chat, partida.usuario));
  const { chat, usuario } = partida;
  const bjBanca = bancaTieneBlackjack(partida);
  const hayManoViva = partida.manos.some((h) => valorMano(h.cartas).total <= 21 && !esNatural(h));
  if (!bjBanca && hayManoViva) {
    while (valorMano(partida.banca).total < 17) partida.banca.push(sacarCarta(partida));
  }
  const b = valorMano(partida.banca).total;

  const lineas = [];
  let premio = 0;
  const perdidas = []; // what was bet on each losing hand, for the shield
  for (const [i, mano] of partida.manos.entries()) {
    const j = valorMano(mano.cartas).total;
    const natural = esNatural(mano);
    let resultado;
    let paga = 0;
    if (j > 21) resultado = "te pasaste 💥";
    else if (natural && bjBanca) {
      resultado = "blackjack los dos: empate";
      paga = mano.cantidad;
    } else if (natural) {
      resultado = "¡BLACKJACK! 🃏";
      paga = Math.floor(mano.cantidad * BLACKJACK.PAGA_BLACKJACK);
    } else if (bjBanca) resultado = "blackjack de la banca 😬";
    else if (b > 21) {
      resultado = "la banca se pasó, ¡ganaste!";
      paga = mano.cantidad * BLACKJACK.PAGA_GANA;
    } else if (j > b) {
      resultado = "¡ganaste!";
      paga = mano.cantidad * BLACKJACK.PAGA_GANA;
    } else if (j === b) {
      resultado = "empate, se devuelve";
      paga = mano.cantidad;
    } else resultado = "ganó la banca";
    if (paga > 0) ganarCoins(chat, usuario, paga, paga === mano.cantidad ? "casino_blackjack_empate" : "casino_blackjack_premio");
    else perdidas.push(mano.cantidad);
    premio += paga;
    const etiqueta = partida.manos.length > 1 ? `Mano ${i + 1}: ${textoMano(mano.cartas)}` : `Vos: ${textoMano(mano.cartas)}`;
    lineas.push(`${etiqueta} — ${resultado}${paga > mano.cantidad ? `, cobrás ${paga}` : ""}${mano.doblo ? " (doblada)" : ""}`);
  }
  // The shield covers what was lost on the whole play, not just one hand: the item promises "lo apostado", and after a
  // split that is both hands. Its refund cap (and therefore the economy) doesn't move — with bets of 25 or more the
  // result is identical either way, and a player can never hold two shields (max: 1) to cover them separately.
  if (perdidas.length) {
    const devuelto = protegerApuesta(
      chat,
      usuario,
      perdidas.reduce((total, n) => total + n, 0),
      "escudo_blackjack",
    );
    if (devuelto) {
      premio += devuelto;
      lineas.push(`🛡️ Tu escudo te devolvió los ${devuelto} de ${perdidas.length > 1 ? "lo que perdiste" : "la mano perdida"}.`);
    }
  }
  if (partida.seguro > 0) {
    if (bjBanca) {
      const pagaSeguro = partida.seguro * BLACKJACK.PAGA_SEGURO;
      ganarCoins(chat, usuario, pagaSeguro, "casino_blackjack_seguro_premio");
      premio += pagaSeguro;
      lineas.push(`🛡️ El seguro pagó ${pagaSeguro}.`);
    }
  }
  const apuestas = partida.manos.map((h) => h.cantidad).join(" + ");
  return {
    ok: true,
    terminada: true,
    premio,
    mensaje: `🃏 *Blackjack* — ${apuestas} UruCoins\n${lineas.join("\n")}\nBanca: ${textoMano(partida.banca)}\n\nTe quedan ${getSaldoCoins(chat, usuario)}.`,
  };
}
