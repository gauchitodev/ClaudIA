// Blackjack contra la banca (Claudia), con UruCoins y los mismos topes del casino. Cada persona juega su propia
// partida, sin esperar a nadie; varias pueden jugar a la vez en el mismo grupo.
// Reglas: mazo nuevo mezclado en cada partida; la banca pide hasta 17 y se planta (también con 17 blando);
// blackjack natural paga 2.5, ganar paga 2, empate devuelve. Casos especiales:
// - Doblar: solo con las dos primeras cartas de una mano; pone otra apuesta igual, saca una carta y se planta.
// - Dividir: con dos cartas del mismo valor (los dieces entre sí también) se abren dos manos con otra apuesta igual;
//   una sola división; los ases divididos reciben una carta cada uno y se plantan; un 21 de mano dividida no es blackjack.
// - Seguro: si la banca muestra un as, antes de jugar se puede asegurar por la mitad de la apuesta; paga 2 a 1 si la
//   banca tiene blackjack, y se pierde si no. La banca "mira" su carta tapada recién con la primera decisión.
// - Rendirse: con las dos primeras cartas, se recupera la mitad de la apuesta y termina la mano.
// La partida vive en memoria: si no se decide en SEGUNDOS_DECISION, todas las manos abiertas se plantan solas.
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

// saca la próxima carta; si el mazo se agotara, abre uno nuevo (con 52 cartas por partida no pasa, es solo defensa)
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

// ---------- estado y mensajes ----------
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

// pasa a la siguiente mano abierta, o resuelve si no queda ninguna
function avanzar(partida) {
  const siguiente = partida.manos.findIndex((h) => !h.cerrada);
  if (siguiente < 0) return resolver(partida);
  partida.actual = siguiente;
  return enJuego(partida);
}

// La banca mira su carta tapada (cuando mostró un as, recién con la primera decisión). Devuelve el resultado
// si tenía blackjack, o null para seguir jugando.
function mirarCartaTapada(partida) {
  if (!partida.ofreceSeguro) return null;
  partida.ofreceSeguro = false;
  if (bancaTieneBlackjack(partida)) return resolver(partida);
  return null;
}

// ---------- acciones ----------
// Reparte una partida nueva. "alVencer(resultado)" se llama si se acaba el tiempo. "mazo" solo se pasa en pruebas.
export function repartir(chat, usuario, cantidad, alVencer, mazo = mazoNuevo()) {
  const k = clave(chat, usuario);
  if (globalThis.manosBlackjack.has(k)) return { ok: false, error: "Ya tenés una mano en juego. Decidí con .pedir, .plantarse, .doblar, .dividir, .seguro o .rendirse." };
  const cobro = cobrarApuesta(chat, usuario, cantidad, "casino_blackjack");
  if (!cobro.ok) return cobro;

  const partida = { chat, usuario, mazo, banca: [], manos: [{ cartas: [], cantidad, doblo: false, cerrada: false, dividida: false, deAses: false }], actual: 0, seguro: 0, ofreceSeguro: false, timeout: null, alVencer };
  partida.manos[0].cartas.push(sacarCarta(partida), sacarCarta(partida));
  partida.banca.push(sacarCarta(partida), sacarCarta(partida));

  if (esNatural(partida.manos[0])) return resolver(partida); // blackjack natural: se resuelve en el acto
  if (partida.banca[0].v === "A") partida.ofreceSeguro = true; // la banca mira su carta recién después del seguro
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
    mano.cerrada = true; // con 21 no tiene sentido seguir; con más de 21 se pasó
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
  const r = mirarCartaTapada(partida);
  if (r) return r;
  const cobro = cobrarApuesta(chat, usuario, mano.cantidad, "casino_blackjack");
  if (!cobro.ok) return { ok: false, error: `Para doblar hay que poner otros ${mano.cantidad}. ${cobro.error}` };
  mano.cantidad *= 2;
  mano.doblo = true;
  mano.cartas.push(sacarCarta(partida)); // una sola carta más y se planta
  mano.cerrada = true;
  return avanzar(partida);
}

export function dividir(chat, usuario) {
  const partida = partidaDe(chat, usuario);
  if (!partida) return SIN_MANO;
  const mano = partida.manos[0];
  if (!puedeDividir(partida, mano)) return { ok: false, error: partida.manos.length > 1 ? "Ya dividiste; se divide una sola vez." : "Solo se puede dividir con dos cartas del mismo valor (por ejemplo 8♠ 8♦, o K♥ 10♣)." };
  const r = mirarCartaTapada(partida);
  if (r) return r;
  const cobro = cobrarApuesta(chat, usuario, mano.cantidad, "casino_blackjack");
  if (!cobro.ok) return { ok: false, error: `Para dividir hay que poner otros ${mano.cantidad}. ${cobro.error}` };
  const deAses = mano.cartas[0].v === "A";
  const [c1, c2] = mano.cartas;
  partida.manos = [
    { cartas: [c1, sacarCarta(partida)], cantidad: mano.cantidad, doblo: false, cerrada: deAses, dividida: true, deAses },
    { cartas: [c2, sacarCarta(partida)], cantidad: mano.cantidad, doblo: false, cerrada: deAses, dividida: true, deAses },
  ];
  partida.actual = 0;
  if (deAses) return resolver(partida); // una carta cada uno y se plantan
  return enJuego(partida);
}

export function seguro(chat, usuario) {
  const partida = partidaDe(chat, usuario);
  if (!partida) return SIN_MANO;
  if (!partida.ofreceSeguro) return { ok: false, error: partida.seguro > 0 ? "Ya tomaste el seguro." : "El seguro solo se puede tomar cuando la banca muestra un as, antes de jugar." };
  const costo = costoSeguro(partida);
  const cobro = cobrarApuesta(chat, usuario, costo, "casino_blackjack_seguro", { minimo: 1 }); // vale la mitad de una apuesta que ya pasó el mínimo
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
  if (r) return r; // con blackjack de la banca no hay rendición
  clearTimeout(partida.timeout);
  globalThis.manosBlackjack.delete(clave(chat, usuario));
  const devuelto = Math.floor(mano.cantidad / 2);
  if (devuelto > 0) ganarCoins(chat, usuario, devuelto, "casino_blackjack_rendicion");
  return { ok: true, terminada: true, premio: devuelto, mensaje: `🏳️ Te rendiste con ${textoMano(mano.cartas)} contra ${textoCarta(partida.banca[0])}. Recuperás ${devuelto} de ${mano.cantidad}. Te quedan ${getSaldoCoins(chat, usuario)}.` };
}

// ---------- cierre ----------
// Juega la banca si corresponde, paga cada mano y el seguro, y arma el mensaje final.
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
  const perdidas = []; // lo apostado en cada mano perdida, para el escudo
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
  if (perdidas.length) {
    const devuelto = protegerApuesta(chat, usuario, perdidas[0]);
    if (devuelto) {
      premio += devuelto;
      lineas.push(`🛡️ Tu escudo te devolvió los ${devuelto} de la mano perdida.`);
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
