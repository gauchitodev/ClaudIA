import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado, fijarSaldo } from "./helpers.mjs";

// Who a command points at when the "@" was typed by hand instead of picked from WhatsApp's list: then the message
// carries no mentionedJid, only the digits. Those digits may be a LID or a phone number, and lib/menciones.js used to
// build "<digits>@lid" blindly: a typed phone number became a LID that matches nobody, in the 17 plugins that use it.

let F, M, Par, Regalar;
const LID = "123456789012345@lid";
const TEL = "59899111222";
before(async () => {
  ({ F } = await prepararBase("menciones"));
  M = await import("../lib/menciones.js");
  Par = await import("../lib/parejas.js");
  Regalar = (await import("../plugins/coins-regalar.js")).default;
  F.initDataDB({ chat: G, sender: LID, senderJid: `${TEL}@s.whatsapp.net` });
  F.initDataDB({ chat: G, sender: "222222222222222@lid", senderJid: "59899333444@s.whatsapp.net" });
  F.initDataDB({ chat: G, sender: "a@lid", senderJid: "" });
});

const sin = { mentionedJid: [] };

test("un @número tipeado se resuelve a la persona: por LID o por teléfono", () => {
  assert.equal(M.lidMencionado(sin, "@123456789012345"), LID, "los dígitos de un LID conocido");
  assert.equal(M.lidMencionado(sin, `@${TEL} 50`), LID, "el teléfono de alguien conocido da su LID");
  assert.equal(M.lidMencionado(sin, "@59800000000"), "59800000000@lid", "sin nada que lo resuelva queda como estaba");
  assert.equal(M.lidMencionado({ mentionedJid: ["999@lid"] }, `@${TEL}`), "999@lid", "una mención de verdad manda");
  assert.deepEqual(M.lidsMencionados(sin, `@${TEL} @59899333444`), [LID, "222222222222222@lid"]);
});

test("dosPersonas acepta los dos teléfonos tipeados con @", () => {
  assert.deepEqual(Par.dosPersonas(sin, `@${TEL} @59899333444`), [LID, "222222222222222@lid"]);
});

test("de punta a punta: .regalar @teléfono le llega a esa persona", async () => {
  fijarSaldo(F, G, "a@lid", 100);
  const text = `@${TEL} 30`;
  await Regalar.run({ chat: G, sender: "a@lid", text, mentionedJid: [], isGroup: true }, { client: globalThis.client, text, args: text.split(" ") });
  assert.match(ultimoEnviado().msg.text, /Le regalaste \*30 UruCoins\*/);
  assert.equal(F.getSaldoCoins(G, LID), 30);
});
