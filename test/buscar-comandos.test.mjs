import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { prepararBase, ultimoEnviado } from "./helpers.mjs";
import { cargados } from "../lib/plugins-cargados.js";
import { conexion } from "../lib/conexion.js";

// Searching the commands (lib/parecidos.js, comandosParecidos in lib/menu.js): .buscarcomando, .menu with a word that
// isn't a topic, and the answer to a command that doesn't exist (its dispatcher test is in handle-message.test.mjs). By
// the real menu and the real plugins: what's found is their names, their lines and their flags.

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let F, M, P, Buscar;
const ABIERTO = { games: 1, casino: 1, monedas: 1, charla: 1 };
const GRUPO = { isGroup: true, datosChat: ABIERTO };
const ADMIN = { isAdmin: true, isMod: true };

before(async () => {
  ({ F } = await prepararBase("buscar-comandos"));
  const plugins = {};
  for (const archivo of fs.readdirSync(path.join(RAIZ, "plugins")).filter((f) => f.endsWith(".js"))) {
    const mod = await import(pathToFileURL(path.join(RAIZ, "plugins", archivo)).href);
    plugins[archivo.replace(".js", "")] = mod.default || mod;
  }
  cargados.plugins = plugins;
  M = await import("../lib/menu.js");
  P = await import("../lib/parecidos.js");
  Buscar = plugins["buscar-comando"];
});

// The commands of the lines found, in their order.
const encontrados = (texto, contexto = GRUPO) => M.comandosParecidos(texto, contexto).map((l) => M.comandoDeLinea(l));

test("distancia: Levenshtein, y con transposiciones dos letras cambiadas de lugar son un error solo", () => {
  assert.equal(P.distancia("kitten", "sitting"), 3);
  assert.equal(P.distancia("", "abc"), 3);
  assert.equal(P.distancia("stikcer", "sticker"), 2, "sin transposiciones, como lo usan los acertijos");
  assert.equal(P.distancia("stikcer", "sticker", { transposiciones: true }), 1);
  assert.equal(P.distancia("clmia", "clima", { transposiciones: true }), 1);
});

test("el parecido de un nombre: el mismo, su comienzo si es la mitad, o por los errores; sin tildes ni mayúsculas", () => {
  assert.equal(P.parecidoDeNombre("CUMPLEAÑOS", "cumpleanos"), 1);
  assert.ok(P.parecidoDeNombre("stick", "sticker") > 0.9);
  assert.ok(P.parecidoDeNombre("lista", "listaparejas") < 0.75, "cinco letras de doce no son su comienzo");
  assert.equal(P.parecidoDeNombre("sx", "s"), 0, "dos letras cuentan solo enteras");
  assert.equal(P.parecidoDeNombre("clmia", "clima"), 0.8);
  assert.ok(P.parecidoDeNombre("descargar", "destapar") < 0.75, "tres cambios en un nombre largo hacen otro");
});

test("una palabra en un texto: la misma, sus formas y, desde siete letras, un error que cuenta menos", () => {
  assert.equal(P.hallada("musica", P.palabrasDe("Reproduce música de YouTube.")), 1);
  assert.equal(P.hallada("sorteo", ["sortear"]), 0.9);
  assert.equal(P.hallada("descargar", ["descarga"]), 0.9);
  assert.equal(P.hallada("transferir", ["trans"]), 0, "un comienzo corto de una palabra larga no es una forma suya");
  assert.equal(P.hallada("plata", ["playa", "plaza"]), 0, "entre palabras cortas una letra hace otra");
  const conError = P.hallada("stikcer", ["sticker"]);
  assert.ok(conError > 0 && conError < 0.7, `${conError}`);
});

test("buscar: un nombre mal escrito o empezado, y lo que hace el comando", () => {
  for (const [buscado, primero] of [
    ["stikcer", "s"],
    ["clmia", "clima"],
    ["tiktk", "tt"],
    ["pign", "ping"],
    ["vdeo", "video"],
    ["stick", "s"],
    ["satvis", "satinf"],
    ["musica", "audio"],
    ["traducir", "traducir"],
    ["sorteo", "sortear"],
    ["como hago un sticker", "s"],
    ["algo para la musica", "audio"],
    ["descargar video de youtube", "video"],
  ])
    assert.equal(encontrados(buscado)[0], primero, buscado);
  assert.deepEqual(encontrados("stick").slice(0, 2), ["s", "stickerazar"]);
  assert.ok(encontrados("stick").length <= 5, "cinco como mucho");
});

test("buscar: lo que no se parece a nada no trae los cinco menos distintos, y una palabra de todas las líneas no trae ninguna", () => {
  for (const buscado of ["asdsadsa", "xyz", "grupo", "echar a alguien", "uru"]) assert.deepEqual(encontrados(buscado), [], buscado);
});

test("buscar: el nombre escrito entero va primero, aunque otra línea lo nombre, y un nombre mal escrito antes que la palabra en otra línea", () => {
  assert.equal(encontrados("vln", { ...GRUPO, ...ADMIN })[0], "vln", ".ln2 nombra .vln en su línea");
  assert.equal(encontrados("tagall", { ...GRUPO, ...ADMIN })[0], "tagall");
  assert.equal(encontrados("tiktk", { ...GRUPO, ...ADMIN })[0], "tt", "antes que .antitiktok, que dice TikTok");
});

test("buscar: solo lo que quien pregunta puede usar ahí, como lo ofrece el menú", () => {
  // The admins' commands, for the admins: by their topic (.antiflood's plugin asks for no role, .config does), and by
  // their plugin (.ln is an admin's, in a topic a moderator sees). And what anyone uses in part, for anyone (.diario).
  assert.deepEqual(encontrados("advertir"), []);
  assert.equal(encontrados("advertir", { ...GRUPO, ...ADMIN })[0], "advertir");
  assert.ok(!encontrados("antiflood").includes("antiflood"));
  assert.equal(encontrados("antiflood", { ...GRUPO, ...ADMIN })[0], "antiflood");
  assert.deepEqual(encontrados("lista negra", { ...GRUPO, isMod: true }).filter((c) => c.startsWith("ln") || c === "vln"), []);
  assert.deepEqual(encontrados("lista negra", { ...GRUPO, ...ADMIN }).slice(0, 3), ["ln", "ln2", "vln"]);
  assert.equal(encontrados("diario")[0], "diario");
  // What needs Claudia to be admin, while she isn't.
  assert.equal(encontrados("kik", { ...GRUPO, ...ADMIN })[0], "kick");
  assert.deepEqual(encontrados("kik", { ...GRUPO, ...ADMIN, isBotAdmin: false }), []);
  // What the group's switches stop, and what's blocked there.
  assert.equal(encontrados("ruleta")[0], "ruleta");
  assert.deepEqual(encontrados("ruleta", { isGroup: true, datosChat: { ...ABIERTO, casino: 0 } }), []);
  assert.deepEqual(encontrados("stikcer", { ...GRUPO, bloqueados: new Set(["s"]) }), []);
  // In private the group's commands too: it's where people ask how they're used.
  assert.ok(Object.values(cargados.plugins).find((p) => p.cmd?.includes("sortear"))?.onlyGroup, ".sortear es de grupo");
  assert.equal(encontrados("sorteo", { isGroup: false })[0], "sortear");
});

test(".buscarcomando: los parecidos con su línea, el tema si lo buscado es uno, lo que no encuentra y cómo se usa", async () => {
  const m = { chat: "grupo@g.us", isGroup: true };
  const pedir = async (text, extra = {}) => {
    globalThis.enviados = [];
    await Buscar.run(m, { client: conexion.client, text, usedPrefix: ".", chat: ABIERTO, isBotAdmin: true, isMod: false, isAdmin: false, isOwner: false, ...extra });
    return ultimoEnviado()?.msg?.text;
  };
  const lineaDe = (cmd) => M.entradasDelMenu(".").find((e) => e.cmd === cmd).linea;
  assert.equal(await pedir("clmia"), `🔎 *Lo más parecido a «clmia»*\n${lineaDe("clima")}\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n.menu para ver los temas`);
  // "stikcer" is also like "sticker", an alias of the stickers' topic.
  assert.equal(await pedir("stikcer"), `🔎 *Lo más parecido a «stikcer»*\n${lineaDe("s")}\n📂 También hay un tema: 🔄 .menu convertidores\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n.menu para ver los temas`);
  assert.equal(await pedir("asdsadsa"), "🤔 No encontré ningún comando parecido a «asdsadsa». Probá con otra palabra, o mirá .menu.");
  assert.equal(await pedir(""), "🔎 Decime qué buscás: .buscarcomando sticker, o el nombre de un comando aunque no sepas bien cómo se escribe.");
  assert.equal(await pedir("juegos"), "🔎 Para «juegos» hay un tema en el menú: 🎮 .menu juegos");
  assert.match(await pedir("descargar"), /\n📂 También hay un tema: 🎧 \.menu descargas\n/);
  assert.equal(await pedir("juegos", { chat: { ...ABIERTO, games: 0 } }), "🤔 No encontré ningún comando parecido a «juegos». Probá con otra palabra, o mirá .menu.", "un tema apagado no se ofrece");
  assert.doesNotMatch(await pedir("admins"), /menu admins/, "ni uno que quien pregunta no ve");
  assert.match(await pedir("admins", { isMod: true }), /menu admins/);
  // The role of whoever asks, and what's blocked in the group (blacklist mode, .bladd).
  assert.doesNotMatch(await pedir("lista negra", { isMod: true }), /▸ \.ln /);
  assert.match(await pedir("lista negra", { isMod: true, isAdmin: true }), /\n▸ \.ln /);
  F.addToChatBlacklist(m.chat, "s");
  try {
    assert.equal(await pedir("stikcer", { chat: { ...ABIERTO, blacklistMode: 1 } }), "🔎 Para «stikcer» hay un tema en el menú: 🔄 .menu convertidores");
  } finally {
    F.removeFromChatBlacklist(m.chat, "s");
  }
});

// Through the plugin, as the dispatcher runs it: isAdmin reaches the search, and a moderator isn't offered an admin's .ln.
test(".menu <palabra> por el plugin: busca con el rol de quien pregunta", async () => {
  const Menu = cargados.plugins.menu;
  const pedir = async (roles) => {
    globalThis.enviados = [];
    await Menu.run({ chat: "grupo@g.us", isGroup: true, pushName: "Ana" }, { client: conexion.client, usedPrefix: ".", args: ["lista", "negra"], chat: ABIERTO, isBotAdmin: true, ...roles });
    return globalThis.enviados.find((e) => e.msg?.text)?.msg.text;
  };
  assert.match(await pedir({ isMod: true, isAdmin: true }), /\nEstos comandos se le parecen:\n▸ \.ln @mención/);
  assert.doesNotMatch(await pedir({ isMod: true, isAdmin: false }), /▸ \.ln /);
});

test(".menu con una palabra que no es un tema: los comandos parecidos y el tema más parecido; sin nada, los temas como siempre", () => {
  const menu = (pedido, extra = {}) => M.textoMenu({ pedido, ...GRUPO, ...extra });
  const deS = M.entradasDelMenu(".").find((e) => e.cmd === "s").linea;
  assert.match(menu("como hago un sticker"), new RegExp(`^🔎 No tengo el tema \\*como hago un sticker\\*\\.\\nEstos comandos se le parecen:\\n${deS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n`));
  assert.equal(menu("jeugos"), "🔎 No tengo el tema *jeugos*. ¿Buscabas 🎮 .menu juegos?\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n.menu para volver · .menu todo para verlo todo");
  assert.match(menu("advertir"), /^🤔 No tengo el tema \*advertir\*\. Los temas son:/, "a un miembro no le ofrece lo de los admins");
  assert.match(menu("advertir", ADMIN), /\nEstos comandos se le parecen:\n▸ \.advertir /, "a un admin, sí");
});
