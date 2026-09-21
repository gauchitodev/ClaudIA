import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, esperar, fijarSaldo } from "./helpers.mjs";
import { COINS } from "../lib/urucoins.js";

let F, C, K;
before(async () => {
  ({ F } = await prepararBase("casino"));
  C = await import("../lib/casino.js");
  K = await import("../lib/carrera.js");
  COINS.CASINO_TOPE_DIA = 1e9; // the tests play many times as the same person
});
const saldo = (u) => F.getSaldoCoins(G, u);
const cargar = (u, n) => fijarSaldo(F, G, u, n);

test("ruleta: interpreta todas las apuestas y rechaza las inválidas", () => {
  const I = C.interpretarApuestaRuleta;
  const casos = [["rojo", "rojo", 2, 1, 2], ["Negro", "negro", 2, 2, 1], ["par", "par", 2, 2, 0], ["impar", "impar", 2, 1, 0], ["1-18", "1-18", 2, 18, 19], ["19-36", "19-36", 2, 36, 0], ["13-24", "la docena 13-24", 3, 13, 12], ["columna 2", "la columna 2", 3, 17, 18], ["0", "el 0", 36, 0, 1], ["verde", "el 0", 36, 0, 1], ["Cero", "el 0", 36, 0, 5], ["17-18", "caballo 17-18", 18, 18, 19], ["17-20", "caballo 17-20", 18, 20, 23], ["0-1", "caballo 0-1", 18, 0, 2], ["16-17-18", "calle 16-17-18", 12, 16, 19], ["0-2-3", "calle 0-2-3", 12, 0, 1], ["17-18-20-21", "cuadro 17-18-20-21", 9, 21, 19], ["0-1-2-3", "cuadro 0-1-2-3", 9, 0, 4], ["16-17-18-19-20-21", "seisena 16-17-18-19-20-21", 6, 21, 22], ["18, 17", "caballo 17-18", 18, 17, 16]];
  for (const [t, nombre, paga, gana, noGana] of casos) {
    const a = I(t);
    assert.equal(a?.nombre, nombre, t);
    assert.equal(a.paga, paga, t);
    assert.ok(a.gana(gana) && !a.gana(noGana), t);
  }
  for (const t of ["18-19", "0-4", "17-18-19", "18-19-21-22", "1-2-3-4", "5-5"]) assert.match(I(t).error, /no van juntos/);
  assert.match(I("17-40").error, /0 al 36/);
  assert.equal(I("azul"), null);
  for (const [t, n] of [["17-18", 2], ["16-17-18", 3], ["17-18-20-21", 4], ["16-17-18-19-20-21", 6], ["columna 2", 12]]) assert.ok(Math.abs((n * I(t).paga) / 37 - 0.973) < 0.001);
});

test("ruleta: la mesa junta apuestas y liquida con una sola bola", async () => {
  C._rng.randomInt = () => 17;
  C.CASINO.RULETA_SEGUNDOS = 0.05;
  for (const u of ["a", "b", "c", "d"]) cargar(u, 200);
  let resultado = null;
  const alCerrar = (r) => (resultado = r);
  const r1 = C.apostarRuleta(G, "a", 20, "rojo", alCerrar);
  assert.ok(r1.ok && r1.abrio && /Se abrió la mesa/.test(r1.mensaje));
  assert.match(C.apostarRuleta(G, "b", 30, "17", alCerrar).mensaje, /apostó 30 al 17/);
  C.apostarRuleta(G, "c", 10, "impar", alCerrar);
  C.apostarRuleta(G, "d", 15, "13-24", alCerrar);
  C.apostarRuleta(G, "a", 10, "negro", alCerrar);
  let aceptadas = 0;
  for (let i = 0; i < 4; i++) if (C.apostarRuleta(G, "a", 5, "par", alCerrar).ok) aceptadas++;
  assert.equal(aceptadas, 3, "tope de 5 apuestas por persona");
  assert.match(C.apostarRuleta(G, "d", 10, "18-19", alCerrar).error, /no van juntos/);
  assert.equal(C.textoMesaRuleta(G).mentions.length, 4);
  await esperar(150);
  assert.equal(resultado.numero, 17);
  assert.equal(saldo("a"), 175);
  assert.equal(saldo("b"), 1250);
  assert.equal(saldo("c"), 210);
  assert.equal(saldo("d"), 230);
  assert.match(resultado.texto, /La mesa pagó 1165 UruCoins/);
  assert.equal(C.textoMesaRuleta(G), null);
});

test("tragamonedas: cinco líneas, diagonal de diamantes y esperanza", () => {
  const secuencia = [15, 0, 5, 0, 15, 9, 5, 9, 15];
  let i = 0;
  C._rng.randomInt = () => secuencia[i++ % secuencia.length];
  cargar("u", 100);
  const r = C.jugarTragamonedas(G, "u", 50);
  assert.equal(r.mensaje, "🎰 *TRAGAMONEDAS* · 50 UruCoins\n💎 | 🍒 | 🍋\n🍒 | 💎 | 🍊\n🍋 | 🍊 | 💎\n\n▸ Diagonal ↘: 💎 💎 💎 → ¡tres 💎! x40\nCobrás *2000* UruCoins: ganás 1950. Te quedan 2050.");
  assert.equal(saldo("u"), 100 - 50 + 2000);
  const { randomInt } = await_crypto();
  C._rng.randomInt = randomInt;
  let gastado = 0;
  let ganado = 0;
  for (let k = 0; k < 1500; k++) {
    cargar("z", 1e6);
    C.jugarTragamonedas(G, "z", 50);
    gastado += 50;
    ganado += saldo("z") - 1e6 + 50;
  }
  const ev = ganado / gastado;
  assert.ok(ev > 0.6 && ev < 1.3, `esperanza ${ev.toFixed(3)} (con 1500 tiradas es solo una prueba de cordura; la fina está en el historial de desarrollo)`);
});

test("tragamonedas: dice la verdad cuando cobrás menos de lo apostado, y redondea justo", () => {
  // row 1 with two cherries and nothing else: pays 0.4 of the bet
  const dosCerezas = [0, 5, 9, 0, 12, 5, 5, 9, 12];
  let i = 0;
  C._rng.randomInt = () => dosCerezas[i++ % dosCerezas.length];
  cargar("v", 100);
  assert.equal(C.jugarTragamonedas(G, "v", 50).mensaje, "🎰 *TRAGAMONEDAS* · 50 UruCoins\n🍒 | 🍒 | 🍋\n🍋 | 🔔 | 🍊\n🍊 | 🍋 | 🔔\n\n▸ Fila 1: 🍒 🍒 🍋 → dos cerezas x0,4\nCobrás *20* UruCoins: perdés 30. Te quedan 70.", "grilla limpia y la línea que pagó repetida abajo con sus símbolos");
  i = 0;
  assert.match(C.jugarTragamonedas(G, "v", 7).mensaje, /Cobrás \*3\* UruCoins: perdés 4\./, "7 x 0,4 = 2,8 se redondea a 3, no se trunca a 2");
  assert.equal(saldo("v"), 70 - 7 + 3);
  // row 1 with three cherries: pays the bet exactly
  const tresCerezas = [0, 5, 9, 0, 12, 5, 0, 9, 12];
  i = 0;
  C._rng.randomInt = () => tresCerezas[i++ % tresCerezas.length];
  assert.match(C.jugarTragamonedas(G, "v", 50).mensaje, /\n\n▸ Fila 1: 🍒 🍒 🍒 → ¡tres 🍒! x1\nCobrás \*50\* UruCoins: recuperás la apuesta\. Te quedan 66\.$/);
  assert.equal(C.textoPagosTragamonedas(), "Se juegan 5 líneas a la vez, las tres filas y las dos diagonales, y cada una paga sobre la apuesta entera: 🍒🍒🍒 x1 · 🍋🍋🍋 x1,6 · 🍊🍊🍊 x3 · 🔔🔔🔔 x8 · ⭐⭐⭐ x20 · 💎💎💎 x40 · 🍒🍒 x0,4. Los premios de las líneas se suman.");
});

test("la ayuda del casino no nombra el tope diario si está apagado", () => {
  const guardado = COINS.CASINO_TOPE_DIA;
  COINS.CASINO_TOPE_DIA = 0;
  assert.equal(C.textoLimitesCasino("jugada"), "Mínimo 5 por jugada, máximo 100 o el 20 % de tu saldo, lo que sea mayor. La racha doble no aplica en el casino; el escudo sí, te devuelve una apuesta perdida (hasta 25).");
  COINS.CASINO_TOPE_DIA = 500;
  assert.match(C.textoLimitesCasino("mano"), /^Mínimo 5 por mano, máximo 100 o el 20 % de tu saldo, lo que sea mayor, tope 500 por día en el casino\. La racha/);
  COINS.CASINO_TOPE_DIA = guardado;
});

test("casino: límites de apuesta y tope diario", () => {
  cargar("l", 1000);
  assert.match(C.jugarTragamonedas(G, "l", 4).error, /mínima/);
  // the maximum is 100 or 20 % of the balance, whichever is larger: with 1000 that's 200
  assert.match(C.jugarTragamonedas(G, "l", 201).error, /Tu apuesta máxima en el casino es 200 UruCoins \(100 o el 20 % de tu saldo, lo que sea mayor\)/);
  cargar("p", 100);
  assert.match(C.jugarTragamonedas(G, "p", 101).error, /máxima en el casino es 100 UruCoins/);
  assert.ok(C.jugarTragamonedas(G, "p", 100).ok);
  cargar("l", 1000);
  const gastadoHoy = F.coinsGastadasHoy(G, "l", "casino_");
  assert.equal(gastadoHoy, 0);
});

test("carrera: cuotas, apuestas, narración y pago", async () => {
  K._rng.randomInt = (min) => min;
  K.CARRERA.SEGUNDOS = 0.05;
  for (const u of ["a", "b"]) cargar(u, 100);
  let largada = null;
  const r1 = K.apostarCarrera(G, "a", 20, "1", (x) => (largada = x));
  assert.ok(r1.abre && /Relámpago x4\.6/.test(r1.mensaje));
  assert.match(K.apostarCarrera(G, "b", 30, "tormenta", (x) => (largada = x)).mensaje, /apostó 30 a Tormenta/);
  assert.match(K.apostarCarrera(G, "b", 5, "pegaso", () => {}).error, /¿A qué caballo\?/);
  await esperar(150);
  assert.equal(largada.cuadros.length, 3);
  assert.match(largada.cuadros[2], /Ganó 🏇 Relámpago/);
  assert.equal(saldo("a"), 80 + 92);
  assert.equal(saldo("b"), 70);
  assert.equal(K.textoCarrera(G), null);
});

function await_crypto() {
  return { randomInt: (min, max) => (max === undefined ? Math.floor(Math.random() * min) : min + Math.floor(Math.random() * (max - min))) };
}
