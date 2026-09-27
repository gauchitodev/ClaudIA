import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, ultimoEnviado } from "./helpers.mjs";

// .resumen: the header only promises the hours it really covers, a message that starts by mentioning someone is chat
// (not a command), and a failed AI call doesn't leave the cooldown on. Gemini is swapped for a fake.

let Resumen, CC;
let falla = false; // true: Gemini answers 500
let pedidos = []; // the prompts Gemini got
const fetchReal = globalThis.fetch;
const uptimeReal = process.uptime;
const errorReal = console.error;
const C = "resumen@g.us";
const MIN = 60 * 1000;

before(async () => {
  await prepararBase("resumen");
  globalThis.geminiApiKey = "clave";
  console.error = () => {};
  process.uptime = () => 48 * 3600; // the bot has been up for two days
  globalThis.fetch = async (url, opciones = {}) => {
    const body = JSON.parse(opciones.body);
    pedidos.push(body.contents?.[0]?.parts?.[0]?.text || "");
    if (falla) return { ok: false, status: 500, text: async () => "" };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "Se habló del asado." }] } }] }) };
  };
  Resumen = (await import("../plugins/resumen.js")).default;
  CC = await import("../lib/contexto-chat.js");
  globalThis.plugins = { "resumen.js": Resumen };
});
after(() => {
  globalThis.fetch = fetchReal;
  process.uptime = uptimeReal;
  console.error = errorReal;
});
beforeEach(() => {
  globalThis.contextoChat.delete(C);
  globalThis.contextoChatRecorte.delete(C);
  globalThis.resumenCooldown.delete(C);
  falla = false;
  pedidos = [];
});

async function pedir(args = []) {
  const client = { ...clienteFalso(), sendPresenceUpdate: async () => {} };
  await Resumen.run({ chat: C, isGroup: true, sender: "555@lid" }, { client, args });
  return ultimoEnviado().msg.text;
}

test("con pocos mensajes el encabezado dice las horas pedidas", async () => {
  const ahora = Date.now();
  for (let i = 10; i > 0; i--) CC.recordarMensaje(C, "Ana", `mensaje ${i}`, false, { fecha: ahora - i * 10 * MIN });
  assert.match(await pedir(["6"]), /^📝 \*Resumen de las últimas 6 h\* \(10 mensajes\)/);
});

test("en un grupo movido dice lo que de verdad cubre", async () => {
  const ahora = Date.now();
  for (let i = 360; i > 0; i--) CC.recordarMensaje(C, "Ana", `mensaje ${i}`, false, { fecha: ahora - i * MIN });
  const texto = await pedir(["6"]);
  assert.match(texto, /^📝 \*Resumen de las últimas 3 h 20 min\* \(200 mensajes; pediste 6 h, pero no tengo guardado más atrás\)/);
  assert.match(pedidos[0], /de las últimas 3 h 20 min/);
});

test("si el recorte quedó antes de la ventana, la ventana está completa", async () => {
  const ahora = Date.now();
  for (let i = 360; i > 0; i--) CC.recordarMensaje(C, "Ana", `mensaje ${i}`, false, { fecha: ahora - i * MIN });
  assert.match(await pedir(["2"]), /^📝 \*Resumen de las últimas 2 h\* \(\d+ mensajes\)/);
});

test("un mensaje que arranca con una mención entra; un comando no", async () => {
  const ahora = Date.now();
  for (let i = 5; i > 0; i--) CC.recordarMensaje(C, "Ana", `charla ${i}`, false, { fecha: ahora - i * MIN });
  CC.recordarMensaje(C, "Beto", "@59899123456 vení que te cuento", false, { fecha: ahora });
  CC.recordarMensaje(C, "Beto", ".resumen 3", false, { fecha: ahora });
  CC.recordarMensaje(C, "Beto", "@resumen", false, { fecha: ahora });
  await pedir();
  assert.match(pedidos[0], /Beto: @59899123456 vení que te cuento/);
  assert.doesNotMatch(pedidos[0], /\.resumen 3|Beto: @resumen/);
  assert.equal(CC.esComando("@59899123456 hola"), false);
  assert.equal(CC.esComando("@resumen"), true);
  assert.equal(CC.esComando(".cualquiercosa"), true);
});

test("si la IA falla, se puede volver a pedir enseguida; si sale bien, hay que esperar", async () => {
  const ahora = Date.now();
  for (let i = 10; i > 0; i--) CC.recordarMensaje(C, "Ana", `mensaje ${i}`, false, { fecha: ahora - i * MIN });
  falla = true;
  assert.match(await pedir(), /Se me trabó el resumen/);
  falla = false;
  assert.match(await pedir(), /^📝 \*Resumen/);
  assert.match(await pedir(), /Recién hice un resumen/);
});

test("las horas se acotan de 1 a 24, y sin número son 6", async () => {
  const ahora = Date.now();
  for (let i = 10; i > 0; i--) CC.recordarMensaje(C, "Ana", `mensaje ${i}`, false, { fecha: ahora - i * MIN });
  assert.match(await pedir(["0"]), /últimas 1 h\*/);
  globalThis.resumenCooldown.delete(C);
  assert.match(await pedir(["99"]), /últimas 24 h\*/);
  globalThis.resumenCooldown.delete(C);
  assert.match(await pedir(["hola"]), /últimas 6 h\*/);
});
