import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, esperar, mazoDe, fijarSaldo } from "./helpers.mjs";
import { COINS } from "../lib/urucoins.js";

let F, B;
before(async () => {
  ({ F } = await prepararBase("blackjack"));
  B = await import("../lib/blackjack.js");
  COINS.CASINO_TOPE_DIA = 1e9;
});
const saldo = () => F.getSaldoCoins(G, "u");
const nueva = () => {
  fijarSaldo(F, G, "u", 100);
  globalThis.manosBlackjack.clear();
};

test("manos básicas: natural, empates, pasarse, banca que se pasa, doblar", () => {
  nueva();
  let r = B.repartir(G, "u", 20, null, mazoDe("A♠", "K♥", "9♦", "7♣"));
  assert.ok(r.terminada && r.premio === 50 && saldo() === 130);
  nueva();
  assert.match(B.repartir(G, "u", 20, null, mazoDe("A♠", "K♥", "A♦", "Q♣")).mensaje, /empate/);
  assert.equal(saldo(), 100);
  nueva();
  assert.match(B.repartir(G, "u", 20, null, mazoDe("10♠", "8♥", "9♦", "K♣")).mensaje, /Banca: 9♦ \?/);
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("10♠", "6♥", "9♦", "7♣", "9♠"));
  assert.match(B.pedir(G, "u").mensaje, /te pasaste/i);
  assert.equal(saldo(), 80);
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("10♠", "8♥", "6♦", "10♣", "9♠"));
  assert.match(B.plantarse(G, "u").mensaje, /la banca se pasó/i);
  assert.equal(saldo(), 120);
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("10♠", "7♥", "10♦", "7♣"));
  assert.match(B.plantarse(G, "u").mensaje, /empate/);
  assert.equal(saldo(), 100);
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("5♠", "6♥", "10♦", "7♣", "10♠"));
  r = B.doblar(G, "u");
  assert.ok(r.premio === 80 && saldo() === 140 && /\(doblada\)/.test(r.mensaje));
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("5♠", "6♥", "10♦", "7♣", "2♠", "9♥"));
  B.pedir(G, "u");
  assert.match(B.doblar(G, "u").error, /dos primeras cartas/);
  nueva();
  r = B.repartir(G, "u", 20, null, mazoDe("A♠", "7♥", "9♦", "7♣", "9♠", "5♦"));
  assert.match(r.mensaje, /\(18 blando\)/);
  assert.match(B.pedir(G, "u").mensaje, /A♠ 7♥ 9♠ \(17\)/);
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("10♠", "5♥", "9♦", "7♣", "6♠", "4♦"));
  assert.ok(B.pedir(G, "u").terminada, "con 21 se planta solo");
});

test("dividir: pares, ases, doblar dentro de la división", () => {
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("8♠", "8♦", "9♦", "7♣", "5♥", "K♣", "7♥", "2♠"));
  let r = B.dividir(G, "u");
  assert.match(r.mensaje, /▶ Mano 1: 8♠ 5♥ \(13\)/);
  assert.equal(saldo(), 60);
  B.pedir(G, "u");
  assert.match(B.plantarse(G, "u").mensaje, /▶ Mano 2/);
  r = B.plantarse(G, "u");
  assert.ok(/Mano 1: .* — ¡ganaste!, cobrás 40/.test(r.mensaje) && /Mano 2: .* — empate/.test(r.mensaje));
  assert.equal(saldo(), 120);
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("A♠", "A♦", "9♦", "7♣", "10♥", "6♣", "5♠"));
  r = B.dividir(G, "u");
  assert.ok(r.terminada && !/BLACKJACK/.test(r.mensaje) && /\(21 blando\) — empate/.test(r.mensaje));
  assert.equal(saldo(), 80);
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("K♥", "10♣", "9♦", "7♣", "2♠", "3♠"));
  assert.ok(B.dividir(G, "u").ok, "K y 10 se dividen");
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("8♥", "9♣", "9♦", "7♣"));
  assert.match(B.dividir(G, "u").error, /mismo valor/);
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("5♠", "5♦", "9♦", "7♣", "6♥", "4♣", "10♠", "7♦", "2♣"));
  B.dividir(G, "u");
  assert.match(B.doblar(G, "u").mensaje, /Mano 1: 5♠ 6♥ 10♠ \(21\) ✔/);
  B.pedir(G, "u");
  r = B.plantarse(G, "u");
  assert.match(r.mensaje, /cobrás 80 \(doblada\)/);
  assert.equal(saldo(), 120);
});

test("seguro y rendición", () => {
  nueva();
  let r = B.repartir(G, "u", 20, null, mazoDe("10♠", "8♥", "A♦", "K♣"));
  assert.ok(!r.terminada && /podés pedir \.seguro \(cuesta 10/.test(r.mensaje));
  r = B.seguro(G, "u");
  assert.ok(r.terminada && /El seguro pagó 30/.test(r.mensaje) && saldo() === 100);
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("10♠", "8♥", "A♦", "7♣"));
  assert.match(B.seguro(G, "u").mensaje, /el seguro \(10\) se pierde/);
  assert.match(B.seguro(G, "u").error, /Ya tomaste/);
  assert.match(B.plantarse(G, "u").mensaje, /empate/);
  assert.equal(saldo(), 90);
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("10♠", "8♥", "A♦", "K♣", "5♠"));
  r = B.pedir(G, "u");
  assert.ok(r.terminada && /Vos: 10♠ 8♥ \(18\)/.test(r.mensaje) && /blackjack de la banca/.test(r.mensaje));
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("10♠", "6♥", "9♦", "7♣"));
  r = B.rendirse(G, "u");
  assert.ok(/Te rendiste/.test(r.mensaje) && saldo() === 90);
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("10♠", "6♥", "9♦", "7♣", "2♠"));
  B.pedir(G, "u");
  assert.match(B.rendirse(G, "u").error, /dos primeras cartas/);
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("10♠", "6♥", "A♦", "K♣"));
  assert.match(B.rendirse(G, "u").mensaje, /blackjack de la banca/);
});

test("una acción que no se pudo pagar no te quita el seguro", () => {
  // La banca mira su carta tapada al primer movimiento, y eso cierra la oferta de seguro. Si el movimiento se rechaza
  // por falta de saldo nunca ocurrió, así que el seguro tiene que seguir disponible: antes se perdía en silencio y el
  // bot contestaba "solo cuando la banca muestra un as" con el as a la vista en el mensaje anterior.
  nueva();
  fijarSaldo(F, G, "u", 20); // justo para la apuesta, nada para la segunda
  assert.match(B.repartir(G, "u", 20, null, mazoDe("5♠", "6♥", "A♦", "9♣", "10♠", "3♦")).mensaje, /podés pedir \.seguro/);
  assert.match(B.doblar(G, "u").error, /No te alcanza/);
  assert.match(B.seguro(G, "u").error, /El seguro cuesta 10/, "sigue disponible, solo que tampoco lo puede pagar");

  // lo mismo con .dividir
  nueva();
  fijarSaldo(F, G, "u", 20);
  B.repartir(G, "u", 20, null, mazoDe("8♠", "8♥", "A♦", "9♣", "3♠", "2♥"));
  assert.match(B.dividir(G, "u").error, /No te alcanza/);
  assert.match(B.seguro(G, "u").error, /El seguro cuesta 10/);

  // con saldo para el seguro, se toma después de que el doblar fuera rechazado
  nueva();
  fijarSaldo(F, G, "u", 30);
  B.repartir(G, "u", 20, null, mazoDe("5♠", "6♥", "A♦", "9♣", "10♠", "3♦"));
  assert.match(B.doblar(G, "u").error, /No te alcanza/);
  assert.match(B.seguro(G, "u").mensaje, /el seguro \(10\) se pierde/, "la banca no tenía blackjack");
  assert.equal(saldo(), 0);
});

test("el seguro explica el motivo correcto según el caso", () => {
  // ya jugó la mano, con un as a la vista
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("5♠", "6♥", "A♦", "9♣", "2♠", "3♥"));
  B.pedir(G, "u");
  assert.match(B.seguro(G, "u").error, /antes de la primera decisión/);

  // la banca no muestra un as
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("5♠", "6♥", "9♦", "7♣", "2♠"));
  assert.match(B.seguro(G, "u").error, /cuando la banca muestra un as/);
});

test("una mano por persona, límites y tiempo agotado", async () => {
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("10♠", "5♥", "9♦", "7♣", "6♠", "4♦"));
  assert.ok(!B.repartir(G, "u", 20, null).ok && B.pedir(G, "v").error && B.estadoMano(G, "u"));
  nueva();
  assert.ok(!B.repartir(G, "u", 4, null).ok && !B.repartir(G, "u", 101, null).ok);
  nueva();
  B.BLACKJACK.SEGUNDOS_DECISION = 0.05;
  let vencida = null;
  B.repartir(G, "u", 20, (v) => (vencida = v), mazoDe("8♠", "8♦", "9♦", "7♣", "5♥", "K♣", "2♠"));
  B.dividir(G, "u");
  await esperar(150);
  assert.ok(vencida && /se te pasó el tiempo/.test(vencida.mensaje) && globalThis.manosBlackjack.size === 0);
  B.BLACKJACK.SEGUNDOS_DECISION = 60;
});

test("seguro con apuesta chica: vale la mitad aunque quede por debajo del mínimo del casino, y no se avisa dos veces", () => {
  nueva();
  let r = B.repartir(G, "u", 6, null, mazoDe("10♠", "8♥", "A♦", "K♣"));
  assert.match(r.mensaje, /podés pedir \.seguro \(cuesta 3/);
  r = B.seguro(G, "u");
  assert.ok(r.ok, r.error);
  assert.match(r.mensaje, /El seguro pagó 9/);
  assert.equal(saldo(), 100, "con apuesta par, el seguro deja a mano");
  nueva();
  B.repartir(G, "u", 20, null, mazoDe("10♠", "8♥", "A♦", "7♣"));
  assert.match(B.seguro(G, "u").mensaje, /el seguro \(10\) se pierde y seguís jugando/);
  const fin = B.plantarse(G, "u").mensaje;
  assert.doesNotMatch(fin, /seguro/, "al cierre no se repite el aviso del seguro perdido");
  assert.equal(saldo(), 90);
});
