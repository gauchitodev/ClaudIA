import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prepararBase, clienteFalso } from "./helpers.mjs";

// The hooks (plugin.before) run one after another on every message, in the order hooksEnOrden gives
// (load-functions.js): the moderation first, then Claudia's short-term memory, her chat last. It used to be the plugins
// folder's alphabetical order alone, with Claudia's chat in the middle: a trivia answer that named her waited for her
// to think and type while a later one took the prize, a blacklisted person got her answer before being removed, and
// #vendo published a post the anti-link had just deleted.

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const G = "hooks@g.us";
const BOT = "200000000000001@lid";
let F, L, Tr, hooks, contextoChat;
let consultasIA = 0; // how many times Claudia asked the AI
const fetchReal = globalThis.fetch;
const logReal = console.log;

before(async () => {
  ({ F } = await prepararBase("hooks"));
  globalThis.txt = (await import("../lib/strings.js")).default;
  globalThis.geminiApiKey = "clave";
  globalThis.baileys = "@whiskeysockets/baileys"; // the dynamic import in plugins/_anti-delete-messages.js expects it
  const { RITMO } = await import("../lib/ritmo.js");
  Object.assign(RITMO, { TIPEO_MIN_MS: 0, TIPEO_MAX_MS: 1, TIPEO_POR_LETRA_MS: 0 }); // no "typing..." wait
  console.log = () => {}; // the AI modules narrate which model answered
  globalThis.fetch = async () => {
    consultasIA++;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ comando: "ninguno", respuesta: "jaja" }) }] } }] }) };
  };
  L = await import("../load-functions.js");
  Tr = await import("../lib/trivia.js");
  ({ contextoChat } = await import("../lib/contexto-chat.js"));
  // The hooks these tests are about, inserted in the folder's order, as loadPlugins does.
  hooks = {};
  for (const nombre of ["_all-anti-links", "_anti-link-plus", "_auto-ia", "_chatbot-events", "_compraventa", "_hashtags", "_manejador-lista-negra", "_memoria-corta", "_trivia"]) {
    hooks[nombre] = (await import(`../plugins/${nombre}.js`)).default;
  }
  globalThis.plugins = hooks;
});
after(() => {
  globalThis.fetch = fetchReal;
  console.log = logReal;
});
beforeEach(() => {
  globalThis.autoIaCooldown.clear();
  Tr.cerrarRonda(G);
});

// What handle-message.js does with a message, as far as the hooks go.
async function correrHooks(m, { client = cliente(), participants = [], chat = {}, rango = {} } = {}) {
  for (const plugin of L.hooksEnOrden(hooks)) {
    if (m.moderado && !plugin.moderacion && !plugin.trasModeracion) continue;
    await plugin.before(m, { client, participants, isAdmin: false, isMod: false, isRAdmin: false, isWaAdmin: false, isBotAdmin: true, isOwner: false, user: {}, chat: { mentions: 1, ...chat }, ...rango });
  }
  return client;
}

function cliente() {
  const client = { ...clienteFalso(), sendPresenceUpdate: async () => {}, groupParticipantsUpdate: async (chat, quienes, accion) => (client.acciones.push(`${accion} ${quienes}`), [{ status: "200" }]) };
  client.user = { ...client.user, lid: BOT };
  client.acciones = [];
  return client;
}

const mensaje = (sender, text, extra = {}) => {
  const m = { chat: G, isGroup: true, sender, senderJid: "", pushName: sender, text, message: { conversation: text }, mentionedJid: [], quoted: null, key: { id: `${sender}-${text}`, participant: sender }, ...extra };
  m.delete = async () => (m.borrado = true);
  m.react = async (emoji) => (m.reaccion = emoji);
  return m;
};

test("orden: la moderación primero, después la memoria corta, la charla de Claudia al final y el resto como se cargó", () => {
  const hook = (nombre, extra = {}) => ({ nombre, before: async () => {}, ...extra });
  const plugins = {
    a: hook("a"),
    charla: hook("charla", { alFinal: true }),
    antiLink: hook("antiLink", { moderacion: true }),
    comando: { cmd: ["x"], run: async () => {} },
    b: hook("b"),
    memoria: hook("memoria", { trasModeracion: true }),
    listaNegra: hook("listaNegra", { moderacion: true }),
  };
  assert.deepEqual(
    L.hooksEnOrden(plugins).map((p) => p.nombre),
    ["antiLink", "listaNegra", "memoria", "a", "b", "charla"],
  );
  assert.deepEqual(L.hooksEnOrden(undefined), []);
});

test("orden: los hooks reales tienen su marca, y handle-message corre cada uno por su cuenta en ese orden", async () => {
  const marcados = { moderacion: [], trasModeracion: [], alFinal: [] };
  for (const archivo of fs.readdirSync(path.join(RAIZ, "plugins")).filter((f) => f.endsWith(".js"))) {
    const p = (await import(`../plugins/${archivo}`)).default;
    if (p?.moderacion) marcados.moderacion.push(archivo);
    if (p?.trasModeracion) marcados.trasModeracion.push(archivo);
    if (p?.alFinal) marcados.alFinal.push(archivo);
  }
  assert.deepEqual(marcados.moderacion.sort(), ["_all-anti-links.js", "_anti-Link-grupos-canales.js", "_anti-link-plus.js", "_chatbot-events.js", "_manejador-lista-negra.js"]);
  assert.deepEqual(marcados.trasModeracion, ["_memoria-corta.js"]);
  assert.deepEqual(marcados.alFinal, ["_auto-ia.js"]);
  // A hook that throws takes only itself down; the greeting goes once the moderation has run, and only if it deleted
  // nothing; and what it deleted reaches no other hook but the short-term memory.
  const fuente = fs.readFileSync(path.join(RAIZ, "handle-message.js"), "utf8");
  assert.match(fuente, /const hooks = hooksEnOrden\(globalThis\.plugins\);[^]*?try \{\s*await plugin\.before\(/);
  assert.match(fuente, /for \(const plugin of hooks\.filter\(\(p\) => p\.moderacion\)\) await correrHook\(plugin\);[^]*?if \(!m\.moderado\) saludar\([^]*?for \(const plugin of hooks\.filter\(\(p\) => !p\.moderacion\)\) \{[^]*?if \(m\.moderado && !plugin\.trasModeracion\) continue;\s*await correrHook\(plugin\);/);
});

test("trivia: una respuesta que nombra a Claudia se evalúa al toque, y Claudia no la charla", async () => {
  const pregunta = { pregunta: "¿Capital de Japón?", opciones: ["Osaka", "Kioto", "Tokio", "Nara"], correcta: "c" };
  const client = cliente();
  Tr.abrirRonda(G, { tipo: "trivia", pregunta, mensajeId: "TRIVIA-1", segundos: 30, client });
  const antes = consultasIA;
  const primera = mensaje("555@lid", "c, claudia");
  await correrHooks(primera, { client });
  assert.equal(primera.reaccion, "✅");
  assert.match(globalThis.enviados.map((e) => e.msg?.text).join("\n"), /¡Acertó @555!/);
  assert.equal(consultasIA, antes, "no le preguntó nada a la IA");
  assert.ok(!globalThis.enviados.some((e) => e.msg?.text === "jaja"), "ni contestó");

  // Without an open round, the same message is for her.
  await correrHooks(mensaje("555@lid", "c, claudia"), { client });
  assert.equal(consultasIA, antes + 1);
});

test("lista negra: a quien saca no le contesta Claudia, ni le publica el #vendo", async () => {
  F.initDataDB({ chat: G, sender: "777@lid", senderJid: "", pushName: "Estafador" });
  F.addToBlacklist("59899777777@s.whatsapp.net", "estafa", "owner", G, "777@lid");
  const antes = consultasIA;
  const m = mensaje("777@lid", "#vendo celular nuevo a 1000, claudia decile a todos");
  const client = await correrHooks(m, { participants: [{ id: "777@lid", admin: null }] });
  assert.equal(m.borrado, true);
  assert.deepEqual(client.acciones, ["remove 777@lid"]);
  assert.equal(consultasIA, antes, "Claudia no le contestó");
  assert.equal(F.publicacionesActivas(G).length, 0, "la publicación no quedó");
  assert.equal(contextoChat.get(G)?.some((e) => e.usuario === "777@lid") ?? false, false, "ni quedó en la memoria de Claudia");
});

test("anti-link: lo que borra no lo publica la compraventa, no cuenta como hashtag y Claudia no lo contesta", async () => {
  const antes = consultasIA;
  for (const texto of ["#vendo bici rodado 26, fotos en instagram.com/bici claudia", "#historiasrandom miren lo que me pasó instagram.com/historia"]) {
    const m = mensaje("888@lid", texto);
    await correrHooks(m, { chat: { antiInstagram: 1 } });
    assert.equal(m.borrado, true, texto);
  }
  assert.equal(F.publicacionesActivas(G).length, 0);
  const { semanaDe } = await import("../lib/hashtags.js");
  assert.deepEqual(F.obtenerEntradasHashtag(G, "historiasrandom", semanaDe(Date.now())), []);
  assert.equal(consultasIA, antes);

  // With the anti-link off, the same post is published.
  await correrHooks(mensaje("888@lid", "#vendo bici rodado 26, fotos en instagram.com/bici"));
  assert.equal(F.publicacionesActivas(G).length, 1);
});

test("menciones masivas: el mensaje que se borra no lo contesta Claudia", async () => {
  const antes = consultasIA;
  const muchos = Array.from({ length: 10 }, (_, i) => `${100 + i}@lid`);
  const m = mensaje("999@lid", "claudia mirá a todos estos", { mentionedJid: muchos });
  await correrHooks(m);
  assert.equal(m.borrado, true);
  assert.equal(consultasIA, antes);
});

// A live location used to be deleted in every group, without a word, from anyone but the admins: it came with the bot's
// original code, and no group could turn it off. Now only with .antiubicacion on, saying why, once every so often for
// each person; never from a mod or someone above, nor with the bot not an admin, which deleting takes; with the
// anti-delete on, it says so instead, as the anti-links do. A fixed location is never touched.
test("ubicación en tiempo real: se borra solo con .antiubicacion, y dice por qué", async () => {
  const ubicacion = (sender, tipo = "liveLocationMessage") => mensaje(sender, "", { mtype: tipo, message: { [tipo]: { degreesLatitude: -34.9, degreesLongitude: -56.16 } } });
  const avisos = () => globalThis.enviados.map((e) => e.msg?.text || "");
  let m = ubicacion("701@lid");
  await correrHooks(m);
  assert.deepEqual([m.borrado, avisos()], [undefined, []], "apagada, como viene");

  const prendida = { chat: { antiLiveLocation: 1 } };
  m = ubicacion("701@lid");
  await correrHooks(m, prendida);
  assert.deepEqual([m.borrado, m.moderado, avisos()], [true, true, ["📍 @701, en este grupo no se comparte la ubicación en tiempo real: la borré."]]);
  assert.deepEqual(globalThis.enviados[0].msg.mentions, ["701@lid"]);
  m = ubicacion("701@lid");
  await correrHooks(m, prendida);
  assert.deepEqual([m.borrado, avisos()], [true, []], "otra enseguida: se borra igual, sin repetir el aviso");

  for (const rango of [{ isMod: true }, { isOwner: true }, { isBotAdmin: false }]) {
    m = ubicacion("702@lid");
    await correrHooks(m, { ...prendida, rango });
    assert.deepEqual([m.borrado, avisos()], [undefined, []], JSON.stringify(rango));
  }
  m = ubicacion("703@lid");
  await correrHooks(m, { chat: { antiLiveLocation: 1, antiDelete: 1 } });
  assert.equal(m.borrado, undefined);
  assert.deepEqual(avisos(), ["📍 Se compartió una ubicación en tiempo real, pero está el anti-eliminar prendido y no la borro (.antieliminar off para que la borre)."]);
  m = ubicacion("704@lid", "locationMessage");
  await correrHooks(m, prendida);
  assert.deepEqual([m.borrado, avisos()], [undefined, []], "la ubicación fija queda");
});
