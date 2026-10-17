import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prepararBase, clienteFalso, esperar } from "./helpers.mjs";

// The whole of handle-message, from the message as Baileys hands it over: the hooks in their order (hooksEnOrden,
// load-functions.js) and then the command. The plugins of each test are the real ones (or a spy standing in for a
// command), loaded from the folder.

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GRUPO = "120363000000000001@g.us";
const BOT = "200000000000001@lid";
const ANA = "300000000000002@lid";
const BETO = "300000000000003@lid";
let F, handleMessage, RITMO, esperarTurno;
const carpeta = {}; // file name -> plugin, every plugin in the folder
const prompts = []; // what Claudia asked the AI
const fetchReal = globalThis.fetch;
const logReal = console.log;
const ritmoReal = {};

before(async () => {
  ({ F } = await prepararBase("handle-message"));
  globalThis.txt = (await import("../lib/strings.js")).default;
  globalThis.geminiApiKey = "clave";
  globalThis.baileys = "@whiskeysockets/baileys"; // the dynamic import in plugins/_anti-delete-messages.js expects it
  ({ RITMO, esperarTurno } = await import("../lib/ritmo.js"));
  for (const k of ["TIPEO_MIN_MS", "TIPEO_MAX_MS", "TIPEO_POR_LETRA_MS", "MIN_ENTRE_MENSAJES_MS"]) ritmoReal[k] = RITMO[k];
  Object.assign(RITMO, { TIPEO_MIN_MS: 0, TIPEO_MAX_MS: 1, TIPEO_POR_LETRA_MS: 0, MIN_ENTRE_MENSAJES_MS: 600 });
  console.log = () => {}; // the AI modules narrate which model answered
  globalThis.fetch = async (url, opciones) => {
    prompts.push(JSON.parse(opciones.body).contents[0].parts.at(-1).text);
    return { ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ comando: "ninguno", respuesta: "Ni idea, preguntale a quien la publicó" }) }] } }] }) };
  };
  (await import("../lib/wa-socket.js")).serialize(); // what turns Baileys' message into the bot's m
  ({ handleMessage } = await import("../handle-message.js"));
  for (const archivo of fs.readdirSync(path.join(RAIZ, "plugins")).filter((f) => f.endsWith(".js")).sort()) {
    carpeta[archivo] = (await import(`../plugins/${archivo}`)).default;
  }
  for (const [quien, nombre] of [[ANA, "Ana"], [BETO, "Beto"]]) F.initDataDB({ chat: GRUPO, sender: quien, senderJid: "", pushName: nombre });
});
after(() => {
  globalThis.fetch = fetchReal;
  console.log = logReal;
  Object.assign(RITMO, ritmoReal);
});

// A connected socket, as far as handle-message goes. With turnos, every send waits its turn, as lib/envios.js makes the
// real ones do.
function cliente({ turnos = false } = {}) {
  const base = clienteFalso();
  const client = {
    ...base,
    user: { id: "59800000001:5@s.whatsapp.net", lid: BOT, jid: "59800000001@s.whatsapp.net", name: "Claudia" },
    decodeJid: (j) => (typeof j === "string" ? j.replace(/:\d+@/, "@") : j),
    pushMessage: async () => {},
    readMessages: async () => {},
    ev: { emit() {}, on() {} },
    groupMetadata: async (id) => ({ id, subject: "Grupo", participants: [ANA, BETO].map((p) => ({ id: p, admin: null })).concat({ id: BOT, admin: "admin" }) }),
    sendPresenceUpdate: async () => {},
  };
  if (turnos) for (const f of ["sendMessage", "sendText"]) client[f] = async (chat, ...resto) => (await esperarTurno(chat), base[f](chat, ...resto));
  globalThis.client = client; // handle-message reads the bot's own ids from it
  return client;
}

let numero = 0;
// What Baileys hands over for a text message from someone in the group, just arrived.
function llega(client, sender, texto) {
  const id = `ABCDEF${String(++numero).padStart(6, "0")}`;
  const hecho = handleMessage.call(client, { key: { remoteJid: GRUPO, fromMe: false, id, participant: sender }, message: { conversation: texto }, messageTimestamp: Math.floor(Date.now() / 1000), pushName: sender === ANA ? "Ana" : "Beto", _upsertType: "notify", _llegada: Date.now() });
  return { id, hecho };
}

// The moderation deletes the message and marks it (m.moderado), and the hooks after it leave it alone: the dispatcher
// has to as well. ".tt <link>" with TikTok links banned had the link deleted and warned about, and then .tt downloaded
// the video and posted it.
test("lo que borra la moderación no corre como comando", async () => {
  const corrieron = [];
  const espia = (cmd) => ({ cmd: [cmd], run: async (m, { text }) => corrieron.push(`.${cmd} ${text}`) });
  globalThis.plugins = { "_all-anti-links.js": carpeta["_all-anti-links.js"], "_anti-link-plus.js": carpeta["_anti-link-plus.js"], "dl-tiktok.js": espia("tt"), "tools-screenshot-web.js": espia("ss") };
  const client = cliente();
  const mandar = async (texto) => {
    globalThis.enviados = [];
    corrieron.length = 0;
    const { id, hecho } = llega(client, ANA, texto);
    await hecho;
    return { borrado: globalThis.enviados.some((e) => e.msg?.delete?.id === id), corrieron: [...corrieron] };
  };
  F.updateChat(GRUPO, { antiTiktok: 1 });
  assert.deepEqual(await mandar(".tt https://www.tiktok.com/@ana/video/7300000000000000000"), { borrado: true, corrieron: [] });
  F.updateChat(GRUPO, { antiTiktok: 0, allAntiLinks: 1 });
  assert.deepEqual(await mandar(".ss https://sitio-prohibido.com"), { borrado: true, corrieron: [] });
  F.updateChat(GRUPO, { allAntiLinks: 0 });
  assert.deepEqual(await mandar(".ss https://sitio-permitido.com"), { borrado: false, corrieron: [".ss https://sitio-permitido.com"] }, "sin anti-link, el comando corre");
});

// Claudia's short-term memory gets each message as it comes, whatever the hooks before her chat send. A "#vendo" waits
// for its confirmation to go out (one bot message every so often in each chat, lib/ritmo.js), and the question about it
// that came right after was answered without it, and stored before it. The hooks are the real ones that write that
// memory or answer from it, found by their marks, and the marketplace's.
test("memoria corta: cada mensaje entra cuando llega, aunque los hooks de antes manden algo", async () => {
  globalThis.plugins = Object.fromEntries(Object.entries(carpeta).filter(([archivo, p]) => typeof p?.before === "function" && (p.trasModeracion || p.alFinal || archivo === "_compraventa.js")));
  globalThis.contextoChat.delete(GRUPO);
  const client = cliente({ turnos: true });
  await client.sendText(GRUPO, "(algo que Claudia acaba de mandar)"); // so the next send in this chat waits its turn
  const venta = llega(client, ANA, "#vendo bici rodado 26, $ 4.000, Pocitos");
  await esperar(50);
  const pregunta = llega(client, BETO, "claudia, ¿la bici que publicaron recién tiene cambios?");
  await Promise.all([venta.hecho, pregunta.hecho]);
  const contexto = prompts.at(-1).match(/Últimos mensajes del grupo[^\n]*\n([\s\S]*?)\n\n/)?.[1];
  assert.equal(contexto, "- Ana: #vendo bici rodado 26, $ 4.000, Pocitos", "Claudia contesta sabiendo de la venta, y la pregunta va aparte");
  assert.deepEqual(
    globalThis.contextoChat.get(GRUPO).map((x) => [x.nombre, x.id]),
    [["Ana", venta.id], ["Beto", pregunta.id], ["Claudia", globalThis.contextoChat.get(GRUPO).at(-1).id]],
    "en el orden en que llegaron",
  );
});
