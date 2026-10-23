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

// Nor does it reach the hooks after the moderation: a trivia answer with a banned link took the prize, and the message
// counters counted it. Only Claudia's short-term memory still gets what the moderation marks: a deletion from someone on
// the blacklist (whom the blacklist removes as soon as they do anything) has to apply there all the same.
test("lo que borra la moderación no llega a los juegos ni a los contadores, y un borrado igual sale de la memoria", async () => {
  const Tr = await import("../lib/trivia.js");
  const oyeron = [];
  globalThis.plugins = {
    "_all-anti-links.js": carpeta["_all-anti-links.js"],
    "_manejador-lista-negra.js": carpeta["_manejador-lista-negra.js"],
    "_memoria-corta.js": carpeta["_memoria-corta.js"],
    "_trivia.js": carpeta["_trivia.js"],
    "_messsage-count.js": carpeta["_messsage-count.js"],
    "zz-espia.js": { before: async (m) => oyeron.push(m.text) },
  };
  const client = cliente();
  const errorReal = console.error;
  console.error = () => {};
  const cuenta = () => F.getUser(ANA).inGroup?.[GRUPO]?.messageCount || 0;
  const acerto = () => globalThis.enviados.some((e) => /¡Acertó/.test(e.msg?.text || ""));
  try {
    Tr.abrirRonda(GRUPO, { tipo: "trivia", pregunta: { pregunta: "¿Capital de Japón?", opciones: ["Osaka", "Kioto", "Tokio", "Nara"], correcta: "c" }, mensajeId: "TRIVIA-MOD", segundos: 30, client });
    F.updateChat(GRUPO, { allAntiLinks: 1 });
    const antes = cuenta();
    globalThis.enviados = [];
    const conLink = llega(client, ANA, "c https://sitio-prohibido.com");
    await conLink.hecho;
    assert.ok(globalThis.enviados.some((e) => e.msg?.delete?.id === conLink.id), "lo borró");
    assert.deepEqual([acerto(), cuenta() - antes, oyeron], [false, 0, []], "ni ganó, ni contó, ni lo oyó otro hook");

    F.updateChat(GRUPO, { allAntiLinks: 0 });
    await llega(client, ANA, "c").hecho;
    assert.deepEqual([acerto(), cuenta() - antes, oyeron], [true, 1, ["c"]], "sin el link, sí");

    // Beto said something; then he's put on the blacklist, and he deletes it.
    globalThis.contextoChat.delete(GRUPO);
    const dicho = llega(client, BETO, "algo que después borro");
    await dicho.hecho;
    assert.deepEqual(globalThis.contextoChat.get(GRUPO)?.map((e) => e.texto), ["algo que después borro"]);
    F.addToBlacklist("59899000033@s.whatsapp.net", "estafa", "owner", GRUPO, BETO);
    globalThis.enviados = [];
    const borrado = `ABCDEF${String(++numero).padStart(6, "0")}`;
    await handleMessage.call(client, { key: { remoteJid: GRUPO, fromMe: false, id: borrado, participant: BETO }, message: { protocolMessage: { type: 0, key: { remoteJid: GRUPO, fromMe: false, id: dicho.id, participant: BETO } } }, messageTimestamp: Math.floor(Date.now() / 1000), pushName: "Beto", _upsertType: "notify", _llegada: Date.now() });
    assert.ok(globalThis.enviados.some((e) => e.msg?.delete?.id === borrado), "la lista negra lo tomó como suyo");
    assert.deepEqual(globalThis.contextoChat.get(GRUPO)?.map((e) => e.texto), [], "y lo que borró ya no está en la memoria");
  } finally {
    console.error = errorReal;
    Tr.cerrarRonda(GRUPO);
    F.updateChat(GRUPO, { allAntiLinks: 0 });
  }
});

// The greeting and the two jokes come after the moderation: ahead of it, a spam with a link got a greeting quoting it,
// with the deleted link in sight, and whoever the blacklist was about to remove got greeted, or the "dame admin" joke.
test("el saludo y los chistes no le contestan a lo que borra la moderación", async () => {
  globalThis.plugins = {
    "_anti-Link-grupos-canales.js": carpeta["_anti-Link-grupos-canales.js"],
    "_manejador-lista-negra.js": carpeta["_manejador-lista-negra.js"],
    "_chatbot-events.js": carpeta["_chatbot-events.js"],
    "_chistes.js": carpeta["_chistes.js"],
  };
  const SALUDO = /^(¡Buenas! ¿Todo en orden por acá\?|Holaaa, ¿cómo andamos\?|¡Buenas buenas! ¿Qué se cuenta\?|¡Hola grupo!)$/;
  const CHISTE = /^(No\.|Jajaja no\.|Acá no se reparte admin, dejá\.|Pedir admin no suma puntos, eh\.|No va a pasar, pero me gusta el entusiasmo\.|Seguí participando 😌)$/;
  const client = cliente();
  client.groupInviteCode = async () => "CodigoDeEsteGrupo"; // the anti-link lets this group's own link through
  client.groupParticipantsUpdate = async (chat, ids) => ids.map((jid) => ({ status: "200", jid }));
  F.initDataDB({ chat: "120363000000000011@g.us", sender: ANA, senderJid: "", pushName: "Ana" });
  F.updateChat("120363000000000011@g.us", { antiGroups: 1 });
  // Each case in a group of its own: the greeting goes at most every 30 minutes per group.
  const manda = async (grupo, quien, texto) => {
    globalThis.enviados = [];
    const id = `ABCDEF${String(++numero).padStart(6, "0")}`;
    await handleMessage.call(client, { key: { remoteJid: grupo, fromMe: false, id, participant: quien }, message: { conversation: texto }, messageTimestamp: Math.floor(Date.now() / 1000), pushName: quien === ANA ? "Ana" : "Beto", _upsertType: "notify", _llegada: Date.now() });
    const textos = globalThis.enviados.map((e) => e.msg?.text).filter(Boolean);
    return { borrado: globalThis.enviados.some((e) => e.msg?.delete?.id === id), saludo: textos.some((x) => SALUDO.test(x)), chiste: textos.some((x) => CHISTE.test(x)) };
  };
  const errorReal = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await manda("120363000000000011@g.us", ANA, "Hola! sumate a mi grupo de ofertas https://chat.whatsapp.com/AbCdEfGh1234"), { borrado: true, saludo: false, chiste: false }, "al spam no lo saluda");
    assert.deepEqual(await manda("120363000000000012@g.us", ANA, "hola gente"), { borrado: false, saludo: true, chiste: false }, "a un saludo común, sí");
    assert.deepEqual(await manda("120363000000000013@g.us", ANA, "dame admin"), { borrado: false, saludo: false, chiste: true }, "y el chiste, también");
    F.addToBlacklist("59899000034@s.whatsapp.net", "estafa", "owner", "*", BETO);
    assert.deepEqual(await manda("120363000000000014@g.us", BETO, "holaa, ¿qué tal?"), { borrado: true, saludo: false, chiste: false }, "a quien saca la lista negra, ni el saludo");
    assert.deepEqual(await manda("120363000000000015@g.us", BETO, "dame admin"), { borrado: true, saludo: false, chiste: false }, "ni el chiste");
  } finally {
    console.error = errorReal;
    F.removeFromBlacklist("59899000034@s.whatsapp.net", "*");
  }
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

// .id (plugins/owner-get-user-data.js) is for every admin: the group's WhatsApp admins, the bot's (.adminbot) and the
// owner. A moderator, or anyone else, gets the admins-only notice. A group of its own, where Ana is admin: GRUPO's
// participant list is already cached.
test(".id: lo usan los admins de WhatsApp y del bot y el owner; un moderador y el resto, no", async () => {
  const OTRO = "120363000000000002@g.us";
  const [CARLA, DANI, DUENO] = ["300000000000004@lid", "300000000000005@lid", "300000000000006@lid"];
  const nombres = { [ANA]: "Ana", [BETO]: "Beto", [CARLA]: "Carla", [DANI]: "Dani", [DUENO]: "Dueño" };
  globalThis.plugins = { "owner-get-user-data.js": carpeta["owner-get-user-data.js"] };
  const client = cliente();
  client.groupMetadata = async (id) => ({ id, subject: "Otro", participants: [{ id: ANA, admin: "admin" }, ...[BETO, CARLA, DANI, DUENO].map((p) => ({ id: p, admin: null })), { id: BOT, admin: "admin" }] });
  F.setRolGrupo(OTRO, CARLA, "admin");
  F.setRolGrupo(OTRO, DANI, "mod");
  // The owner's message carries their number too (participantAlt): that's how handle-message recognizes the owner.
  const pide = async (sender, alt = null) => {
    globalThis.enviados = [];
    const key = { remoteJid: OTRO, fromMe: false, id: `ABCDEF${String(++numero).padStart(6, "0")}`, participant: sender, ...(alt && { participantAlt: alt }) };
    await handleMessage.call(client, { key, message: { conversation: ".id @300000000000003" }, messageTimestamp: Math.floor(Date.now() / 1000), pushName: nombres[sender], _upsertType: "notify", _llegada: Date.now() });
    return globalThis.enviados.map((e) => e.msg?.text).join("\n");
  };
  const datosDeBeto = /Nombre actual: Beto[\s\S]*Lid: 300000000000003@lid[\s\S]*Chat actual: 120363000000000002@g\.us/;
  assert.match(await pide(ANA), datosDeBeto, "un admin de WhatsApp");
  assert.match(await pide(CARLA), datosDeBeto, "un admin del bot");
  assert.match(await pide(DUENO, "59899111222@s.whatsapp.net"), datosDeBeto, "el owner");
  assert.equal(await pide(DANI), globalThis.txt.onlyAdmin, "un moderador, no");
  assert.equal(await pide(BETO), globalThis.txt.onlyAdmin, "ni alguien sin rol");
});

// A group that lists people by number (addressingMode "pn"): Baileys lists its participants by number (id), with the LID
// apart (lid), and a message brings the number in key.participant and, when the server sends it, the LID in
// participantAlt. Looking at the id alone, the bot didn't see itself as admin there (commands that need it refused, and
// the anti-link didn't act), nor a WhatsApp admin whose message brought their LID; and a bot moderator whose message
// brought only the number lost the role.
test("en un grupo que lista a la gente por número, el bot se ve admin y reconoce a los admins y a los roles", async () => {
  const PN = "120363000000000006@g.us";
  const gente = {
    admin: { jid: "59899000061@s.whatsapp.net", lid: "300000000000061@lid", nombre: "Admin" },
    mod: { jid: "59899000062@s.whatsapp.net", lid: "300000000000062@lid", nombre: "Mod" },
    miembro: { jid: "59899000063@s.whatsapp.net", lid: "300000000000063@lid", nombre: "Miembro" },
  };
  for (const p of Object.values(gente)) F.initDataDB({ chat: PN, sender: p.lid, senderJid: p.jid, pushName: p.nombre });
  F.setRolGrupo(PN, gente.mod.lid, "mod");
  const corrieron = [];
  globalThis.plugins = {
    "owner-get-user-data.js": carpeta["owner-get-user-data.js"],
    "_all-anti-links.js": carpeta["_all-anti-links.js"],
    "espia-bot-admin.js": { cmd: ["necesitoadmin"], botAdmin: true, run: async () => corrieron.push(".necesitoadmin") },
    "espia-mod.js": { cmd: ["solomods"], onlyMod: true, run: async () => corrieron.push(".solomods") },
  };
  const client = cliente();
  client.groupMetadata = async (id) => ({
    id,
    subject: "Por número",
    addressingMode: "pn",
    participants: [
      { id: gente.admin.jid, lid: gente.admin.lid, admin: "superadmin" },
      { id: gente.mod.jid, lid: gente.mod.lid, admin: null },
      { id: gente.miembro.jid, lid: gente.miembro.lid, admin: null },
      { id: client.user.jid, lid: BOT, admin: "admin" },
    ],
  });
  const manda = async (quien, texto, { conLid = true } = {}) => {
    globalThis.enviados = [];
    corrieron.length = 0;
    const id = `ABCDEF${String(++numero).padStart(6, "0")}`;
    const key = { remoteJid: PN, fromMe: false, id, participant: quien.jid, ...(conLid && { participantAlt: quien.lid }), addressingMode: "pn" };
    await handleMessage.call(client, { key, message: { conversation: texto }, messageTimestamp: Math.floor(Date.now() / 1000), pushName: quien.nombre, _upsertType: "notify", _llegada: Date.now() });
    return { id, corrieron: [...corrieron], textos: globalThis.enviados.map((e) => e.msg?.text).filter(Boolean), borrados: globalThis.enviados.filter((e) => e.msg?.delete).map((e) => e.msg.delete.id) };
  };
  const errorReal = console.error;
  console.error = () => {};
  try {
    assert.match((await manda(gente.admin, ".id @59899000063")).textos.join("\n"), /Usuario: \+59899000063[\s\S]*Lid: 300000000000063@lid/, "el admin de WhatsApp, con su LID en el mensaje");
    assert.deepEqual((await manda(gente.miembro, ".necesitoadmin")).corrieron, [".necesitoadmin"], "Claudia se ve admin");
    F.updateChat(PN, { allAntiLinks: 1 });
    const link = await manda(gente.miembro, "miren https://sitio-prohibido.com");
    assert.deepEqual(link.borrados, [link.id], "y el anti-link actúa");
    F.updateChat(PN, { allAntiLinks: 0 });
    assert.deepEqual((await manda(gente.mod, ".solomods", { conLid: false })).corrieron, [".solomods"], "el moderador, con un mensaje que trae solo el número");
    assert.deepEqual((await manda(gente.mod, ".solomods")).corrieron, [".solomods"], "y con uno que trae la LID");
    assert.deepEqual((await manda(gente.miembro, ".solomods")).textos, [globalThis.txt.onlyMod], "alguien sin rol, no");
  } finally {
    console.error = errorReal;
    F.updateChat(PN, { allAntiLinks: 0 });
  }
});

// An admin asks .id about the people in that group; only the owner, about anyone the bot knows. In a group of their own
// with the bot, an admin got the number behind a LID from any other group, or whose a number was.
test(".id: un admin, de la gente de su grupo; el owner, de cualquiera", async () => {
  const PROPIO = "120363000000000003@g.us"; // a group Eva made and added the bot to
  const SIN_LISTA = "120363000000000004@g.us"; // one whose member list didn't come
  const [EVA, FEDE, DUENO] = ["300000000000007@lid", "300000000000008@lid", "300000000000006@lid"];
  F.initDataDB({ chat: "120363000000000005@g.us", sender: FEDE, senderJid: "59899000008@s.whatsapp.net", pushName: "Fede" }); // in another group only
  globalThis.plugins = { "owner-get-user-data.js": carpeta["owner-get-user-data.js"] };
  const client = cliente();
  client.groupMetadata = async (id) => {
    if (id === SIN_LISTA) throw new Error("rate-overlimit");
    return { id, subject: "Propio", participants: [{ id: EVA, admin: "superadmin" }, { id: ANA, admin: null }, { id: DUENO, admin: null }, { id: BOT, admin: "admin" }] };
  };
  F.setRolGrupo(SIN_LISTA, EVA, "admin");
  const pide = async (sender, texto, { chat = PROPIO, alt = null } = {}) => {
    globalThis.enviados = [];
    const key = { remoteJid: chat, fromMe: false, id: `ABCDEF${String(++numero).padStart(6, "0")}`, participant: sender, ...(alt && { participantAlt: alt }) };
    await handleMessage.call(client, { key, message: { conversation: texto }, messageTimestamp: Math.floor(Date.now() / 1000), pushName: sender === EVA ? "Eva" : "Dueño", _upsertType: "notify", _llegada: Date.now() });
    return globalThis.enviados.map((e) => e.msg?.text).join("\n");
  };
  const NO = "🆔 Solo puedo mostrarte el id de alguien de este grupo.";
  assert.equal(await pide(EVA, ".id @300000000000008"), NO, "la LID de alguien de otro grupo");
  assert.equal(await pide(EVA, ".id +598 99 000 008"), NO, "ni de quién es un número");
  assert.equal(await pide(EVA, ".id +598 99 000 077"), NO, "y lo mismo con un número que el bot no conoce: no dice cuál conoce");
  assert.match(await pide(EVA, ".id @300000000000002"), /Nombre actual: Ana[\s\S]*Lid: 300000000000002@lid/, "alguien de su grupo, sí");
  const errorReal = console.error;
  console.error = () => {};
  try {
    assert.equal(await pide(EVA, ".id @300000000000002", { chat: SIN_LISTA }), "No pude ver la lista de miembros del grupo; probá de nuevo en un rato.", "sin la lista del grupo, no adivina");
  } finally {
    console.error = errorReal;
  }
  const delDueno = { alt: "59899111222@s.whatsapp.net" };
  assert.match(await pide(DUENO, ".id @300000000000008", delDueno), /Usuario: \+59899000008[\s\S]*Nombre actual: Fede/, "el owner, de cualquiera");
  assert.match(await pide(DUENO, ".id +598 99 000 008", delDueno), /Nombre actual: Fede[\s\S]*Lid: 300000000000008@lid/);
});

// The greeting goes out right after the moderation, before the other hooks: Claudia's answer to the same "hola claudia"
// comes after it.
test("el saludo sale antes que la respuesta de Claudia al mismo mensaje", async () => {
  const client = cliente();
  globalThis.plugins = Object.fromEntries(Object.entries(carpeta).filter(([, p]) => typeof p?.before === "function" && (p.trasModeracion || p.alFinal)));
  const grupo = "120363000000000016@g.us"; // a group of its own: the greeting goes at most every 30 minutes per group
  F.initDataDB({ chat: grupo, sender: ANA, senderJid: "", pushName: "Ana" });
  globalThis.enviados = [];
  await handleMessage.call(client, { key: { remoteJid: grupo, fromMe: false, id: "ABCDEF999016", participant: ANA }, message: { conversation: "hola claudia, ¿cómo andás?" }, messageTimestamp: Math.floor(Date.now() / 1000), pushName: "Ana", _upsertType: "notify", _llegada: Date.now() });
  await esperar(50);
  const textos = globalThis.enviados.map((e) => e.msg?.text).filter(Boolean);
  const saludo = textos.findIndex((t) => /^(¡Buenas! ¿Todo en orden por acá\?|Holaaa, ¿cómo andamos\?|¡Buenas buenas! ¿Qué se cuenta\?|¡Hola grupo!)$/.test(t));
  const claudia = textos.indexOf("Ni idea, preguntale a quien la publicó");
  assert.ok(saludo >= 0 && claudia > saludo, JSON.stringify(textos));
});

// A message that doesn't get to the hooks is a sign of life for .inactivos all the same: one that came late (the bot
// was offline, or reconnecting), and one from someone silenced, deleted on arrival. Whoever was warned and wrote within
// the 3 days stayed warned, and .k inactivos could remove them.
test("un mensaje atrasado, de alguien silenciado o un comando de cuando el bot estaba apagado le levanta el aviso de .inactivos", async () => {
  const client = cliente();
  globalThis.plugins = { "_messsage-count.js": carpeta["_messsage-count.js"] };
  const [CARLA, DANI, FEDE] = ["300000000000004@lid", "300000000000005@lid", "300000000000006@lid"];
  for (const [quien, nombre] of [[CARLA, "Carla"], [DANI, "Dani"], [FEDE, "Fede"]]) F.initDataDB({ chat: GRUPO, sender: quien, senderJid: "", pushName: nombre });
  for (const quien of [CARLA, DANI, FEDE]) F.marcarAvisoInactivo(GRUPO, [quien], Date.now() - 24 * 60 * 60 * 1000);
  F.getUser(CARLA, GRUPO);
  F.updateUserInGroup(CARLA, GRUPO, { mute: true });
  const enviado = Math.floor(Date.now() / 1000) - 90; // sent while the bot was offline
  const comando = Math.floor(Date.now() / 1000) - 30;
  try {
    await llega(client, CARLA, "perdón, acá estoy").hecho;
    await handleMessage.call(client, { key: { remoteJid: GRUPO, fromMe: false, id: "ABCDEF999001", participant: DANI }, message: { conversation: "acá estoy" }, messageTimestamp: enviado, pushName: "Dani", _upsertType: "notify", _llegada: Date.now() });
    // A command from while it was offline comes as "append", and the bot doesn't answer it.
    await handleMessage.call(client, { key: { remoteJid: GRUPO, fromMe: false, id: "ABCDEF999002", participant: FEDE }, message: { conversation: ".perfil" }, messageTimestamp: comando, pushName: "Fede", _upsertType: "append", _llegada: Date.now() });
  } finally {
    F.updateUserInGroup(CARLA, GRUPO, { mute: false });
  }
  const filas = new Map(F.presenciaDelGrupo(GRUPO).map((r) => [r.usuario, r]));
  assert.deepEqual([CARLA, DANI, FEDE].filter((quien) => filas.get(quien)?.avisado), []);
  assert.deepEqual([filas.get(DANI).ultimo_mensaje, filas.get(FEDE).ultimo_mensaje], [enviado * 1000, comando * 1000], "con la hora en que lo mandaron");
  assert.ok(globalThis.enviados.some((e) => e.msg?.delete), "a Carla le borró el mensaje igual");
});

// What the moderation deletes reaches no counter, but whoever sent it wrote: someone warned who answered "acá estoy"
// with a banned link stayed warned, and could be removed. Without the "Volvió": that would quote what was deleted.
test("lo que borra la moderación le levanta el aviso de .inactivos, sin sumar mensajes", async () => {
  const client = cliente();
  globalThis.plugins = { "_all-anti-links.js": carpeta["_all-anti-links.js"], "_messsage-count.js": carpeta["_messsage-count.js"] };
  const grupo = "120363000000000026@g.us";
  const GABI = "300000000000010@lid";
  F.initDataDB({ chat: grupo, sender: GABI, senderJid: "", pushName: "Gabi" });
  F.marcarAvisoInactivo(grupo, [GABI], Date.now() - 24 * 60 * 60 * 1000);
  F.updateChat(grupo, { allAntiLinks: 1 });
  globalThis.enviados = [];
  const id = "ABCDEF999448";
  await handleMessage.call(client, { key: { remoteJid: grupo, fromMe: false, id, participant: GABI }, message: { conversation: "acá estoy! miren esto www.ejemplo.com.uy" }, messageTimestamp: Math.floor(Date.now() / 1000), pushName: "Gabi", _upsertType: "notify", _llegada: Date.now() });
  await esperar(20);
  assert.ok(globalThis.enviados.some((e) => e.msg?.delete?.id === id), "lo borró");
  assert.deepEqual(F.presenciaDelGrupo(grupo).filter((r) => r.avisado).map((r) => r.usuario), []);
  assert.equal(F.getUser(GABI).inGroup?.[grupo]?.messageCount || 0, 0, "no cuenta como mensaje");
  assert.ok(!globalThis.enviados.some((e) => /Volvió/.test(e.msg?.text || "")), "sin «Volvió»");
});

// A number may have an old row keyed by itself besides the one with the LID. getUser by number found the old one, and
// updateUser by number wrote to both: a message that came with only the number (in a group listed by number, without the
// LID alongside, or in private) copied the old row over the one with the LID, and the person lost their warnings, their
// silence and their .afk in every group. The muted one's message wasn't deleted either.
test("un mensaje que llega solo con el número no le pisa a nadie lo que tiene en sus grupos", async () => {
  const client = cliente();
  globalThis.plugins = { "_messsage-count.js": carpeta["_messsage-count.js"] };
  const [grupo, otro] = ["120363000000000021@g.us", "120363000000000022@g.us"];
  const [PN, LID] = ["59899000444@s.whatsapp.net", "300000000000444@lid"];
  client.groupMetadata = async (id) => ({ id, subject: "Grupo", addressingMode: "pn", participants: [{ id: PN, admin: null }, { id: "59800000001@s.whatsapp.net", lid: BOT, admin: "admin" }] });
  const enGrupos = { [grupo]: { afk: Date.now() - 1000, afkReason: "de viaje", mute: true, warn: 2, messageCount: 80, desde: 1 }, [otro]: { afk: -1, mute: false, warn: 1, messageCount: 30, desde: 1 } };
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(PN, PN, "Dani", 1); // the old row, keyed by the number
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp, inGroup) VALUES (?, ?, ?, ?, ?)").run(LID, PN, "Dani", 2, JSON.stringify(enGrupos));
  globalThis.enviados = [];
  const llegaDe = (remoteJid, participant, id) => handleMessage.call(client, { key: { remoteJid, fromMe: false, id, participant }, message: { conversation: "hola, perdón la demora" }, messageTimestamp: Math.floor(Date.now() / 1000), pushName: "Dani", _upsertType: "notify", _llegada: Date.now() });
  await llegaDe(grupo, PN, "ABCDEF999444");
  await llegaDe(PN, undefined, "ABCDEF999445");
  const { inGroup } = F.getUser(LID);
  assert.deepEqual([inGroup[grupo], inGroup[otro]], [enGrupos[grupo], enGrupos[otro]]);
  assert.ok(globalThis.enviados.some((e) => e.msg?.delete), "y al silenciado le borró el mensaje");
});

// What the bot couldn't decrypt comes from Baileys as a CIPHERTEXT stub: who sent it and when, but no message (a
// broken session with that person, or the group's keys missing after relinking). To .inactivos they stayed silent, and
// could be removed having written.
test("un mensaje que el bot no pudo descifrar le levanta el aviso de .inactivos, llegue en vivo o atrasado", async () => {
  const client = cliente();
  globalThis.plugins = { "_messsage-count.js": carpeta["_messsage-count.js"] };
  const grupo = "120363000000000023@g.us";
  const [EVA, GABI] = ["300000000000009@lid", "300000000000010@lid"];
  for (const [quien, nombre] of [[EVA, "Eva"], [GABI, "Gabi"]]) F.initDataDB({ chat: grupo, sender: quien, senderJid: "", pushName: nombre });
  for (const quien of [EVA, GABI]) F.marcarAvisoInactivo(grupo, [quien], Date.now() - 24 * 60 * 60 * 1000);
  const indescifrable = (quien, id, enviado) => handleMessage.call(client, { key: { remoteJid: grupo, fromMe: false, id, participant: quien }, messageStubType: 2, messageStubParameters: ["Bad MAC"], messageTimestamp: enviado, _upsertType: "notify", _llegada: Date.now() });
  globalThis.enviados = [];
  await indescifrable(EVA, "ABCDEF999446", Math.floor(Date.now() / 1000));
  await indescifrable(GABI, "ABCDEF999447", Math.floor(Date.now() / 1000) - 90); // sent while the bot was offline
  assert.deepEqual(F.presenciaDelGrupo(grupo).filter((r) => r.avisado).map((r) => r.usuario), []);
  assert.deepEqual(globalThis.enviados, [], "sin «Volvió» ni monedas: por lo que se sabe, pudo ser una reacción");
});

// The group's notice that it was closed or opened (GROUP_CHANGE_ANNOUNCE) is noted with the time it happened, even when
// it arrives late: .inactivos doesn't count the time it was closed, since only the admins could write then. Three weeks
// closed looked like three weeks of silence: everyone was tagged the day it opened, and whoever had been warned right
// before it closed could be removed without having been able to write.
test("el aviso de que el grupo se cerró o se abrió cuenta para .inactivos, aunque llegue atrasado", async () => {
  const client = cliente();
  globalThis.plugins = {};
  const I = await import("../lib/inactivos.js");
  const DIA = 24 * 60 * 60 * 1000;
  const ahora = Date.now();
  const [EVA, GABI] = ["300000000000009@lid", "300000000000010@lid"];
  const participants = [{ id: EVA, admin: null }, { id: GABI, admin: null }, { id: BOT, admin: "admin" }];
  const aviso = (grupo, cerrado, cuando) => handleMessage.call(client, { key: { remoteJid: grupo, fromMe: false, id: `ABCDEF${cuando}`, participant: ANA }, messageStubType: 26, messageStubParameters: [cerrado ? "on" : "off"], messageTimestamp: Math.floor(cuando / 1000), _upsertType: "append", _llegada: Date.now() });

  // Eva was warned and the group was closed right after; Gabi wrote just before. It opened a minute ago, and both
  // notices arrive now, with the bot back from being offline.
  const grupo = "120363000000000024@g.us";
  F.registrarMensajeGrupo(grupo, [ANA], ahora - 60 * DIA); // the bot keeps track of the group since 60 days ago
  F.registrarMensajeGrupo(grupo, [EVA], ahora - 30 * DIA);
  F.registrarMensajeGrupo(grupo, [GABI], ahora - 21 * DIA);
  F.marcarAvisoInactivo(grupo, [EVA], ahora - 21 * DIA);
  await aviso(grupo, true, ahora - 20.5 * DIA);
  await aviso(grupo, false, ahora - 60 * 1000);
  const { listos, enPlazo } = I.paraSacar(grupo, participants, client, ahora);
  assert.deepEqual([listos, enPlazo.map((e) => e.participante.id)], [[], [EVA]], "a Eva le queda casi todo el plazo");
  assert.deepEqual(I.inactivosDe(grupo, participants, client, { ahora }), [], "nadie estuvo callado 15 días con el grupo abierto");

  // A group it keeps track of since 16 days ago, closed for 5 of them: it doesn't know yet, and says so.
  const nuevo = "120363000000000025@g.us";
  F.registrarMensajeGrupo(nuevo, [ANA], ahora - 16 * DIA);
  await aviso(nuevo, true, ahora - 10 * DIA);
  await aviso(nuevo, false, ahora - 5 * DIA);
  globalThis.enviados = [];
  await I.avisarInactivos(client, { chat: nuevo, sender: ANA, isGroup: true }, participants, { ahora });
  assert.equal(globalThis.enviados.at(-1).msg.text, "Todavía no sé quién no escribe hace 15 días: empecé a anotar quién escribe en este grupo hace 16 días, y el tiempo que estuvo cerrado no cuenta. Probá en 4 días.");
});

// A recycled number: N was A's, A moved to N2, and N is B's now. The number a message brings along with the LID is the
// one in use, and it stops being anyone else's: A's row kept N, so "the row of N" was A's whenever A wrote last, and a
// message from B that came with only the number was deleted for A's silence, and gave A B's name.
test("con un número reciclado, lo de cada uno queda con cada uno", async () => {
  const client = cliente();
  globalThis.plugins = { "_messsage-count.js": carpeta["_messsage-count.js"] };
  const grupo = "120363000000000027@g.us";
  const [A, B] = ["300000000000031@lid", "300000000000032@lid"];
  const [N, N2] = ["59899000731@s.whatsapp.net", "59899000732@s.whatsapp.net"];
  client.groupMetadata = async (id) => ({ id, subject: "Grupo", participants: [{ id: A, admin: null }, { id: B, admin: null }, { id: BOT, admin: "admin" }] });
  let n = 0;
  const llegaDe = async (participant, participantAlt, pushName) => {
    await handleMessage.call(client, { key: { remoteJid: grupo, fromMe: false, id: `ABCDEF9997${++n}`, participant, ...(participantAlt ? { participantAlt } : {}) }, message: { conversation: "hola" }, messageTimestamp: Math.floor(Date.now() / 1000), pushName, _upsertType: "notify", _llegada: Date.now() });
    await esperar(5); // each one stamped apart (FILA_DEL_NUMERO goes by the last one)
  };
  await llegaDe(A, N, "Ana");
  await llegaDe(B, N, "Beto"); // N is B's now
  await llegaDe(A, N2, "Ana"); // A, from the new number
  assert.deepEqual([F.jidDeLid(A), F.jidDeLid(B), F.lidDeNumero(N), F.lidDeNumero(N2)], [N2, N, B, A]);
  F.getUser(A, grupo);
  F.updateUserInGroup(A, grupo, { mute: true });
  globalThis.enviados = [];
  await llegaDe(N, null, "Beto"); // B, a message that came with only the number
  assert.ok(!globalThis.enviados.some((e) => e.msg?.delete), "el silencio de A no le borra el mensaje a B");
  assert.deepEqual([F.getUser(A).pushName, F.getUser(N).lid], ["Ana", B]);
});

// Meta AI writes in a group as …@bot, neither a LID nor a number: m.sender comes out empty, and by "" getUser found
// someone with no number on record. Every answer went to that person's message count.
test("un mensaje de Meta AI no se le cuenta a nadie", async () => {
  const client = cliente();
  globalThis.plugins = { "_messsage-count.js": carpeta["_messsage-count.js"] };
  const grupo = "120363000000000028@g.us";
  for (const id of ["ABCDEF999751", "ABCDEF999752"]) await handleMessage.call(client, { key: { remoteJid: grupo, fromMe: false, id, participant: "867051314767696@bot" }, message: { conversation: "Soy Meta AI, ¿en qué te ayudo?" }, messageTimestamp: Math.floor(Date.now() / 1000), pushName: "Meta AI", _upsertType: "notify", _llegada: Date.now() });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE inGroup LIKE ?").get(`%${grupo}%`).n, 0, "nadie tiene mensajes en el grupo");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE lid = ''").get().n, 0, "ni una fila de nadie");
  assert.equal(F.getUser(""), null);
});
