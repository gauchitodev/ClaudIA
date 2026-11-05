import { test } from "node:test";
import assert from "node:assert/strict";
import { carta } from "./helpers.mjs";
import { evaluar5, mejorMano, describirMano, mazoNuevo, textoCarta, textoCartas, CATEGORIAS } from "../lib/poker-manos.js";

// The poker hands (lib/poker-manos.js): the strength of five cards, the best five out of seven, the names in Spanish
// and the deck. Pure code: no database here.
const mano = (...cartas) => evaluar5(cartas.map(carta));
const mejor = (...cartas) => mejorMano(cartas.map(carta));
const ordenadas = (cartas) => textoCartas(cartas).split(" ").sort().join(" ");

test("poker-manos: cada categoría, de la carta alta a la escalera real, cada una más fuerte que la anterior", () => {
  const ejemplos = [
    ["carta alta: as", "A♠", "K♦", "9♣", "5♥", "2♠"],
    ["par de reyes", "K♠", "K♦", "9♣", "5♥", "2♠"],
    ["doble par: ases y dieces", "A♠", "A♦", "10♣", "10♥", "2♠"],
    ["trío de sietes", "7♠", "7♦", "7♣", "K♥", "2♠"],
    ["escalera al nueve", "9♠", "8♦", "7♣", "6♥", "5♠"],
    ["color de picas", "A♠", "J♠", "9♠", "5♠", "2♠"],
    ["full: damas con ochos", "Q♠", "Q♦", "Q♣", "8♥", "8♠"],
    ["póker de sietes", "7♠", "7♦", "7♣", "7♥", "2♠"],
    ["escalera de color al rey", "K♠", "Q♠", "J♠", "10♠", "9♠"],
    ["escalera real", "A♥", "K♥", "Q♥", "J♥", "10♥"],
  ];
  let anterior = -1;
  ejemplos.forEach(([nombre, ...cartas], i) => {
    const m = mano(...cartas);
    assert.equal(describirMano(m), nombre);
    assert.equal(m.categoria, Math.min(i, 8), nombre);
    assert.ok(m.valor > anterior, `${nombre} le gana a la anterior`);
    anterior = m.valor;
  });
  assert.equal(CATEGORIAS.length, 9);
  assert.equal(CATEGORIAS[8], "escalera de color");
});

test("poker-manos: los desempates: kickers, la rueda, K-A-2-3-4 no es escalera, el color por sus cinco cartas", () => {
  assert.ok(mano("K♠", "K♦", "A♣", "5♥", "2♠").valor > mano("K♥", "K♣", "Q♣", "5♦", "2♦").valor, "par igual: el kicker");
  assert.equal(mano("K♠", "K♦", "A♣", "5♥", "2♠").valor, mano("K♥", "K♣", "A♦", "5♦", "2♦").valor, "las mismas cartas de otro palo empatan");
  assert.ok(mano("A♠", "A♦", "3♣", "3♥", "2♠").valor > mano("K♠", "K♦", "Q♣", "Q♥", "A♠").valor, "doble par: manda el par alto");
  assert.ok(mano("K♠", "K♦", "3♣", "3♥", "A♠").valor > mano("K♣", "K♥", "3♠", "3♦", "Q♠").valor, "doble par igual: el kicker");
  assert.ok(mano("5♠", "5♦", "5♣", "2♥", "2♠").valor > mano("4♠", "4♦", "4♣", "A♥", "A♠").valor, "full: manda el trío");
  assert.ok(mano("7♠", "7♦", "7♣", "A♥", "2♠").valor > mano("7♠", "7♦", "7♣", "K♥", "Q♠").valor, "trío: el kicker más alto");
  const rueda = mano("A♠", "2♦", "3♣", "4♥", "5♠");
  assert.deepEqual([rueda.categoria, describirMano(rueda)], [4, "escalera al cinco"]);
  assert.ok(mano("6♠", "5♦", "4♣", "3♥", "2♠").valor > rueda.valor, "la rueda es la escalera más baja");
  assert.ok(rueda.valor > mano("A♠", "A♦", "K♣", "K♥", "Q♠").valor, "pero le gana a un doble par");
  const noEscalera = mano("K♠", "A♦", "2♣", "3♥", "4♠");
  assert.deepEqual([noEscalera.categoria, describirMano(noEscalera)], [0, "carta alta: as"], "la escalera no da la vuelta");
  assert.ok(mano("A♥", "9♥", "8♥", "3♥", "2♥").valor > mano("K♦", "Q♦", "J♦", "9♦", "2♦").valor, "color: la carta más alta");
  assert.ok(mano("9♠", "9♦", "9♣", "9♥", "A♠").valor > mano("9♠", "9♦", "9♣", "9♥", "K♠").valor, "póker: el kicker");
  assert.ok(mano("2♠", "2♦", "2♣", "2♥", "3♠").valor > mano("A♠", "A♦", "A♣", "K♥", "K♠").valor, "el póker más bajo le gana al full más alto");
  assert.equal(describirMano(mano("2♣", "3♣", "4♣", "5♣", "6♣")), "escalera de color al seis");
  assert.equal(describirMano(mano("A♣", "2♣", "3♣", "4♣", "5♣")), "escalera de color al cinco");
  assert.equal(describirMano(mano("J♦", "J♣", "4♥", "3♠", "2♦")), "par de jotas");
  assert.equal(describirMano(mano("Q♦", "10♣", "9♥", "3♠", "2♦")), "carta alta: dama");
});

test("poker-manos: la mejor de siete elige las cinco correctas, y con cinco justas evalúa esas", () => {
  const full = mejor("A♠", "K♦", "K♥", "7♠", "2♦", "K♣", "7♦");
  assert.equal(describirMano(full), "full: reyes con sietes");
  assert.equal(ordenadas(full.cartas), ordenadas(["K♦", "K♥", "7♠", "K♣", "7♦"].map(carta)));
  assert.equal(describirMano(mejor("Q♠", "Q♦", "9♣", "9♥", "2♠", "A♠", "A♦")), "doble par: ases y damas", "tres pares: los dos más altos");
  assert.equal(mejor("5♠", "6♦", "7♣", "8♥", "9♠", "2♠", "2♦").valor, mejor("5♠", "6♦", "7♣", "8♥", "9♠", "K♠", "K♦").valor, "la escalera de la mesa se comparte");
  assert.equal(describirMano(mejor("5♠", "6♦", "7♣", "8♥", "9♠", "10♠", "2♦")), "escalera al diez", "con un diez, la escalera sube");
  const color = mejor("A♥", "J♥", "9♥", "5♥", "2♥", "3♥", "K♠");
  assert.equal(ordenadas(color.cartas), ordenadas(["A♥", "J♥", "9♥", "5♥", "3♥"].map(carta)), "seis del palo: las cinco más altas");
  assert.equal(describirMano(mejor("A♠", "K♠", "Q♠", "J♠", "10♠", "10♦", "10♣")), "escalera real", "mejor que el trío de dieces");
  assert.equal(mejor("A♠", "K♦", "9♣", "5♥", "2♠").categoria, 0);
  assert.equal(mejor("A♠", "K♦", "9♣", "5♥", "2♠", "2♦").categoria, 1, "con seis también");
  assert.throws(() => mejorMano([carta("A♠")]), /cinco cartas/);
});

test("poker-manos: el mazo tiene 52 cartas distintas y sale mezclado", () => {
  const mazo = mazoNuevo();
  assert.equal(mazo.length, 52);
  assert.equal(new Set(mazo.map(textoCarta)).size, 52);
  assert.equal(textoCartas(mazo).match(/♠/g).length, 13);
  assert.notEqual(textoCartas(mazoNuevo()), textoCartas(mazoNuevo()), "dos mazos no salen iguales");
  assert.equal(textoCartas([carta("10♥"), carta("A♠")]), "10♥ A♠");
});
