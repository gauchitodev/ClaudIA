import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, esperar, fijarSaldo } from "./helpers.mjs";
import { COINS } from "../lib/urucoins.js";

let F, X;
before(async () => {
  ({ F } = await prepararBase("mines"));
  X = await import("../lib/mines.js");
  COINS.CASINO_TOPE_DIA = 1e9;
});
const saldo = () => F.getSaldoCoins(G, "u");
const nueva = (n = 100) => {
  for (const p of globalThis.partidasMines.values()) clearTimeout(p.timeout);
  globalThis.partidasMines.clear();
  fijarSaldo(F, G, "u", n);
};
// mines on the tiles the list names, in order
const minasEn = (...indices) => {
  let i = 0;
  X._rng.randomInt = () => indices[i++ % indices.length];
};

test("mines: multiplicadores justos con 3 % para la banca y techo, y casillas por nombre o número", () => {
  assert.equal(X.multiplicador(3, 0), 1);
  assert.equal(X.multiplicador(3, 1).toFixed(2), "1.10");
  assert.equal(X.multiplicador(3, 5).toFixed(2), "1.96");
  assert.equal(X.multiplicador(10, 3).toFixed(2), "4.90");
  assert.equal(X.multiplicador(24, 1).toFixed(2), "24.25");
  assert.equal(X.multiplicador(3, 22), X.MINES.MAX_MULT, "el tablero casi entero pagaría 2231, se corta en el techo");
  assert.equal(X.parsearCasilla("B3"), 7);
  assert.equal(X.parsearCasilla("3b"), 7);
  assert.equal(X.parsearCasilla("a1"), 0);
  assert.equal(X.parsearCasilla("E5"), 24);
  assert.equal(X.parsearCasilla("8"), 7);
  assert.equal(X.parsearCasilla("25"), 24);
  for (const t of ["F1", "A6", "0", "26", "B", "hola"]) assert.equal(X.parsearCasilla(t), null, t);
});

test("mines: destapar seguras sube el multiplicador, retirar paga, la mina pierde y el escudo devuelve", () => {
  nueva();
  minasEn(0, 1, 2); // A1, A2, A3
  let r = X.iniciar(G, "u", 20, "3", null);
  assert.ok(r.ok && !r.terminada);
  assert.equal(saldo(), 80);
  assert.match(r.mensaje, /^💣 \*Mines\* — 20 UruCoins · 3 minas\n {3}1️⃣2️⃣3️⃣4️⃣5️⃣\nA 🟦🟦🟦🟦🟦\n/);
  assert.match(r.mensaje, /La primera casilla segura paga x1,10\./);
  assert.match(X.iniciar(G, "u", 20, "3", null).error, /Ya tenés una partida/);
  assert.match(X.destapar(G, "u", "Z9").error, /¿Qué casilla\?/);
  r = X.destapar(G, "u", "B1");
  assert.match(r.mensaje, /B 💎🟦🟦🟦🟦\n[\s\S]*Seguras: 1 · si retirás ahora cobrás x1,10 \(22\) · la próxima paga x1,26\./);
  assert.match(X.destapar(G, "u", "B1").error, /ya está destapada/);
  for (const c of ["B2", "B3", "B4", "B5"]) assert.ok(X.destapar(G, "u", c).ok);
  r = X.retirar(G, "u");
  assert.ok(r.terminada);
  assert.equal(r.premio, 39, "5 seguras con 3 minas: x1,96 sobre 20");
  assert.match(r.mensaje, /^💰 \*Retiraste\* con 5 seguras: x1,96 → cobrás \*39\* UruCoins\.\n {3}1️⃣2️⃣3️⃣4️⃣5️⃣\nA 💣💣💣🟩🟩\nB 💎💎💎💎💎\nC 🟩🟩🟩🟩🟩/);
  assert.equal(saldo(), 119);
  assert.match(X.retirar(G, "u").error, /No tenés ninguna partida/);

  // a mine: the bet is lost; with a shield, it's refunded
  nueva();
  minasEn(0, 1, 2);
  X.iniciar(G, "u", 20, "3", null);
  r = X.destapar(G, "u", "A1");
  assert.ok(r.terminada);
  assert.match(r.mensaje, /^💥 \*¡Mina en A1!\* Perdiste 20 UruCoins\.\n {3}1️⃣2️⃣3️⃣4️⃣5️⃣\nA 💥💣💣🟩🟩\n[\s\S]*Te quedan 80\.$/);
  nueva();
  F.agregarItem(G, "u", "escudo", 1);
  minasEn(0, 1, 2);
  X.iniciar(G, "u", 20, "3", null);
  assert.match(X.destapar(G, "u", "A2").mensaje, /🛡️ Tu escudo te devolvió 20\./);
  assert.equal(saldo(), 100);
});

test("mines: retiro automático al techo o al destapar todas las seguras, sin destapar devuelve, y vence por tiempo", async () => {
  // 24 mines: the single safe tile pays x24.25 and cashes out on its own
  nueva();
  minasEn(...Array.from({ length: 24 }, (_, i) => i)); // mines from A1 to E4; E5 is the safe one
  X.iniciar(G, "u", 20, "24", null);
  let r = X.destapar(G, "u", "E5");
  assert.ok(r.terminada);
  assert.match(r.mensaje, /^💎 E5 segura, y no quedan más: retiro automático\.\n💰 \*Retiraste\* con 1 segura: x24,25 → cobrás \*485\* UruCoins\./);
  assert.equal(saldo(), 565);

  // 10 mines: the x50 cap is reached at 7 safe tiles
  nueva();
  minasEn(...Array.from({ length: 10 }, (_, i) => i)); // A1..B5
  X.iniciar(G, "u", 10, "10", null);
  const seguras = ["C1", "C2", "C3", "C4", "C5", "D1", "D2"];
  for (const c of seguras.slice(0, 6)) {
    r = X.destapar(G, "u", c);
    assert.ok(!r.terminada, c);
  }
  r = X.destapar(G, "u", "D2");
  assert.ok(r.terminada);
  assert.match(r.mensaje, /llegaste al techo de x50: retiro automático[\s\S]*x50,00 → cobrás \*500\* UruCoins/);
  assert.equal(saldo(), 590);

  // with nothing uncovered, cashing out returns the bet
  nueva();
  minasEn(0, 1, 2);
  X.iniciar(G, "u", 20, "3", null);
  r = X.retirar(G, "u");
  assert.match(r.mensaje, /^↩️ Retiraste sin destapar nada: te devuelvo los 20 UruCoins\./);
  assert.equal(saldo(), 100);

  // the time runs out: an automatic cash-out with whatever there is
  nueva();
  minasEn(0, 1, 2);
  X.MINES.SEGUNDOS_DECISION = 0.05;
  let vencida = null;
  X.iniciar(G, "u", 20, "3", (v) => (vencida = v));
  X.destapar(G, "u", "C3");
  await esperar(120);
  assert.match(vencida.mensaje, /^⏳ @u, se te pasó el tiempo\.\n💰 \*Retiro automático\* con 1 segura: x1,10 → cobrás \*22\* UruCoins\./);
  assert.deepEqual(vencida.mentions, ["u"]);
  assert.equal(saldo(), 102);
  X.MINES.SEGUNDOS_DECISION = 60;

  // validaciones
  nueva();
  assert.match(X.iniciar(G, "u", 20, "25", null).error, /Las minas van de 1 a 24/);
  assert.match(X.iniciar(G, "u", 20, "0", null).error, /Las minas van de 1 a 24/);
  assert.match(X.iniciar(G, "u", 4, "3", null).error, /mínima/);
  assert.match(X.destapar(G, "u", "A1").error, /No tenés ninguna partida/);
});
