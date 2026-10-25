import { test, before } from "node:test";
import assert from "node:assert/strict";
import { serialize, smsg, mensajeGuardado } from "../lib/wa-socket.js";
import { G } from "./helpers.mjs";

// The anti-delete (plugins/_anti-delete-messages.js) re-posts what someone deleted in a group that has it on. It looked
// the message up by id in every chat the bot keeps, and believed any deletion: a modified client can send one with any
// id, so a forged deletion could bring out another group's message, or show someone deleting what they never did.

serialize();
let A;
const OTRO = "otro@g.us";
before(async () => {
  globalThis.baileys = "@whiskeysockets/baileys"; // the plugin imports Baileys through this global
  A = (await import("../plugins/_anti-delete-messages.js")).default;
});

const guardado = (chat, id, autor, texto) => ({ key: { remoteJid: chat, fromMe: false, id, participant: autor }, message: { conversation: texto } });
function cliente() {
  const c = { user: { lid: "bot@lid", id: "bot@s.whatsapp.net", jid: "bot@s.whatsapp.net" }, mensajes: [] };
  // Like pushMessage: each chat's messages under that chat, and a quoted copy under its author, with no group.
  c.chats = {
    [G]: { subject: "Grupo", messages: { G1: guardado(G, "G1", "beto@lid", "lo que dijo Beto"), B1: guardado(G, "B1", "bot@s.whatsapp.net", "algo que dijo Claudia") } },
    [OTRO]: { subject: "Otro", messages: { O1: guardado(OTRO, "O1", "beto@lid", "algo del otro grupo") } },
    "beto@lid": { messages: { C1: guardado("beto@lid", "C1", "beto@lid", "una cita vieja") } },
  };
  c.loadMessage = (id, chat) => mensajeGuardado(c.chats, id, chat);
  c.serializeM = (msg) => smsg(c, msg);
  c.sendMessage = async (chat, msg) => c.mensajes.push(msg);
  c.parseMention = () => [];
  return c;
}
async function borrar(id, quien, { isWaAdmin = false } = {}) {
  const c = cliente();
  const m = { chat: G, sender: quien, message: { protocolMessage: { type: 0, key: { id } } } };
  await A.before(m, { client: c, chat: { antiDelete: 1 }, isWaAdmin });
  return c.mensajes.map((x) => x.text);
}

test("mensajeGuardado: con chat busca solo entre los de ese chat", () => {
  const { chats } = cliente();
  assert.equal(mensajeGuardado(chats, "O1").message.conversation, "algo del otro grupo", "sin chat, en todos (como antes)");
  assert.equal(mensajeGuardado(chats, "O1", G), undefined);
  assert.equal(mensajeGuardado(chats, "G1", G).message.conversation, "lo que dijo Beto");
  assert.equal(mensajeGuardado(chats, "G1", "nada@g.us"), undefined);
});

test("lo borra su autor: se repostea", async () => {
  const textos = await borrar("G1", "beto@lid");
  assert.equal(textos.length, 1);
  assert.match(textos[0], /lo que dijo Beto/);
});

test("un borrado con el id de un mensaje de otro chat no saca nada", async () => {
  assert.deepEqual(await borrar("O1", "beto@lid"), []);
  // A quoted copy doesn't say which group it came from: it's left out too.
  assert.deepEqual(await borrar("C1", "beto@lid"), []);
});

test("un borrado de otra persona solo vale si es admin del grupo", async () => {
  assert.deepEqual(await borrar("G1", "caro@lid"), [], "Caro no puede borrar lo de Beto: el borrado es falso");
  const textos = await borrar("G1", "caro@lid", { isWaAdmin: true });
  assert.match(textos[0], /lo que dijo Beto/, "un admin de WhatsApp sí puede borrar lo de otro");
});

// A group that lists people by number keys Claudia's own messages by her number: deleted by an admin, she posted them
// back, as if someone else's.
test("un mensaje de Claudia guardado con su número no se repostea", async () => {
  assert.deepEqual(await borrar("B1", "admin@lid", { isWaAdmin: true }), []);
});
