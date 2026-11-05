// Poker hands, pure: the deck, the strength of five cards and the best five out of up to seven, with their names in
// Spanish. Cards are { v, p } as in lib/blackjack.js, so the tests' mazoDe("A♠", "K♥") deals them; the deck is made
// here and not imported from there, because that module brings the database with it and this one is used alone.
import { randomInt } from "node:crypto";

export const PALOS = ["♠", "♥", "♦", "♣"];
// In order of strength: the index is the rank (2 is 0, the ace 12). The ace also closes the wheel, A-2-3-4-5.
export const VALORES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANGO = Object.fromEntries(VALORES.map((v, i) => [v, i]));
export const CATEGORIAS = ["carta alta", "par", "doble par", "trío", "escalera", "color", "full", "póker", "escalera de color"];

const NOMBRE = ["dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "jota", "dama", "rey", "as"];
const PLURAL = ["doses", "treses", "cuatros", "cincos", "seises", "sietes", "ochos", "nueves", "dieces", "jotas", "damas", "reyes", "ases"];
const PALO = { "♠": "picas", "♥": "corazones", "♦": "diamantes", "♣": "tréboles" };

// A shuffled deck (Fisher-Yates with crypto's randomInt), dealt from the end with pop().
export function mazoNuevo() {
  const mazo = [];
  for (const p of PALOS) for (const v of VALORES) mazo.push({ v, p });
  for (let i = mazo.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [mazo[i], mazo[j]] = [mazo[j], mazo[i]];
  }
  return mazo;
}

export const textoCarta = (c) => `${c.v}${c.p}`;
export const textoCartas = (cartas) => cartas.map(textoCarta).join(" ");

// The strength of exactly five cards: { categoria (0 carta alta … 8 escalera de color), desempate (the ranks that
// break ties, most important first), valor (one number: a stronger hand always has a bigger one), cartas }.
export function evaluar5(cartas) {
  const rangos = cartas.map((c) => RANGO[c.v]).sort((a, b) => b - a);
  const color = cartas.every((c) => c.p === cartas[0].p);
  const cuenta = new Map();
  for (const r of rangos) cuenta.set(r, (cuenta.get(r) || 0) + 1);
  // the groups of equal ranks: the biggest first, and among equals the highest rank
  const grupos = [...cuenta.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]).map(([rango]) => rango);
  let escalera = null;
  if (cuenta.size === 5) {
    if (rangos[0] - rangos[4] === 4) escalera = rangos[0];
    else if (rangos[0] === 12 && rangos[1] === 3) escalera = 3; // the wheel: the ace counts as one, the five is the top
  }
  const tamanos = [...cuenta.values()].sort((a, b) => b - a);
  let categoria;
  let desempate;
  if (escalera !== null && color) [categoria, desempate] = [8, [escalera]];
  else if (tamanos[0] === 4) [categoria, desempate] = [7, grupos];
  else if (tamanos[0] === 3 && tamanos[1] === 2) [categoria, desempate] = [6, grupos];
  else if (color) [categoria, desempate] = [5, rangos];
  else if (escalera !== null) [categoria, desempate] = [4, [escalera]];
  else if (tamanos[0] === 3) [categoria, desempate] = [3, grupos];
  else if (tamanos[0] === 2 && tamanos[1] === 2) [categoria, desempate] = [2, grupos];
  else if (tamanos[0] === 2) [categoria, desempate] = [1, grupos];
  else [categoria, desempate] = [0, rangos];
  // base 13: the category and up to five tie-breakers, missing ones as zeros
  const valor = [categoria, ...desempate, 0, 0, 0, 0, 0].slice(0, 6).reduce((acumulado, digito) => acumulado * 13 + digito, 0);
  return { categoria, desempate, valor, cartas };
}

// The best five out of five to seven cards: every five-card combination (21 out of seven), the strongest wins.
export function mejorMano(cartas) {
  if (cartas.length < 5) throw new Error(`hacen falta cinco cartas, hay ${cartas.length}`);
  const n = cartas.length;
  let mejor = null;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        for (let d = c + 1; d < n; d++) {
          for (let e = d + 1; e < n; e++) {
            const mano = evaluar5([cartas[a], cartas[b], cartas[c], cartas[d], cartas[e]]);
            if (!mejor || mano.valor > mejor.valor) mejor = mano;
          }
        }
      }
    }
  }
  return mejor;
}

// The hand's name as it's said here: "par de reyes", "doble par: ases y dieces", "escalera al cinco" (the wheel),
// "color de picas", "full: damas con ochos", "escalera real" (the ace-high straight flush).
export function describirMano(mano) {
  const [primero, segundo] = mano.desempate;
  switch (mano.categoria) {
    case 8:
      return primero === 12 ? "escalera real" : `escalera de color al ${NOMBRE[primero]}`;
    case 7:
      return `póker de ${PLURAL[primero]}`;
    case 6:
      return `full: ${PLURAL[primero]} con ${PLURAL[segundo]}`;
    case 5:
      return `color de ${PALO[mano.cartas[0].p]}`;
    case 4:
      return `escalera al ${NOMBRE[primero]}`;
    case 3:
      return `trío de ${PLURAL[primero]}`;
    case 2:
      return `doble par: ${PLURAL[primero]} y ${PLURAL[segundo]}`;
    case 1:
      return `par de ${PLURAL[primero]}`;
    default:
      return `carta alta: ${NOMBRE[primero]}`;
  }
}
