import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso } from "./helpers.mjs";

// .pin / .unpin: answering a message, it's pinned for everyone (7 days unless told otherwise) or unpinned. What's sent
// is the shape the installed Baileys builds a pinInChatMessage from: { pin: key, type, time }.

let Pin;
const G = "pin@g.us";
before(async () => {
  await prepararBase("pin");
  Pin = (await import("../plugins/grupo-pin.js")).default;
});

async function correr(command, args = [], quoted = { id: "Q1", fromMe: false, sender: "555@lid" }) {
  const client = clienteFalso();
  const reacciones = [];
  const m = { chat: G, isGroup: true, sender: "111@lid", quoted, react: async (e) => reacciones.push(e) };
  await Pin.run(m, { client, command, args });
  return { enviados: globalThis.enviados.map((e) => e.msg), reacciones };
}

const clave = { remoteJid: G, fromMe: false, id: "Q1", participant: "555@lid" };

test("pin: moderadores y admins, en grupos, con el bot admin", () => {
  assert.deepEqual([Pin.onlyMod, Pin.onlyGroup, Pin.botAdmin], [true, true, true]);
  assert.ok(["pin", "fijar", "destacar", "unpin", "desfijar"].every((c) => Pin.cmd.includes(c)));
});

test("pin: fija el mensaje citado, 7 días si no se dice otra cosa", async () => {
  assert.deepEqual(await correr("pin"), { enviados: [{ pin: clave, type: 1, time: 604800 }], reacciones: ["📌"] });
  assert.deepEqual((await correr("fijar", ["24h"])).enviados, [{ pin: clave, type: 1, time: 86400 }]);
  assert.deepEqual((await correr("destacar", ["30"])).enviados, [{ pin: clave, type: 1, time: 2592000 }]);
});

test("pin: .unpin y .pin quitar lo sacan", async () => {
  assert.deepEqual(await correr("unpin"), { enviados: [{ pin: clave, type: 2 }], reacciones: ["✔️"] });
  assert.deepEqual((await correr("pin", ["quitar"])).enviados, [{ pin: clave, type: 2 }]);
});

test("pin: sin mensaje citado o con una duración que WhatsApp no tiene, explica", async () => {
  const sinCita = await correr("pin", [], null);
  assert.match(sinCita.enviados[0].text, /Respondé al mensaje que querés fijar con \.pin/);
  assert.match((await correr("unpin", [], null)).enviados[0].text, /Respondé al mensaje fijado con \.unpin/);
  const rara = await correr("pin", ["3d"]);
  assert.match(rara.enviados[0].text, /solo deja fijar por 24h, 7d o 30d/);
  assert.equal(rara.reacciones.length, 0);
});
