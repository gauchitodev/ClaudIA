import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado, fijarSaldo } from "./helpers.mjs";

// Who a command points at when the "@" was typed by hand instead of picked from WhatsApp's list: then the message
// carries no mentionedJid, only the digits. Those digits may be a LID or a phone number, and lidMencionado, then in
// lib/menciones.js, used to build "<digits>@lid" blindly: a typed phone number became a LID that matches nobody, in the
// 17 plugins that use it.

let F, I, Par, Regalar;
const LID = "123456789012345@lid";
const TEL = "59899111222";
before(async () => {
  ({ F } = await prepararBase("menciones"));
  I = await import("../lib/identidad.js");
  Par = await import("../lib/parejas.js");
  Regalar = (await import("../plugins/coins-regalar.js")).default;
  F.initDataDB({ chat: G, sender: LID, senderJid: `${TEL}@s.whatsapp.net` });
  F.initDataDB({ chat: G, sender: "222222222222222@lid", senderJid: "59899333444@s.whatsapp.net" });
  F.initDataDB({ chat: G, sender: "a@lid", senderJid: "" });
});

const sin = { mentionedJid: [] };

test("un @número tipeado se resuelve a la persona: por LID o por teléfono", () => {
  assert.equal(I.lidMencionado(sin, "@123456789012345"), LID, "los dígitos de un LID conocido");
  assert.equal(I.lidMencionado(sin, `@${TEL} 50`), LID, "el teléfono de alguien conocido da su LID");
  assert.equal(I.lidMencionado(sin, "@59800000000"), "59800000000@lid", "sin nada que lo resuelva queda como estaba");
  assert.equal(I.lidMencionado({ mentionedJid: ["999@lid"] }, `@${TEL}`), "999@lid", "una mención de verdad manda");
  assert.deepEqual(I.lidsMencionados(sin, `@${TEL} @59899333444`), [LID, "222222222222222@lid"]);
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

// Naming by WhatsApp name or by phone number, for the lists that name people without tagging them (.familias, .baltop,
// .ranking…): the nickname from the shop can be anything, and a tree or a ranking didn't say who was who.
test("nombreDe por nombre o por número: la palabra del comando, los paréntesis, y solo mientras se arma el texto", async () => {
  const M = await import("../lib/menciones.js");
  const OTRO = "222222222222222@lid";
  F.updateUser(LID, { apodo: "Tito", pushName: "Carlos" });
  F.updateUser(OTRO, { apodo: "", pushName: "Ana" });
  F.updateUser("a@lid", { apodo: "Pepe", pushName: "" });
  // the word, wherever it goes, with or without its accent, and the text without it
  assert.deepEqual(M.modoDeNombre("@40 nombres"), { modo: "nombres", texto: "@40" });
  assert.deepEqual(M.modoDeNombre("Números @40"), { modo: "numeros", texto: "@40" });
  assert.deepEqual(M.modoDeNombre("nombre"), { modo: "nombres", texto: "" });
  assert.deepEqual(M.modoDeNombre("@40"), { modo: "apodo", texto: "@40" });
  assert.deepEqual(M.modoDeNombre(""), { modo: "apodo", texto: "" });
  assert.deepEqual(M.modoDeNombre("sinnombres"), { modo: "apodo", texto: "sinnombres" });
  // as always: the nickname, or the name
  assert.deepEqual([LID, OTRO, "a@lid"].map(M.nombreDe), ["Tito", "Ana", "Pepe"]);
  // by name: the WhatsApp name, with the nickname in brackets when they have one; without a name, the nickname
  assert.deepEqual(M.nombrandoPor("nombres", () => [LID, OTRO, "a@lid"].map(M.nombreDe)), ["Carlos (Tito)", "Ana", "Pepe"]);
  // by number: the one they're known by, with what they're called; without a number the bot knows, it says so
  assert.deepEqual(M.nombrandoPor("numeros", () => [LID, OTRO, "a@lid"].map(M.nombreDe)), [`+${TEL} (Tito)`, "+59899333444 (Ana)", "Pepe (sin número)"]);
  // Claudia is Claudia, number or not
  assert.equal(M.nombrandoPor("numeros", () => M.nombreDe(globalThis.client.user.lid)), "Claudia");
  // the mode holds through the awaits of the text being built, and not past it, nor over another built in the meantime
  const lento = M.nombrandoPor("numeros", async () => {
    await new Promise((r) => setTimeout(r, 5));
    return M.nombreDe(LID);
  });
  assert.equal(M.nombrandoPor("nombres", () => M.nombreDe(LID)), "Carlos (Tito)");
  assert.equal(M.nombreDe(LID), "Tito");
  assert.equal(await lento, `+${TEL} (Tito)`);
  assert.equal(M.nombrandoPor("apodo", () => M.nombreDe(LID)), "Tito");
});
