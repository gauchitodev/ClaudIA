import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";

// .culpade (plugins/fun-culpa-de.js): "Culpa de @persona", with someone from the group at random, never the bot, and
// tagged by the id the group lists them under.

let Culpa;
before(async () => {
  await prepararBase("culpade");
  Culpa = (await import("../plugins/fun-culpa-de.js")).default;
});

const BOT = { id: "bot@lid", admin: "admin" };
const pedir = (participants, sender = "300000000000001@lid") => Culpa.run({ chat: G, sender, isGroup: true }, { client: globalThis.client, participants, command: "culpade" });

test(".culpade: le echa la culpa a alguien del grupo al azar, a veces a quien la pidió, nunca al bot, y lo arroba", async () => {
  const ANA = "300000000000001@lid";
  const BETO = "300000000000002@lid";
  const grupo = [BOT, { id: ANA, admin: null }, { id: BETO, admin: null }];
  const culpados = new Set();
  for (let i = 0; i < 200; i++) {
    await pedir(grupo);
    const { text, mentions } = ultimoEnviado().msg;
    assert.match(text, /^Culpa de @\d+$/);
    assert.deepEqual(mentions, [`${text.slice("Culpa de @".length)}@lid`], "la mención es la de quien nombra");
    culpados.add(mentions[0]);
  }
  assert.deepEqual([...culpados].sort(), [ANA, BETO], "con el tiempo, cualquiera del grupo, quien la pidió incluido, y el bot nunca");
});

test(".culpade: en un grupo que lista por número, lo arroba por el número que lista el grupo", async () => {
  // The "@<digits>" alone becomes "<digits>@lid": for a number, nobody, and WhatsApp tagged nobody.
  const NUMERO = "59899000001@s.whatsapp.net";
  await pedir([{ id: "59800000001@s.whatsapp.net", lid: "bot@lid", admin: "admin" }, { id: NUMERO, lid: "300000000000009@lid", admin: null }]);
  assert.deepEqual(ultimoEnviado().msg, { text: "Culpa de @59899000001", mentions: [NUMERO] });
});

test(".culpade: sin la lista de miembros lo dice, en vez de culpar a nadie", async () => {
  for (const participants of [[], undefined, [BOT]]) {
    await pedir(participants);
    assert.equal(ultimoEnviado().msg.text, "No pude ver la lista de miembros del grupo; probá de nuevo en un rato.");
  }
});
