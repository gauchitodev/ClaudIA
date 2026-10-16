import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { prepararBase, ultimoEnviado } from "./helpers.mjs";

// .menu (lib/menu.js): a short index with what the group uses most (counted by lib/usos.js), one topic per .menu <tema>
// and everything with .menu todo. It used to be a single message of 233 lines, with the admin and settings commands
// before anything a member could use.

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let F, M, A, Menu;
const DIA = 24 * 3600e3;
const AHORA = new Date(2031, 0, 15, 15, 30); // a fixed afternoon, so neither the clock nor the time zone gets in the way
const dia = (n) => new Date(AHORA.getTime() - n * DIA);
const G = "menu@g.us";
const ABIERTO = { games: 1, casino: 1, monedas: 1, charla: 1 };

before(async () => {
  ({ F } = await prepararBase("menu"));
  globalThis.botVersion = "v3.3.0";
  globalThis.baileys = "@whiskeysockets/baileys"; // plugins/_anti-delete-messages.js imports it dynamically
  // The real plugins, as the bot loads them: the ranking reads their commands and flags.
  const plugins = {};
  for (const archivo of fs.readdirSync(path.join(RAIZ, "plugins")).filter((f) => f.endsWith(".js"))) {
    const mod = await import(pathToFileURL(path.join(RAIZ, "plugins", archivo)).href);
    plugins[archivo.replace(".js", "")] = mod.default || mod;
  }
  globalThis.plugins = plugins;
  M = await import("../lib/menu.js");
  A = await import("../lib/actividad.js");
  Menu = plugins.menu;
});
beforeEach(() => db.exec("DELETE FROM usos_comandos"));

// "veces" uses of a command in a chat, "n" days before AHORA.
const usar = (chat, cmd, veces, n = 0) =>
  db.prepare(`INSERT INTO usos_comandos (chat, fecha, comando, usos) VALUES (?, ?, ?, ?) ON CONFLICT(chat, fecha, comando) DO UPDATE SET usos = usos + excluded.usos`).run(chat, A.claveDia(dia(n)), cmd, veces);
const menu = (opciones = {}) => M.textoMenu({ usedPrefix: ".", nombre: "Ana", chatId: G, isGroup: true, datosChat: ABIERTO, ahora: AHORA, ...opciones });
const masUsados = (opciones = {}) => M.lineasMasUsadas({ usedPrefix: ".", chatId: G, isGroup: true, datosChat: ABIERTO, ahora: AHORA, ...opciones });
const comandos = (r) => r.lineas.map((l) => M.comandoDeLinea(l));
const MIEMBRO = {};
const MOD = { isMod: true };
const OWNER = { isMod: true, isOwner: true };

test("menú: el índice entra en una pantalla, sin el «Leer más» forzado", () => {
  // The worst case: the owner, who sees every topic, with the six longest lines as the most used.
  for (const e of M.entradasDelMenu(".").filter((x) => x.seccion.para === "todos")) usar(G, e.cmd, e.linea.length);
  const texto = menu(OWNER);
  assert.ok(texto.split("\n").length <= 24, `el índice tiene ${texto.split("\n").length} líneas`);
  assert.doesNotMatch(texto, /\u200e/, "sin los caracteres invisibles que forzaban el «Leer más»");
  assert.match(texto, /^👋 \*Hola, Ana\* — soy Claudia \(v3\.3\.0 · \d+ usuarios\)\n\n⭐ \*Lo más usado en este grupo\*\n▸ \./);
});

test("menú: cada uno ve los temas que puede usar", () => {
  const temas = (rango) => menu(rango).split("📂")[1];
  assert.match(temas(MIEMBRO), /🎮 juegos/);
  assert.doesNotMatch(temas(MIEMBRO), /admins|config|owner/);
  assert.match(temas(MOD), /🛡️ admins · ⚙️ config/);
  assert.doesNotMatch(temas(MOD), /owner/);
  assert.match(temas(OWNER), /🥷 owner/);
  assert.equal(menu({ pedido: "admins" }), "🛡️ Ese tema es para admins y moderadores del grupo.");
  assert.equal(menu({ pedido: "owner", ...MOD }), "🥷 Ese tema es solo del owner del bot.");
  assert.match(menu({ pedido: "config", ...MOD }), /^⚙️ \*Configuración\*\n_Cada opción con on u off; sin nada, la invierte\._\n▸ \.modoadmin/);
  // In private: no group rank, and the menus that only work in groups aren't offered.
  const privado = menu({ isGroup: false, chatId: "59899111222@s.whatsapp.net", datosChat: null });
  assert.doesNotMatch(privado, /admins/);
  assert.match(privado, /🗂️ \*Otros menús:\* \.menuaero · \.info$/);
});

test("menú: los temas se encuentran por alias, sin importar acentos, + ni mayúsculas", () => {
  assert.match(menu({ pedido: "Stickers" }), /^🔄 \*Stickers y convertidores\*\n▸ \.s 🃏/);
  assert.match(menu({ pedido: "+juegos" }), /^🎮 \*Juegos\*/);
  assert.match(menu({ pedido: "configuración", ...MOD }), /^⚙️ \*Configuración\*/);
  assert.match(menu({ pedido: "DUEÑO", ...OWNER }), /^🥷 \*Solo el owner\*/);
  assert.match(menu({ pedido: "casino" }), /^🇺🇾 \*Temáticas, ranking y UruCoins\*/, "las secciones de .bladd también son temas");
  assert.match(menu({ pedido: "compraventa" }), /^📂 \*Otros menús\*\n[\s\S]*▸ \.menuventas/);
  assert.match(menu({ pedido: "juegos" }), /┈\n\.menu para volver · \.menu todo para verlo todo$/);
  assert.match(menu({ pedido: "xyz" }), /^🤔 No tengo el tema \*xyz\*\. Los temas son:\n🇺🇾 grupo/);
});

test("menú: .menu todo trae todo lo que esa persona puede ver, sin repetir", () => {
  const miembro = menu({ pedido: "todo" });
  const mod = menu({ pedido: "TODO", ...MOD });
  assert.doesNotMatch(miembro, /Configuración|Admins y moderadores/);
  assert.match(mod, /⚙️ \*Configuración\*\n_Cada opción con on u off; sin nada, la invierte\._/);
  assert.doesNotMatch(mod, /viceversa/, "el título viejo, de antes de que los interruptores aceptaran on y off");
  assert.doesNotMatch(mod, /▸ \.vendo/, "la compraventa está en .menuventas");
  const principales = (texto) => texto.split("\n").map((l) => M.comandoDeLinea(l)).filter(Boolean);
  const repetidos = (texto) => principales(texto).filter((c, i, todos) => todos.indexOf(c) !== i);
  assert.deepEqual(repetidos(miembro), []);
  assert.deepEqual(repetidos(menu({ pedido: "todo", ...OWNER })), ["reglas"], "solo .reglas, que está para todos y como .reglas set para admins");
});

test("menú: el 🔒 va en todas las respuestas, y lo bloqueado no entra en lo más usado", () => {
  usar(G, "trivia", 100);
  const bloqueados = new Set(["trivia"]);
  assert.match(menu({ pedido: "juegos", bloqueados }), /▸ \.trivia ❔ – `Pregunta con cuatro opciones; respondé con la letra\.` 🔒/);
  assert.match(menu({ pedido: "todo", bloqueados }), /▸ \.trivia .+ 🔒/);
  assert.ok(!comandos(masUsados({ bloqueados })).includes("trivia"));
  assert.equal(comandos(masUsados())[0], "trivia");
});

test("lo más usado: lo del grupo, con los alias de cada línea juntos", () => {
  globalThis.client.user.lid = "59899000001@lid";
  usar(G, "sticker", 15);
  usar(G, "s", 10); // .s and .sticker are the same line: 25
  usar(G, "play", 12); // dl-youtube: .play is the .audio line
  usar(G, "vídeo", 11); // and .vídeo the .video line, not .audio's
  usar(G, "59899000001", 9); // the AI by mention: the bot's own number lands on .ia
  const r = masUsados();
  assert.equal(r.fuente, "grupo");
  assert.deepEqual(comandos(r).slice(0, 4), ["s", "audio", "video", "ia"]);
  assert.equal(r.lineas.length, 6, "lo que falta lo completa la lista fija");
});

test("lo más usado: sin menús, sin lo que pide rango y sin lo que el grupo tiene apagado", () => {
  usar(G, "menu", 100);
  usar(G, "say", 50); // only for moderators
  usar(G, "usos", 40); // the admins' topic
  usar(G, "trivia", 30); // a game, with the games off
  usar(G, "bal", 30); // UruCoins, with the economy off
  usar(G, "clima", 25);
  const r = masUsados({ datosChat: { ...ABIERTO, games: 0, monedas: 0 } });
  const cmds = comandos(r);
  assert.equal(cmds[0], "clima");
  for (const fuera of ["menu", "say", "usos", "trivia", "bal"]) assert.ok(!cmds.includes(fuera), `.${fuera} no tendría que estar`);
});

test("lo más usado: mira los últimos 30 días", () => {
  usar(G, "clima", 25, 29);
  usar(G, "audio", 100, 30);
  const r = masUsados();
  assert.equal(r.fuente, "grupo");
  assert.equal(comandos(r)[0], "clima", "el día 30 ya quedó afuera");
});

test("lo más usado: con pocos usos en el grupo, lo de todos los grupos; sin datos, la lista fija", () => {
  usar(G, "clima", 5); // too few for the group's own ranking
  usar("otro@g.us", "tts", 60);
  usar("privado", "ig", 500); // private chats don't count for the general ranking
  const general = masUsados();
  assert.equal(general.fuente, "general");
  assert.deepEqual(comandos(general).slice(0, 2), ["tts", "clima"]);
  assert.ok(!comandos(general).includes("ig"));

  const fijo = masUsados({ ahora: new Date(2040, 5, 1, 15, 0) });
  assert.equal(fijo.fuente, "fijo");
  assert.deepEqual(comandos(fijo), M.MENU.POR_DEFECTO);
  assert.match(menu({ ahora: new Date(2040, 5, 1, 15, 0) }), /⭐ \*Para arrancar\*/);

  // In private there's no group level, and .bal only works in groups.
  const privado = masUsados({ isGroup: false, chatId: "59899111222@s.whatsapp.net", datosChat: null, ahora: new Date(2040, 5, 1, 15, 0) });
  assert.deepEqual(comandos(privado), M.MENU.POR_DEFECTO.filter((c) => c !== "bal"));
});

test("lo más usado: cada comando de la lista fija tiene su línea para todos", () => {
  const publicas = M.entradasDelMenu(".").filter((e) => e.seccion.para === "todos");
  for (const cmd of M.MENU.POR_DEFECTO) assert.ok(publicas.some((e) => e.cmd === cmd), `.${cmd} no tiene línea`);
});

test(".menu: manda el índice citando y reacciona; con el modo blacklist marca lo bloqueado", async () => {
  F.initDataDB({ chat: G, sender: "111@lid", senderJid: "", pushName: "Ana" });
  const m = { chat: G, isGroup: true, pushName: "Ana", key: { id: "PEDIDO" } };
  await Menu.run(m, { client: globalThis.client, usedPrefix: ".", args: [], chat: F.getChat(G), isMod: false, isOwner: false });
  const [indice, reaccion] = globalThis.enviados.slice(-2);
  assert.match(indice.msg.text, /^👋 \*Hola, Ana\*/);
  assert.equal(reaccion.msg.react.text, "📚");
  F.addToChatBlacklist(G, "trivia");
  await Menu.run(m, { client: globalThis.client, usedPrefix: ".", args: ["juegos"], chat: { ...F.getChat(G), blacklistMode: 1 }, isMod: false, isOwner: false });
  assert.match(globalThis.enviados.at(-2).msg.text, /▸ \.trivia .+ 🔒/);
  assert.ok(ultimoEnviado().msg.react);
});

test("consistencia: puedeCorrerAca mira los mismos interruptores que handle-message", () => {
  // The ranking leaves out what wouldn't run here. If handle-message checks change, lib/menu.js has to follow.
  const fuente = fs.readFileSync(path.join(RAIZ, "handle-message.js"), "utf8");
  for (const condicion of ["plugin.onlyGroup && !m.isGroup", "plugin.juego && !chat.games", "plugin.casino && m.isGroup && chat.casino === 0", "plugin.economia && m.isGroup && chat.monedas === 0"]) {
    assert.ok(fuente.includes(condicion), `handle-message ya no chequea «${condicion}»: revisá puedeCorrerAca en lib/menu.js`);
  }
});
