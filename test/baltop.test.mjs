import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, fijarSaldo, ultimoEnviado } from "./helpers.mjs";

let F, A, Bal, Top, Racha;
before(async () => {
  ({ F } = await prepararBase("baltop"));
  A = await import("../lib/actividad.js");
  Bal = (await import("../plugins/coins-saldo.js")).default;
  Top = (await import("../plugins/coins-baltop.js")).default;
  Racha = (await import("../plugins/coins-racha.js")).default;
});
const correr = (P, sender, chat = G) => P.run({ chat, sender, isGroup: true }, { client: globalThis.client, user: {} });

test(".bal muestra solo tu saldo", async () => {
  fijarSaldo(F, G, "a@lid", 120);
  await correr(Bal, "a@lid");
  assert.equal(ultimoEnviado().msg.text, "🪙 Tenés *120 UruCoins* · podés apostar hasta 100 por jugada");
  fijarSaldo(F, G, "a@lid", 1250);
  await correr(Bal, "a@lid");
  assert.equal(ultimoEnviado().msg.text, "🪙 Tenés *1250 UruCoins* · podés apostar hasta 250 por jugada", "con más saldo, el 20 %");
  fijarSaldo(F, G, "a@lid", 120);
  await correr(Bal, "nadie@lid");
  assert.equal(ultimoEnviado().msg.text, "🪙 Tenés *0 UruCoins*");
});

test(".baltop lista a los más ricos y te ubica si no entrás", async () => {
  await correr(Top, "a@lid", "vacio@g.us");
  assert.match(ultimoEnviado().msg.text, /nadie tiene UruCoins/);
  for (let i = 1; i <= 12; i++) fijarSaldo(F, G, `u${i}@lid`, i * 10);
  fijarSaldo(F, G, "a@lid", 5);
  await correr(Top, "u1@lid");
  const { text, mentions } = ultimoEnviado().msg;
  assert.match(text, /LOS MÁS RICOS DEL GRUPO/);
  // con nombre (o número si no lo hay) y sin etiquetar a nadie
  assert.match(text, /1\. u12 — \*120\*\n2\. u11 — \*110\*/);
  assert.match(text, /10\. u3 — \*30\*\n\n/);
  assert.doesNotMatch(text, /\bu1 |\bu2 |@/, "los que no entran en el top 10 no se listan, y no hay menciones");
  assert.equal(mentions, undefined);
  assert.equal(F.puestoCoins(G, "u1@lid"), 12);
  assert.match(text, /Vos: puesto 12 con 10 UruCoins/);
  assert.match(text, /En circulación: \*785 UruCoins\* entre 13 personas/);
  await correr(Top, "a@lid");
  assert.match(ultimoEnviado().msg.text, /Vos: puesto 13 con 5 UruCoins/);
  await correr(Top, "nadie@lid");
  assert.match(ultimoEnviado().msg.text, /Vos todavía no tenés UruCoins/);
  await correr(Top, "u12@lid");
  assert.doesNotMatch(ultimoEnviado().msg.text, /Vos/, "si estás en el top, no hace falta la línea");
  fijarSaldo(F, G, "empate@lid", 120);
  assert.equal(F.puestoCoins(G, "empate@lid"), 1, "los empatados comparten puesto");
  assert.equal(F.puestoCoins(G, "u11@lid"), 3);
});

test(".racha muestra la racha diaria", async () => {
  await correr(Racha, "r@lid");
  assert.match(ultimoEnviado().msg.text, /No tenés racha todavía/);
  F.setRacha(G, "r@lid", 3, A.claveDia());
  await correr(Racha, "r@lid");
  assert.match(ultimoEnviado().msg.text, /Racha diaria: 3 días/);
});
