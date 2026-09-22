import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";
import strings from "../lib/strings.js";

let F, LN, B, P, Manejador;

// What WhatsApp answers on removal: "200" is ok. Another can be forced to test the rejection path.
let expulsiones = [];
let statusExpulsion = "200";

before(async () => {
  ({ F } = await prepararBase("lista-negra"));
  globalThis.txt = strings;
  globalThis.client.decodeJid = (j) => j;
  globalThis.client.user.lid = "999000@lid";
  globalThis.client.groupParticipantsUpdate = async (chat, ids, accion) => {
    expulsiones.push({ chat, ids, accion });
    return ids.map((jid) => ({ status: statusExpulsion, jid }));
  };
  LN = await import("../lib/lista-negra.js");
  B = await import("../lib/bienvenida.js");
  P = (await import("../plugins/grupo-lista-negra.js")).default;
  Manejador = (await import("../plugins/_manejador-lista-negra.js")).default;
});

beforeEach(() => {
  expulsiones = [];
  statusExpulsion = "200";
  globalThis.enviados = [];
  db.exec("DELETE FROM lista_negra");
});

// The group lists everyone by LID. 111 is the only one whose number WhatsApp sent; 222 joined and never wrote.
const participants = [
  { id: "100@lid", admin: "superadmin", phoneNumber: "59899100100@s.whatsapp.net" },
  { id: "111@lid", admin: null, phoneNumber: "59899111111@s.whatsapp.net" },
  { id: "222@lid", admin: null },
  { id: "999000@lid", admin: "admin" },
];

const mensaje = (extra = {}) => ({
  chat: G,
  isGroup: true,
  sender: "100@lid",
  senderJid: "59899100100@s.whatsapp.net",
  mentionedJid: [],
  quoted: null,
  react: async () => {},
  delete: async () => {},
  ...extra,
});

const correr = (command, text, extra = {}, opciones = {}) =>
  P.run(mensaje(extra), { client: globalThis.client, text, command, usedPrefix: ".", participants, isBotAdmin: true, ...opciones });

const ultimo = () => ultimoEnviado()?.msg?.text || "";

test("por número: lo anota y lo expulsa con el LID, que es el id con el que el grupo lo lista", async () => {
  await correr("ln", "+59899111111 spam");

  const entrada = F.isBlacklisted("59899111111@s.whatsapp.net", G);
  assert.ok(entrada, "quedó anotado");
  assert.equal(entrada.reason, "spam");
  assert.equal(entrada.lid, "111@lid", "guardó el LID para reconocerlo después");
  assert.deepEqual(expulsiones, [{ chat: G, ids: ["111@lid"], accion: "remove" }]);
});

test("por mención: a quien nunca escribió se lo anota igual y se lo echa", async () => {
  // 222 has no users row and no number in the metadata: the command used to bail out with "no record of the user".
  await correr("ln", "@222 molesta", { mentionedJid: ["222@lid"] });

  const entrada = F.isBlacklisted("222@lid", G);
  assert.ok(entrada, "se anota por LID cuando no se conoce el número");
  assert.equal(entrada.reason, "molesta");
  assert.deepEqual(expulsiones, [{ chat: G, ids: ["222@lid"], accion: "remove" }]);
});

test("si WhatsApp rechaza la expulsión, lo dice en el grupo en vez de callarse", async () => {
  statusExpulsion = "403";
  await correr("ln", "+59899111111 spam");

  assert.equal(expulsiones.length, 1);
  assert.match(ultimo(), /no me dejó echarlo \(error 403\)/);
});

test("sin admin lo anota y avisa que no puede echarlo", async () => {
  await correr("ln", "+59899111111 spam", {}, { isBotAdmin: false });

  assert.ok(F.isBlacklisted("59899111111@s.whatsapp.net", G), "queda anotado igual");
  assert.equal(expulsiones.length, 0);
  assert.match(ultimo(), /no lo puedo echar porque no soy admin/);
});

test("si no está en el grupo, queda anotado para cuando entre", async () => {
  await correr("ln", "+59899555555 spam");

  assert.ok(F.isBlacklisted("59899555555@s.whatsapp.net", G));
  assert.equal(expulsiones.length, 0);
  assert.match(ultimo(), /lo echo apenas entre/);
});

test("a un admin del grupo no se lo puede anotar", async () => {
  await correr("ln", "+59899100100 porque sí", { sender: "111@lid", senderJid: "59899111111@s.whatsapp.net" });

  assert.equal(F.isBlacklisted("59899100100@s.whatsapp.net", G), null);
  assert.match(ultimo(), /No se puede meter a un admin/);
});

test("quien está anotado por número se reconoce por su LID cuando escribe", async () => {
  F.addToBlacklist("59899111111@s.whatsapp.net", "spam", "100@s.whatsapp.net", G);

  // The message arrives with the LID only, no number: this is the case that was never detected before.
  const m = mensaje({ sender: "111@lid", senderJid: "", messageStubType: null });
  const frenado = await Manejador.before(m, { client: globalThis.client, participants, isBotAdmin: true, isRAdmin: false });

  assert.equal(frenado, true);
  assert.deepEqual(expulsiones, [{ chat: G, ids: ["111@lid"], accion: "remove" }]);
  assert.match(ultimo(), /LISTA NEGRA/);
  assert.equal(F.isBlacklisted("59899111111@s.whatsapp.net", G).lid, "111@lid", "de paso aprende el LID");
});

// What Baileys 7 actually hands to group-participants.update: objects, not strings (Socket/messages-recv.js builds
// them as { id, phoneNumber, lid, username, admin }). The first version of this test passed bare ids, a shape the
// event never has, and so it never saw that every real join threw.
const entran = (...ids) => ids.map((id) => ({ id, phoneNumber: id === "111@lid" ? "59899111111@s.whatsapp.net" : undefined, lid: undefined, username: undefined, admin: null }));

test("al entrar al grupo se lo echa sin esperar a que escriba", async () => {
  F.addToBlacklist("59899111111@s.whatsapp.net", "spam", "100@s.whatsapp.net", G, "111@lid");

  const nuevos = entran("111@lid", "222@lid");
  const { expulsados, fallados } = await LN.expulsarDeListaNegra(globalThis.client, G, nuevos, participants);

  assert.equal(expulsados.length, 1);
  assert.equal(fallados.length, 0);
  assert.equal(expulsados[0].original, nuevos[0], "devuelve la entrada del evento, que es lo que se compara después");
  assert.deepEqual(expulsiones, [{ chat: G, ids: ["111@lid"], accion: "remove" }]);
});

// ---------- someone joins: lib/bienvenida.js ----------
// This used to be inline in main.js, out of reach of any test. The bug it hid: the blacklist step threw on every
// join, and since the rules went out after it, the welcome stopped going out too in every group where the bot is admin.

const conReglas = () => {
  db.prepare("INSERT OR IGNORE INTO chats (remoteJid) VALUES (?)").run(G);
  F.updateChat(G, { reglas: "Nada de spam." });
};
const bienvenida = () => globalThis.enviados.find((e) => /Bienvenid@s/.test(e.msg?.text || ""))?.msg;

test("al entrar: el anotado sale y los demás reciben las reglas", async () => {
  conReglas();
  F.addToBlacklist("59899111111@s.whatsapp.net", "spam", "100@s.whatsapp.net", G, "111@lid");

  await B.recibirNuevos(globalThis.client, G, entran("111@lid", "222@lid"), { participants });

  assert.deepEqual(expulsiones, [{ chat: G, ids: ["111@lid"], accion: "remove" }]);
  assert.deepEqual(bienvenida()?.mentions, ["222@lid"], "la bienvenida es solo para el que no está anotado");
});

test("al entrar: si la lista negra falla, la bienvenida sale igual", async () => {
  conReglas();
  const errorReal = console.error;
  console.error = () => {};
  try {
    // Metadata that can't be read: the blacklist step blows up, whatever the reason.
    await B.recibirNuevos(globalThis.client, G, entran("222@lid"), { participants: "roto" });
  } finally {
    console.error = errorReal;
  }
  assert.deepEqual(bienvenida()?.mentions, ["222@lid"], "un error en la lista negra no se lleva puesta la bienvenida");
});

test("al entrar: si el bot no es admin no echa a nadie, pero da la bienvenida", async () => {
  conReglas();
  F.addToBlacklist("59899111111@s.whatsapp.net", "spam", "100@s.whatsapp.net", G, "111@lid");
  const sinAdmin = participants.map((p) => (p.id === "999000@lid" ? { ...p, admin: null } : p));

  await B.recibirNuevos(globalThis.client, G, entran("111@lid"), { participants: sinAdmin });

  assert.deepEqual(expulsiones, [], "sin ser admin no lo puede echar");
  assert.deepEqual(bienvenida()?.mentions, ["111@lid"], "lo echará el manejador cuando escriba, si le dan admin al bot");
});

test("la lista de todos los grupos vale en cualquier grupo, y la del grupo no se filtra a otro", async () => {
  F.addToBlacklist("59899111111@s.whatsapp.net", "spam", "owner@s.whatsapp.net", "*", "111@lid");
  F.addToBlacklist("59899222222@s.whatsapp.net", "spam", "100@s.whatsapp.net", G);

  assert.ok(F.isBlacklisted("111@lid", "otro@g.us"), "la global vale en cualquier grupo");
  assert.equal(F.isBlacklisted("59899222222@s.whatsapp.net", "otro@g.us"), null, "la del grupo no");
});

test(".ln2 saca a la persona anotada por LID o por número", async () => {
  F.addToBlacklist("59899111111@s.whatsapp.net", "spam", "100@s.whatsapp.net", G, "111@lid");

  await correr("ln2", "@111", { mentionedJid: ["111@lid"] });
  assert.equal(F.isBlacklisted("59899111111@s.whatsapp.net", G), null, "lo sacó mencionándolo por LID");
});
