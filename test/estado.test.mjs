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
