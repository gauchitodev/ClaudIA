import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado, mazoDe, fijarSaldo } from "./helpers.mjs";
import { COINS } from "../lib/urucoins.js";

let F, T, Timba, MiTimba, B;
before(async () => {
  ({ F } = await prepararBase("timba"));
  T = await import("../lib/timba.js");
  B = await import("../lib/blackjack.js");
  COINS.CASINO_TOPE_DIA = 1e9;
  Timba = (await import("../plugins/coins-timba.js")).default;
  MiTimba = (await import("../plugins/coins-mitimba.js")).default;
  for (const n of ["a", "b"]) F.initDataDB({ chat: G, sender: `${n}@lid`, senderJid: `5989911${n}@s.whatsapp.net`, pushName: n.toUpperCase() });
});

beforeEach(() => {
  globalThis.db.exec("DELETE FROM urucoins_log");
  globalThis.enviados = [];
});

// Siembra un movimiento: negativo es lo que se apuesta, positivo lo que vuelve.
const mov = (usuario, cantidad, motivo) => F.moverCoins(G, usuario, cantidad, motivo);
const correr = (P, sender, text = "", mentionedJid = []) =>
  P.run({ chat: G, sender, text, mentionedJid, isGroup: true }, { client: globalThis.client, args: text.trim() ? text.trim().split(/\s+/) : [], text, participants: [] });
const ultimo = () => ultimoEnviado()?.msg?.text || "";

test(".mitimba desglosa por juego y da el balance", async () => {
  mov("a@lid", -100, "casino_ruleta");
  mov("a@lid", -100, "casino_ruleta");
  mov("a@lid", 150, "casino_ruleta_premio");
  mov("a@lid", -60, "duelo_apuesta");
  mov("a@lid", 120, "duelo_premio");

  await correr(MiTimba, "a@lid");
  assert.match(ultimo(), /Tu timba en este grupo/);
  assert.match(ultimo(), /🎰 \*Ruleta\* — 200 apostados en 2 jugadas · 🔴 -50/);
  assert.match(ultimo(), /⚔️ \*Duelos\* — 60 apostados en 1 jugada · 🟢 \+60/);
  assert.match(ultimo(), /\*Total:\* 260 apostados · balance 🟢 \+10/);
});

test("una mano de blackjack con doblar y seguro es UNA mano, no cuatro", async () => {
  // Lo que emite una sola mano: apuesta inicial, doblar, y el seguro.
  mov("a@lid", -20, "casino_blackjack");
  mov("a@lid", -20, "casino_blackjack_doblar");
  mov("a@lid", -10, "casino_blackjack_seguro");
  mov("a@lid", 80, "casino_blackjack_premio");

  await correr(MiTimba, "a@lid");
  assert.match(ultimo(), /🃏 \*Blackjack\* — 50 apostados en 1 mano · 🟢 \+30/, "50 apostados, una sola mano");

  mov("a@lid", -20, "casino_blackjack");
  await correr(MiTimba, "a@lid");
  assert.match(ultimo(), /en 2 manos/);
});

test("lo que se devuelve entero no cuenta como jugada", async () => {
  // Un duelo que nadie aceptó y un mines del que se retiró sin destapar: la plata volvió y no se jugó nada.
  mov("a@lid", -50, "duelo_apuesta");
  mov("a@lid", 50, "duelo_devolucion");
  mov("a@lid", -30, "casino_mines");
  mov("a@lid", 30, "casino_mines_devolucion");
  // y una jugada de verdad
  mov("a@lid", -30, "casino_mines");
  mov("a@lid", 45, "casino_mines_premio");

  await correr(MiTimba, "a@lid");
  assert.doesNotMatch(ultimo(), /Duelos/, "el duelo devuelto no deja rastro de jugada");
  assert.match(ultimo(), /💣 \*Mines\* — 60 apostados en 1 jugada · 🟢 \+15/);
});

test("el escudo vuelve al juego donde se perdió", async () => {
  mov("a@lid", -100, "casino_ruleta");
  mov("a@lid", 25, "escudo_ruleta");
  await correr(MiTimba, "a@lid");
  assert.match(ultimo(), /🎰 \*Ruleta\* — 100 apostados en 1 jugada · 🔴 -75/);

  // Los registros viejos, sin juego, entran al total pero no al desglose.
  globalThis.db.exec("DELETE FROM urucoins_log");
  mov("a@lid", -100, "casino_ruleta");
  mov("a@lid", 25, "escudo_devolucion");
  await correr(MiTimba, "a@lid");
  assert.match(ultimo(), /🎰 \*Ruleta\* — 100 apostados en 1 jugada · 🔴 -100/, "el juego no lo cuenta");
  assert.match(ultimo(), /\*Total:\* 100 apostados · balance 🔴 -75/, "el total sí");
});

test(".mitimba de otra persona, y de quien no apostó nunca", async () => {
  mov("b@lid", -40, "casino_carrera");
  await correr(MiTimba, "a@lid", "@b", ["b@lid"]);
  assert.match(ultimo(), /La timba de B/);
  assert.match(ultimo(), /🐎 \*Carrera\* — 40 apostados/);

  await correr(MiTimba, "a@lid");
  assert.match(ultimo(), /No apostaste nada en este grupo/);

  await correr(MiTimba, "b@lid", "@a", ["a@lid"]);
  assert.match(ultimo(), /A no apostó nada en este grupo/);
});

test(".timba rankea por lo apostado y cuenta las jugadas bien", async () => {
  await correr(Timba, "a@lid");
  assert.match(ultimo(), /nadie apostó nunca/);

  mov("a@lid", -20, "casino_blackjack");
  mov("a@lid", -20, "casino_blackjack_doblar");
  mov("a@lid", 80, "casino_blackjack_premio");
  mov("b@lid", -300, "casino_tragamonedas");
  mov("b@lid", 100, "casino_tragamonedas_premio");

  await correr(Timba, "a@lid");
  const texto = ultimo();
  assert.match(texto, /LOS MÁS LUDÓPATAS/);
  assert.match(texto, /1\. B .*\n {3}apostó \*300\* en 1 jugada · balance 🔴 -200/, "el que más puso va primero");
  assert.match(texto, /2\. A .*\n {3}apostó \*40\* en 1 jugada · balance 🟢 \+40/, "la mano doblada cuenta una vez");
  assert.match(texto, /Tu detalle por juego: \.mitimba/);
});

test("el filtro por mes deja afuera lo viejo", async () => {
  const antesDelMes = T.inicioDeMes() - 24 * 3600e3;
  mov("a@lid", -500, "casino_ruleta");
  globalThis.db.prepare("UPDATE urucoins_log SET fecha = ? WHERE usuario = ?").run(antesDelMes, "a@lid");
  mov("a@lid", -40, "casino_ruleta");

  await correr(MiTimba, "a@lid", "mes");
  assert.match(ultimo(), /40 apostados/);
  assert.doesNotMatch(ultimo(), /540|500/);

  await correr(MiTimba, "a@lid");
  assert.match(ultimo(), /540 apostados/, "sin filtro, todo");
});

// Los tests de arriba siembran los movimientos a mano, así que prueban la agregación pero no lo que los juegos
// realmente escriben en el log. Este juega una mano de verdad: si blackjack volviera a usar un solo motivo para la
// apuesta inicial y para el doblar, o si el escudo dejara de nombrar su juego, acá se ve.
test("de punta a punta: una mano doblada y perdida con escudo aparece como una sola mano", async () => {
  globalThis.manosBlackjack?.clear();
  fijarSaldo(F, G, "a@lid", 100);
  F.borrarItem(G, "a@lid", "escudo");
  F.agregarItem(G, "a@lid", "escudo", 1);
  globalThis.db.exec("DELETE FROM urucoins_log");

  B.repartir(G, "a@lid", 20, null, mazoDe("5♠", "6♥", "10♦", "7♣", "2♠")); // 11 + 2 = 13 contra 17
  const r = B.doblar(G, "a@lid");
  assert.match(r.mensaje, /ganó la banca/);

  await correr(MiTimba, "a@lid");
  assert.match(ultimo(), /🃏 \*Blackjack\* — 40 apostados en 1 mano · 🔴 -15/, "40 puestos, una mano, y el escudo devolvió 25");
});
