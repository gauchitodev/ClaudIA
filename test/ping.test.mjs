import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado, esperar } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";

// .ping (plugins/ping.js): Pong, the round trip to WhatsApp timed on the ping Baileys keeps the connection alive with,
// since when the bot is on and connected, and whether the message came late.
let P, PING;
before(async () => {
  await prepararBase("ping");
  ({ default: P, PING } = await import("../plugins/ping.js"));
});
const correr = (client, m = {}) => P.run({ chat: G, sender: "a@lid", isGroup: true, ...m }, { client });
const conQuery = (query) => ({ ...conexion.client, query });

test(".ping: Pong, lo que tarda WhatsApp en contestar y desde cuándo está prendida y conectada", async () => {
  const pedidos = [];
  // The wait is measured here too, with the same clock: a 40 ms timer may read as 39 on Date.now, and once did on CI.
  let tardo = 0;
  const client = conQuery(async (nodo, espera) => {
    pedidos.push({ nodo, espera });
    const antes = Date.now();
    await esperar(40);
    tardo = Date.now() - antes;
    return { tag: "iq", attrs: { type: "result" } };
  });
  conexion.horaConexion = Date.now() - 5 * 3600e3;
  try {
    globalThis.enviados = [];
    await correr(client);
    const texto = ultimoEnviado().msg.text;
    assert.match(texto, /^🏓 Pong\n📡 WhatsApp me contesta en (\d+) ms\.\n🟢 Encendida hace .+ · conectada hace 5 h 0 min\.$/);
    assert.ok(tardo >= 30 && Number(texto.match(/en (\d+) ms/)[1]) >= tardo, `${texto} (la espera tardó ${tardo} ms)`);
    // The same ping Baileys keeps the connection alive with, with a time limit, and nothing else sent for it.
    assert.deepEqual(pedidos.map((p) => [p.nodo.tag, p.nodo.attrs.to, p.nodo.attrs.type, p.nodo.attrs.xmlns, p.nodo.content[0].tag, p.espera]), [["iq", "@s.whatsapp.net", "get", "w:p", "ping", PING.ESPERA_MS]]);
    assert.equal(globalThis.enviados.length, 1);
  } finally {
    delete conexion.horaConexion;
  }
});

test(".ping: si WhatsApp no contesta, o la conexión falla, lo dice igual; sin query (otro socket), también", async () => {
  const esperaReal = PING.ESPERA_MS;
  PING.ESPERA_MS = 50;
  try {
    // Baileys gives undefined, without throwing, when the wait runs out.
    await correr(conQuery(async (nodo, espera) => esperar(espera)));
    assert.match(ultimoEnviado().msg.text, /^🏓 Pong\n📡 WhatsApp no me contestó el ping en 0\.05 s, pero acá estoy\.\n🟢 Encendida hace [^·]+\.$/);
    await correr(
      conQuery(async () => {
        throw new Error("Connection Closed");
      }),
    );
    assert.match(ultimoEnviado().msg.text, /^🏓 Pong\n📡 WhatsApp no me contestó el ping en 0\.05 s, pero acá estoy\.\n/);
  } finally {
    PING.ESPERA_MS = esperaReal;
  }
  await correr(conexion.client); // the tests' fake client has no query
  assert.match(ultimoEnviado().msg.text, /^🏓 Pong\n📡 WhatsApp no me contestó el ping en 5 s, pero acá estoy\.\n🟢 Encendida hace [^·]+\.$/);
});

test(".ping: dice cuando el mensaje tardó en llegarle, y no cuando llegó al toque", async () => {
  await correr(conexion.client, { messageTimestamp: Math.floor(Date.now() / 1000) - 12 });
  assert.match(ultimoEnviado().msg.text, /\n🐢 Tu mensaje salió hace 12 s: voy atrasada\.\n🟢 /);
  await correr(conexion.client, { messageTimestamp: Math.floor(Date.now() / 1000) });
  assert.doesNotMatch(ultimoEnviado().msg.text, /🐢/);
  await correr(conexion.client, {}); // no timestamp at all: nothing to say
  assert.doesNotMatch(ultimoEnviado().msg.text, /🐢/);
});

test(".ping es de cualquiera, está entre los extras y en el menú", async () => {
  const fs = await import("node:fs");
  const { secciones } = await import("../lib/secciones.js");
  assert.deepEqual([P.onlyGroup, P.onlyMod, P.onlyAdmin, P.onlyOwner, P.juego], [undefined, undefined, undefined, undefined, undefined]);
  assert.ok(secciones.extras.includes("ping"));
  assert.match(fs.readFileSync(new URL("../lib/menu.js", import.meta.url), "utf8"), /\n▸ \$\{usedPrefix\}ping 🏓 – /);
});
