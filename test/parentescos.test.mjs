import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";

// .parentesco, the relatives .familia lists and .listaparejas (lib/familia.js, lib/parejas.js). Families and couples
// are the same in every group; the lists only show the group's own people.
//
//   20 💍 21                1 💍 2
//      └ 7 💍 3 ────────────┘  └ 4 💍 9
//           └ 8 💍 16              └ 10 💍 23
//                └ 17                   └ 22
//   11 💞 12 (not married) · 13 and 14 broke up · 5 is nobody's relative

let F, Fa, P, Parentesco, ListaParejas;
const DIA = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2031, 0, 15, 12);
const L = (n) => `${n}@lid`;
const casar = (a, b, desde = T0 - 300 * DIA, casados = T0 - 200 * DIA) => {
  P.fijarPareja(L(a), L(b), desde);
  P.fijarCasamiento(L(a), L(b), casados);
};
const hijo = (h, a, b) => F.crearAdopcion(L(h), L(a), L(b), T0 - DIA);

before(async () => {
  ({ F } = await prepararBase("parentescos"));
  Fa = await import("../lib/familia.js");
  P = await import("../lib/parejas.js");
  Parentesco = (await import("../plugins/familia-parentesco.js")).default;
  ListaParejas = (await import("../plugins/lista-parejas.js")).default;
  for (const n of [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 20, 21, 22, 23]) F.initDataDB({ chat: G, sender: L(n), senderJid: "", pushName: `Persona ${n}` });
  casar(20, 21, T0 - 400 * DIA, T0 - 390 * DIA);
  casar(1, 2);
  hijo(3, 1, 2);
  hijo(4, 1, 2);
  hijo(7, 20, 21);
  casar(3, 7, T0 - 100 * DIA, T0 - 50 * DIA);
  hijo(8, 3, 7);
  casar(4, 9, T0 - 90 * DIA, T0 - 40 * DIA);
  hijo(10, 4, 9);
  casar(8, 16, T0 - 30 * DIA, T0 - 20 * DIA);
  hijo(17, 8, 16);
  casar(10, 23, T0 - 30 * DIA, T0 - 10 * DIA);
  hijo(22, 10, 23);
  P.fijarPareja(L(11), L(12), T0 - 5 * DIA);
  P.fijarPareja(L(13), L(14), T0 - 60 * DIA);
  P.terminarPareja(L(13));
});

test("parentesco: sangre, políticos, la pareja, los ex y los lejanos", () => {
  const es = (a, b) => Fa.parentescoEntre(L(a), L(b)); // what b is to a
  assert.equal(es(8, 10), "primo/a");
  assert.equal(es(8, 1), "abuelo/a");
  assert.equal(es(17, 1), "bisabuelo/a");
  assert.equal(es(1, 17), "bisnieto/a");
  assert.equal(es(7, 1), "suegro/a");
  assert.equal(es(1, 7), "yerno o nuera");
  assert.equal(es(7, 4), "cuñado/a");
  assert.equal(es(1, 20), "consuegro/a");
  assert.equal(es(3, 7), "esposo/a");
  assert.equal(es(11, 12), "pareja", "novios sin casar");
  assert.equal(es(13, 14), "ex pareja");
  assert.equal(es(17, 22), "pariente lejano/a", "primos segundos: comparten bisabuelos");
  assert.equal(es(5, 1), null);
  // The incest checks still look at blood only: in-laws can date.
  assert.equal(Fa.parentescoDe(L(7), L(4)), null);
  assert.equal(Fa.parentescoDe(L(8), L(10)), "tu primo/a");
});

test(".parentesco: con una mención, con dos, respondiendo a alguien, y sin nadie", async () => {
  const client = globalThis.client;
  const correr = (sender, mencionados = [], quoted = null) => Parentesco.run({ chat: G, sender, isGroup: true, mentionedJid: mencionados, quoted }, { client, text: "", usedPrefix: "." });
  await correr(L(8), [L(1)]);
  assert.equal(ultimoEnviado().msg.text, "🧬 Persona 1 es tu abuelo/a.");
  await correr(L(8), [L(17), L(1)]);
  assert.equal(ultimoEnviado().msg.text, "🧬 Persona 17 es bisnieto/a de Persona 1.");
  await correr(L(1), [], { sender: L(7) });
  assert.equal(ultimoEnviado().msg.text, "🧬 Persona 7 es tu yerno o nuera.");
  await correr(L(5), [L(1)]);
  assert.equal(ultimoEnviado().msg.text, "🧬 Persona 1 no es pariente tuyo.");
  await correr(L(8), [L(5), L(1)]);
  assert.equal(ultimoEnviado().msg.text, "🧬 Persona 5 y Persona 1 no son parientes.");
  await correr(L(8), [L(8)]);
  assert.equal(ultimoEnviado().msg.text, "🪞 Sos vos.");
  await correr(L(8), ["999@lid"]);
  assert.equal(ultimoEnviado().msg.text, "No conozco a esa persona todavía.");
  await correr(L(8));
  assert.match(ultimoEnviado().msg.text, /^¿De quién\? \.parentesco @persona te dice qué es tuyo/);
  assert.equal(ultimoEnviado().msg.mentions, undefined, "no arroba a nadie");
});

test(".familia: bisabuelos, bisnietos, yernos y nueras, y consuegros", () => {
  const de1 = Fa.textoFamilia(L(1), true);
  assert.match(de1, /\n👣 Bisnietos: Persona 17 y Persona 22(\n|$)/);
  assert.match(de1, /\n💒 Yernos y nueras: Persona 7 y Persona 9(\n|$)/);
  assert.match(de1, /\n🫂 Consuegros: Persona 20 y Persona 21(\n|$)/);
  assert.match(Fa.textoFamilia(L(17)), /\n👴 Bisabuelos: Persona 1, Persona 2, Persona 20 y Persona 21(\n|$)/);
});

test(".listaparejas: las del grupo, por nombre y sin arrobar, las casadas primero", async () => {
  const client = globalThis.client;
  const participantes = [1, 2, 3, 11, 12].map((n) => ({ id: L(n), admin: null }));
  assert.equal(
    P.textoParejas((lid) => participantes.some((p) => p.id === lid), T0),
    [
      "💞 *Parejas del grupo* (3)",
      "",
      "💍 Persona 1 y Persona 2 — juntos hace 10 meses, casados hace 6 meses",
      "💍 Persona 3 y Persona 7 — juntos hace 3 meses, casados hace 1 mes",
      "💞 Persona 11 y Persona 12 — juntos hace 5 días",
    ].join("\n"),
  );
  await ListaParejas.run({ chat: G, isGroup: true }, { client, participants: participantes });
  assert.match(ultimoEnviado().msg.text, /^💞 \*Parejas del grupo\* \(3\)\n\n💍 Persona 1 y Persona 2 — juntos hace /);
  assert.doesNotMatch(ultimoEnviado().msg.text, /@/, "antes mencionaba a todas las parejas de todos los grupos");
  // In private (only the owner uses it there), every couple the bot knows.
  await ListaParejas.run({ chat: L(1), isGroup: false }, { client, participants: [] });
  assert.match(ultimoEnviado().msg.text, /^💞 \*Parejas\* \(7\)\n/);
  await ListaParejas.run({ chat: G, isGroup: true }, { client, participants: [{ id: L(5), admin: null }] });
  assert.match(ultimoEnviado().msg.text, /No hay ninguna todavía\. Se pide con \.pareja @persona\./);
});
