import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, ultimoEnviado } from "./helpers.mjs";

let P;
before(async () => {
  await prepararBase("estado");
  P = (await import("../plugins/estado.js")).default;
});

test(".estado muestra lo que guarda client.chats al lado de la memoria", async () => {
  // client.chats has no ceiling but a restart; this line is how to tell, on the tablet, whether it needs one.
  const client = globalThis.client;
  client.groupFetchAllParticipating = async () => ({ "g1@g.us": { id: "g1@g.us", subject: "Uno", participants: [] } });
  client.chats = {
    "g1@g.us": { id: "g1@g.us", messages: { A: {}, B: {}, C: {} } },
    "g2@g.us": { id: "g2@g.us" },
    "111@lid": { id: "111@lid", name: "Ana" }, // someone who wrote in a group
    "222@lid": { id: "222@lid", messages: { Q: {} } }, // someone quoted: their quoted messages are kept too
    "59899111222@s.whatsapp.net": { id: "59899111222@s.whatsapp.net", messages: { P: {}, R: {} } }, // a private chat
  };

  await P.run({ chat: "x@g.us", sender: "a@lid" }, { client });
  const texto = ultimoEnviado().msg.text;
  assert.match(texto, /\n🗃️ En memoria: 5 chats y contactos \(2 grupos\) · 6 mensajes\n💾 Memoria: \d/);
  assert.match(texto, /👥 Grupos: 1 · usuarios: \d+/, "el resto del estado sigue saliendo");
});

test(".estado dice qué modelo de Gemini está en pausa por cuota y cuánto le falta", async () => {
  const { MODELOS, geminiEnPausa } = await import("../lib/gemini.js");
  const client = globalThis.client;
  client.groupFetchAllParticipating = async () => ({});
  geminiEnPausa.set(MODELOS[0], { hasta: Date.now() + 90 * 1000, seguidos: 2 });
  try {
    await P.run({ chat: "x@g.us", sender: "a@lid" }, { client });
    assert.match(ultimoEnviado().msg.text, new RegExp(`\\n🧠 IA: .+ · en pausa por cuota: ${MODELOS[0].replaceAll(".", "\\.")} \\(vuelve en 1 min\\)\\n`));
  } finally {
    geminiEnPausa.clear();
  }
});

test(".estado dice con qué zona horaria anda el bot", async () => {
  const client = globalThis.client;
  client.groupFetchAllParticipating = async () => ({});
  await P.run({ chat: "x@g.us", sender: "a@lid" }, { client });
  const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
  assert.match(ultimoEnviado().msg.text.split("\n")[0], new RegExp(` · Node v[\\d.]+ · ${zona.replaceAll("/", "\\/").replaceAll("+", "\\+")}$`));
});

// The queue is lib/cola-descargas.js's, and .estado reads it from there.
test(".estado dice cuántas descargas hay en curso y en cola", async () => {
  const { colaDescargas } = await import("../lib/cola-descargas.js");
  const client = globalThis.client;
  client.groupFetchAllParticipating = async () => ({});
  colaDescargas.procesando = true;
  colaDescargas.tareas.push(async () => {}, async () => {});
  try {
    await P.run({ chat: "x@g.us", sender: "a@lid" }, { client });
    assert.match(ultimoEnviado().msg.text, /1 en curso, 2 en cola/);
  } finally {
    colaDescargas.procesando = false;
    colaDescargas.tareas.length = 0;
  }
});
