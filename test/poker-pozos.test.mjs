import { test } from "node:test";
import assert from "node:assert/strict";
import { armarPozos, repartirPozos, totalPorJugador } from "../lib/poker-pozos.js";

// The poker pots (lib/poker-pozos.js): main and side pots by level of contribution, who can win each, the split and
// the odd chips. Pure code: no database here.
const j = (id, aporte, retirado = false) => ({ id, aporte, retirado });
const suma = (numeros) => numeros.reduce((a, b) => a + b, 0);

test("pozos: principal y laterales por nivel de aporte; los retirados aportan y no cobran; lo no igualado vuelve", () => {
  // A all-in with 20, B all-in with 50, C with 100, D folded after putting 30
  const pozos = armarPozos([j("A", 20), j("B", 50), j("C", 100), j("D", 30, true)]);
  assert.deepEqual(pozos, [
    { monto: 80, elegibles: ["A", "B", "C"], soloSuyo: false },
    { monto: 70, elegibles: ["B", "C"], soloSuyo: false },
    { monto: 50, elegibles: ["C"], soloSuyo: true },
  ]);
  assert.equal(suma(pozos.map((p) => p.monto)), 200, "ni una ficha afuera");
  // everyone folded to B: one pot, B's, and it isn't "uncalled", it's won
  assert.deepEqual(armarPozos([j("A", 10, true), j("B", 20)]), [{ monto: 30, elegibles: ["B"], soloSuyo: false }]);
  // nobody put anything: no pots
  assert.deepEqual(armarPozos([j("A", 0), j("B", 0)]), []);
  // a folded player above every live level: the chips still go to the ones in
  assert.deepEqual(armarPozos([j("A", 10), j("B", 40, true)]), [
    { monto: 20, elegibles: ["A"], soloSuyo: false },
    { monto: 30, elegibles: ["A"], soloSuyo: false },
  ]);
});

test("pozos: el mejor de cada pozo, los empates en partes iguales y las fichas que sobran desde la izquierda del botón", () => {
  const pozos = armarPozos([j("A", 20), j("B", 50), j("C", 100), j("D", 30, true)]);
  const fuerza = { A: 900, B: 500, C: 100 };
  const r = repartirPozos(pozos, (id) => fuerza[id], ["A", "B", "C"]);
  assert.deepEqual(r.map((p) => p.pagos), [{ A: 80 }, { B: 70 }, { C: 50 }], "el más fuerte solo gana hasta su nivel");
  assert.deepEqual(totalPorJugador(r), { A: 80, B: 70, C: 50 });
  // a short stack with the worst hand: the others take everything above their level
  const r2 = repartirPozos(pozos, (id) => ({ A: 1, B: 900, C: 500 })[id], ["A", "B", "C"]);
  assert.deepEqual(totalPorJugador(r2), { B: 150, C: 50 });
  // a three-way tie with 101 chips: 34, 34 and 33, the extra ones from the first after the button
  const empate = repartirPozos([{ monto: 101, elegibles: ["A", "B", "C"], soloSuyo: false }], () => 1, ["C", "A", "B"]);
  assert.deepEqual([empate[0].ganadores, empate[0].pagos], [["C", "A", "B"], { C: 34, A: 34, B: 33 }]);
  // the odd chip goes by table order, whatever order the elegibles came in
  const dos = repartirPozos([{ monto: 91, elegibles: ["B", "A"], soloSuyo: false }], () => 7, ["A", "B"]);
  assert.deepEqual(dos[0].pagos, { A: 46, B: 45 });
  // a tie in the main pot and a single winner of the side pot
  const mixto = repartirPozos(armarPozos([j("A", 30), j("B", 60), j("C", 60)]), (id) => ({ A: 5, B: 5, C: 2 })[id], ["A", "B", "C"]);
  assert.deepEqual(totalPorJugador(mixto), { A: 45, B: 105 });
});

test("pozos: nunca se pierde ni se crea una ficha: Σ pagos = Σ aportes, también al azar", () => {
  for (let vuelta = 0; vuelta < 300; vuelta++) {
    const n = 2 + Math.floor(Math.random() * 5);
    const jugadores = Array.from({ length: n }, (_, i) => j(`J${i}`, Math.floor(Math.random() * 120), Math.random() < 0.3));
    if (jugadores.every((x) => x.retirado)) jugadores[0].retirado = false;
    const fuerza = Object.fromEntries(jugadores.map((x) => [x.id, 1 + Math.floor(Math.random() * 4)]));
    const pozos = armarPozos(jugadores);
    const r = repartirPozos(pozos, (id) => fuerza[id], jugadores.map((x) => x.id));
    const pagos = totalPorJugador(r);
    assert.equal(suma(Object.values(pagos)), suma(jugadores.map((x) => x.aporte)), JSON.stringify(jugadores));
    for (const id of Object.keys(pagos)) assert.ok(!jugadores.find((x) => x.id === id).retirado, "un retirado nunca cobra");
    for (const pozo of r) assert.equal(suma(Object.values(pozo.pagos)), pozo.monto);
  }
});
