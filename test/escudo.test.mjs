import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, esperar, mazoDe, fijarSaldo } from "./helpers.mjs";
import { COINS } from "../lib/urucoins.js";

let F, C, K, B, D, M, U, T;
before(async () => {
  ({ F } = await prepararBase("escudo"));
  C = await import("../lib/casino.js");
  K = await import("../lib/carrera.js");
  B = await import("../lib/blackjack.js");
  D = await import("../lib/duelos.js");
  M = await import("../lib/mercados.js");
  U = await import("../lib/urucoins.js");
  T = await import("../lib/tienda.js");
  COINS.CASINO_TOPE_DIA = 1e9;
});
const saldo = (u) => F.getSaldoCoins(G, u);
const conEscudo = (u) => {
  fijarSaldo(F, G, u, 100);
  F.borrarItem(G, u, "escudo");
  F.agregarItem(G, u, "escudo", 1);
};
const escudos = (u) => F.getItem(G, u, "escudo")?.cantidad || 0;

test("escudo: la tienda lo describe para todos los juegos y protegerApuesta lo gasta una sola vez", () => {
  assert.match(T.ITEMS.escudo.desc, /ruleta, tragamonedas, carrera, blackjack, duelos, mercados o \.apostar/);
  conEscudo("u");
  assert.equal(T.protegerApuesta(G, "u", 20), 20);
  assert.equal(saldo("u"), 120);
  assert.equal(escudos("u"), 0);
  assert.equal(T.protegerApuesta(G, "u", 20), 0, "sin escudo no devuelve nada");
  assert.equal(saldo("u"), 120);
  conEscudo("u");
  assert.equal(T.protegerApuesta(G, "u", 100), 25, "devuelve hasta lo que cuesta el escudo");
  assert.equal(saldo("u"), 125);
});

test("escudo: ruleta y tragamonedas", async () => {
  C._rng.randomInt = () => 17; // sale el 17 negro
  C.CASINO.RULETA_SEGUNDOS = 0.05;
  conEscudo("a");
  fijarSaldo(F, G, "b", 100);
  F.borrarItem(G, "b", "escudo");
  let resultado = null;
  C.apostarRuleta(G, "a", 20, "rojo", (r) => (resultado = r));
  C.apostarRuleta(G, "b", 20, "rojo", (r) => (resultado = r));
  await esperar(150);
  assert.match(resultado.texto, /🛡️ @a 20 a rojo → su escudo le devuelve 20\n❌ @b 20 a rojo/);
  assert.equal(saldo("a"), 100, "a recupera lo apostado");
  assert.equal(saldo("b"), 80);
  assert.equal(escudos("a"), 0);

  // tragamonedas: tres columnas sin ninguna línea ganadora
  const rodillos = [0, 5, 9, 5, 9, 12, 12, 14, 15];
  let i = 0;
  C._rng.randomInt = () => rodillos[i++ % rodillos.length];
  conEscudo("a");
  let r = C.jugarTragamonedas(G, "a", 20);
  assert.match(r.mensaje, /Ninguna línea pagó, pero tu escudo te devolvió los 20\. Te quedan 100\./);
  assert.equal(saldo("a"), 100);
  i = 0;
  r = C.jugarTragamonedas(G, "a", 20);
  assert.match(r.mensaje, /Ninguna línea pagó esta vez\. Te quedan 80\./);
});

test("escudo: carrera", async () => {
  K._rng.randomInt = (min) => min; // gana el primer caballo
  K.CARRERA.SEGUNDOS = 0.05;
  conEscudo("a");
  let largada = null;
  K.apostarCarrera(G, "a", 20, "2", (x) => (largada = x));
  await esperar(150);
  assert.match(largada.resultado.texto, /🛡️ @a 20 a .+ → su escudo le devuelve 20/);
  assert.equal(saldo("a"), 100);
});

test("escudo: blackjack devuelve la mano perdida, incluida la doblada", () => {
  globalThis.manosBlackjack.clear();
  conEscudo("u");
  B.repartir(G, "u", 20, null, mazoDe("10♠", "6♥", "10♦", "7♣"));
  let r = B.plantarse(G, "u"); // 16 contra 17
  assert.match(r.mensaje, /ganó la banca\n🛡️ Tu escudo te devolvió los 20 de la mano perdida\./);
  assert.equal(saldo("u"), 100);
  assert.equal(escudos("u"), 0);
  conEscudo("u");
  B.repartir(G, "u", 20, null, mazoDe("5♠", "6♥", "10♦", "7♣", "2♠"));
  r = B.doblar(G, "u"); // 13 doblado contra 17
  assert.match(r.mensaje, /devolvió los 25 de la mano perdida/, "el reintegro tiene techo");
  assert.equal(saldo("u"), 85);
});

test("escudo: duelos y mercados", () => {
  conEscudo("a");
  fijarSaldo(F, G, "b", 100);
  let i = 0;
  const tiradas = [1, 6]; // a saca 1, b saca 6
  D._rng.randomInt = () => tiradas[i++];
  D.desafiar(G, "a", "b", 20, "dado");
  const r = D.aceptar(G, "b");
  assert.match(r.texto, /Gana @b y se lleva \*40 UruCoins\*\.\n🛡️ @a tenía escudo y recupera sus 20\./);
  assert.equal(saldo("a"), 100);
  assert.equal(saldo("b"), 120);

  conEscudo("a");
  fijarSaldo(F, G, "c", 100);
  const c = M.crearMercadoDesdeTexto(G, "admin", "Final | Rojo | Azul | en 2h");
  const id = c.id;
  M.jugar(G, "a", id, "Rojo", 20);
  M.jugar(G, "c", id, "Azul", 20);
  F.actualizarMercado(id, { cierra_en: Date.now() - 1000 });
  const res = M.resolver(G, "admin", id, "Azul");
  assert.match(res.texto, /🛡️ @a apostó 20 y su escudo se lo devuelve/);
  assert.doesNotMatch(res.texto, /apuesta perdida/);
  assert.equal(saldo("a"), 100);
  assert.equal(saldo("c"), 120);
});

test("escudo: la apuesta con .apostar sobre un juego sigue protegida", () => {
  conEscudo("a");
  U.juegoIniciado(G, "trivia");
  assert.ok(U.apostar(G, "a", 20).ok);
  const resumen = U.juegoTerminado(G, "otra@lid");
  assert.match(resumen, /🛡️ 1 escudo usado: 20 UruCoins devueltos/);
  assert.equal(saldo("a"), 100);
});
