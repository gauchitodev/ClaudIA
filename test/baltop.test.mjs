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

// In a group of its own: .baltop's ranking, further down, counts everyone with coins in G.
const OTRO = "bal@g.us";
const pedir = (sender, { text = "", mentionedJid = [], quoted, participants = [] } = {}) =>
  Bal.run({ chat: OTRO, sender, text, mentionedJid, quoted, isGroup: true }, { client: globalThis.client, text, args: text.split(/\s+/).filter(Boolean), participants, user: {} });

test(".bal @persona muestra el saldo de esa persona, sin arrobarla", async () => {
  const TERO = "300000000000021@lid";
  F.initDataDB({ chat: G, sender: TERO, senderJid: "59899000021@s.whatsapp.net", pushName: "Tero" });
  fijarSaldo(F, OTRO, TERO, 1250);
  fijarSaldo(F, OTRO, "a@lid", 120);
  const formas = {
    "una mención": { text: "@300000000000021", mentionedJid: [TERO] },
    "una mención por número": { text: "@59899000021", mentionedJid: ["59899000021@s.whatsapp.net"] },
    "los dígitos tipeados": { text: "@300000000000021" },
    "el número tipeado": { text: "+598 99 000 021" },
    "una respuesta a un mensaje suyo": { quoted: { sender: TERO } },
  };
  for (const [forma, pedido] of Object.entries(formas)) {
    await pedir("a@lid", pedido);
    assert.deepEqual(ultimoEnviado().msg, { text: "🪙 Tero tiene *1250 UruCoins* · puede apostar hasta 250 por jugada" }, forma);
  }

  const tuyo = "🪙 Tenés *120 UruCoins* · podés apostar hasta 100 por jugada";
  await pedir("a@lid", { quoted: { sender: globalThis.client.user.lid } });
  assert.equal(ultimoEnviado().msg.text, tuyo, "respondiendo un resultado del casino, el tuyo: el bot no juega");
  await pedir("a@lid", { quoted: { sender: globalThis.client.user.jid } });
  assert.equal(ultimoEnviado().msg.text, tuyo, "también si el bot viene por número");
  await pedir("a@lid", { text: "@a", mentionedJid: ["a@lid"] });
  assert.equal(ultimoEnviado().msg.text, tuyo, "nombrándote a vos");
  // The bot's phone number typed by hand, which nothing on record has: only the group, listing it, says it's the bot.
  const user = globalThis.client.user;
  globalThis.client.user = { ...user, lid: "300000000000050@lid", jid: "59899000050@s.whatsapp.net" };
  try {
    await pedir("a@lid", { text: "@59899000050", participants: [{ id: "300000000000050@lid", phoneNumber: "59899000050@s.whatsapp.net" }] });
    assert.equal(ultimoEnviado().msg.text, tuyo, "el número del bot tipeado");
  } finally {
    globalThis.client.user = user;
  }

  // Someone who never wrote has no row and is still not you: before, this was your own balance.
  await pedir("a@lid", { text: "@300000000000099", mentionedJid: ["300000000000099@lid"] });
  assert.equal(ultimoEnviado().msg.text, "🪙 alguien tiene *0 UruCoins*");
  // A number Tero left, whom the group lists now under someone else's LID: that someone, not Tero.
  await pedir("a@lid", { text: "+598 99 000 021", participants: [{ id: "300000000000077@lid", phoneNumber: "59899000021@s.whatsapp.net" }] });
  assert.equal(ultimoEnviado().msg.text, "🪙 alguien tiene *0 UruCoins*");

  // A name typed by hand isn't a mention, and a number nobody has isn't anyone: neither is a question about you.
  const pista = "🪙 No sé de quién querés ver el saldo: elegí a la persona de la lista que aparece al escribir @, o respondé un mensaje suyo con .bal.";
  for (const text of ["@Tero", "+598 99 999 999"]) {
    await pedir("a@lid", { text });
    assert.equal(ultimoEnviado().msg.text, pista, text);
  }
});

test(".baltop lista a los más ricos y te ubica si no entrás", async () => {
  await correr(Top, "a@lid", "vacio@g.us");
  assert.match(ultimoEnviado().msg.text, /nadie tiene UruCoins/);
  for (let i = 1; i <= 12; i++) {
    F.initDataDB({ chat: G, sender: `u${i}@lid`, senderJid: "", pushName: `u${i}` });
    fijarSaldo(F, G, `u${i}@lid`, i * 10);
  }
  fijarSaldo(F, G, "a@lid", 5);
  await correr(Top, "u1@lid");
  const { text, mentions } = ultimoEnviado().msg;
  assert.match(text, /LOS MÁS RICOS DEL GRUPO/);
  // with a name and without tagging anyone
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
