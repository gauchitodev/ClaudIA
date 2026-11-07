import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { prepararBase, ultimoEnviado } from "./helpers.mjs";
import { configuracion } from "../lib/configuracion.js";
import { conexion } from "../lib/conexion.js";

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
  configuracion.botVersion = "v3.3.0";
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
  assert.match(temas(MOD), /🛡️ admins/);
  assert.match(temas(MOD), /⚙️ config/);
  assert.doesNotMatch(temas(MOD), /owner/);
  assert.match(temas(OWNER), /🥷 owner/);
  assert.equal(menu({ pedido: "admins" }), "🛡️ Ese tema es para admins y moderadores del grupo.");
  assert.equal(menu({ pedido: "owner", ...MOD }), "🥷 Ese tema es solo del owner del bot.");
  assert.match(menu({ pedido: "config", ...MOD }), /^⚙️ \*Configuración\*\n_Las opciones de on u off, sin nada, se invierten; \.juego, \.iniciativa, \.voz, \.horariojuegos y \.modo solos muestran cómo están\._\n▸ \.modoadmin/);
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
  assert.match(menu({ pedido: "casino" }), /^🎰 \*Casino y apuestas\*/, "las secciones de .bladd también son temas");
  assert.match(menu({ pedido: "compraventa" }), /^📂 \*Otros menús\*\n[\s\S]*▸ \.menuventas/);
  assert.match(menu({ pedido: "juegos" }), /┈\n\.menu para volver · \.menu todo para verlo todo$/);
  assert.match(menu({ pedido: "xyz" }), /^🤔 No tengo el tema \*xyz\*\. Los temas son:\n🗳️ temáticas/);
});

test("menú: .menu todo trae todo lo que esa persona puede ver, sin repetir", () => {
  const miembro = menu({ pedido: "todo" });
  const mod = menu({ pedido: "TODO", ...MOD });
  assert.doesNotMatch(miembro, /Configuración|Admins y moderadores/);
  assert.match(mod, /⚙️ \*Configuración\*\n_Las opciones de on u off, sin nada, se invierten; \.juego, \.iniciativa, \.voz, \.horariojuegos y \.modo solos muestran cómo están\._/);
  assert.doesNotMatch(mod, /viceversa/, "el título viejo, de antes de que los interruptores aceptaran on y off");
  assert.doesNotMatch(mod, /▸ \.vendo/, "la compraventa está en .menuventas");
  const principales = (texto) => texto.split("\n").map((l) => M.comandoDeLinea(l)).filter(Boolean);
  const repetidos = (texto) => principales(texto).filter((c, i, todos) => todos.indexOf(c) !== i);
  assert.deepEqual(repetidos(miembro), []);
  assert.deepEqual(repetidos(menu({ pedido: "todo", ...OWNER })), ["antecedentes", "reglas", "redes"], "solo .antecedentes, .reglas y .redes, que están para todos y como .antecedentes @mención, .reglas set y .redes instagram <link> para admins");
});

// The economy and the casino were .menuuru, a menu apart written by hand for one group: .menu todo didn't show them,
// "lo más usado" couldn't count them and the jobs were in no menu. They're two topics now, and .menuuru is gone.
test("menú: la economía y el casino son temas, y ya no hay .menuuru", async () => {
  const coins = menu({ pedido: "coins" });
  assert.match(coins, /^🪙 \*UruCoins\*\n_Se ganan reaccionando \(\+1\) y cuando te reaccionan \(\+2\), ganando juegos \(\+10; hasta 20 premios/);
  for (const cmd of ["bal", "regalar", "tienda", "laburos", "racha", "mitimba"]) assert.match(coins, new RegExp(`\n▸ \\.${cmd} `), `.${cmd}`);
  assert.match(menu({ pedido: "Lotería" }), /^🎰 \*Casino y apuestas\*\n_\.ruleta, \.tragamonedas, \.blackjack, \.mines, \.carrera y \.poker, escritos solos/);
  assert.match(menu({ pedido: "admins", ...MOD }), /\n▸ \.evento <título> \| <opciones> \| <cierre> 📊 – `Solo admins: [^\n]+\n▸ \.resolver 7 Nacional/);
  assert.match(menu({ pedido: "extras" }), /\n▸ \.recap 📅/);
  assert.match(menu({ pedido: "casino", bloqueados: new Set(["ruleta"]) }), /\n▸ \.ruleta .+ 🔒\n/);
  // What the old menu said and the lines didn't: how the markets pay, the refund of .playya, and someone else's items.
  assert.match(menu({ pedido: "casino" }), /\n▸ \.mercados [^\n]+ Lo apostado se reparte entre los que aciertan, según lo que puso cada uno; si nadie acierta, se devuelve todo\.`\n/);
  assert.match(coins, /\n▸ \.tienda [^\n]+\.inventario \[@mención\] muestra lo tuyo o lo de otra persona\. \.playya y \.videoya saltan la espera de la música por 15, que se devuelven si la descarga falla\.`\n/);

  // The themes and the ranking, which were "grupo" with Uruguay's flag, have a topic of their own. .menuuru, .juegosuru
  // and .menu uru are gone: they get what any command or topic that doesn't exist gets.
  for (const pedido of ["temáticas", "tematicas", "grupo", "ranking"]) assert.match(menu({ pedido }), /^🗳️ \*Temáticas y ranking\*\n▸ #quejadelunes/, pedido);
  assert.match(menu({ pedido: "uru" }), /^🤔 No tengo el tema \*uru\*/);
  const deUru = Object.entries(globalThis.plugins).filter(([, p]) => p.cmd?.some((c) => ["menuuru", "juegosuru"].includes(c)));
  assert.deepEqual(deUru, []);

  // The note gives one cap for every game but the hangman: true while lib/urucoins.js keeps it so.
  const { PREMIOS_POR_DIA } = await import("../lib/urucoins.js");
  const topes = Object.entries(PREMIOS_POR_DIA).filter(([juego]) => juego !== "ahorcado").map(([, tope]) => tope.partidas);
  assert.deepEqual([...new Set(topes)], [PREMIOS_POR_DIA.trivia.partidas]);
});

test("menú: cada plugin de la economía y del casino tiene una línea", () => {
  const nombrados = new Set(M.entradasDelMenu(".").flatMap((e) => [e.cmd, ...e.nombrados]));
  const plugins = Object.entries(globalThis.plugins).filter(([, p]) => (p.economia || p.casino) && Array.isArray(p.cmd));
  assert.ok(plugins.length > 15, `muy pocos plugins de la economía (${plugins.length})`);
  assert.deepEqual(plugins.filter(([, p]) => !p.cmd.some((c) => nombrados.has(c))).map(([archivo]) => archivo), []);
});

// .modo compraventa turns off the games and the economy; .casino, the casino alone. The index offered their topics
// anyway.
test("menú: no ofrece lo que los interruptores del grupo apagan, y si se lo piden dice cómo se prende", () => {
  const temas = (opciones) => menu(opciones).split("📂")[1].split("📜")[0];
  const COMPRAVENTA = { ...ABIERTO, games: 0, monedas: 0 };
  assert.match(temas({}), /🗳️ temáticas · 🪙 coins · 🎰 casino/);
  const enVentas = temas({ datosChat: COMPRAVENTA });
  for (const fuera of ["coins", "casino", "canvas"]) assert.doesNotMatch(enVentas, new RegExp(fuera), fuera);
  assert.match(enVentas, /🎮 juegos/, ".besar y .siono andan con los juegos apagados");
  assert.doesNotMatch(menu({ pedido: "todo", datosChat: COMPRAVENTA }), /UruCoins\*|Casino y apuestas|\.ruleta|\.laburos/);
  assert.match(menu({ pedido: "todo", datosChat: COMPRAVENTA }), /🗳️ \*Temáticas y ranking\*/);
  assert.match(menu({ pedido: "admins", datosChat: COMPRAVENTA, ...MOD }), /\n▸ \.evento /, "el tema tiene otros comandos que andan");
  assert.equal(menu({ pedido: "casino", datosChat: COMPRAVENTA }), "🎰 Ese tema está apagado en este grupo: un admin lo prende con .juegos on y .monedas on.");
  assert.equal(menu({ pedido: "monedas", datosChat: COMPRAVENTA }), "🪙 Ese tema está apagado en este grupo: un admin lo prende con .monedas on.");
  assert.equal(menu({ pedido: "canvas", datosChat: COMPRAVENTA }), "🖼️ Ese tema está apagado en este grupo: un admin lo prende con .juegos on.");
  assert.match(menu({ pedido: "xyz", datosChat: COMPRAVENTA }), /Los temas son:\n🗳️ temáticas · 🎧 descargas/);

  // With only the casino off, the economy stays.
  const SIN_CASINO = { ...ABIERTO, casino: 0 };
  assert.match(temas({ datosChat: SIN_CASINO }), /🗳️ temáticas · 🪙 coins · 🎧 descargas/);
  assert.equal(menu({ pedido: "casino", datosChat: SIN_CASINO }), "🎰 Ese tema está apagado en este grupo: un admin lo prende con .casino on.");
  // A command two plugins answer to runs when one of them does, as in puedeCorrerAca: handle-message runs both.
  const conOtro = { ...globalThis.plugins, otro: { cmd: ["ruleta"] } };
  assert.match(menu({ pedido: "casino", datosChat: SIN_CASINO, plugins: conOtro }), /^🎰 \*Casino y apuestas\*\n/);
  // A topic for admins is still theirs to ask for: the role answers first.
  assert.equal(menu({ pedido: "admins", datosChat: COMPRAVENTA }), "🛡️ Ese tema es para admins y moderadores del grupo.");

  // Claudia not being admin hides nothing (the index warns instead), and in private there are no switches.
  assert.equal(temas({ isBotAdmin: false, datosChat: COMPRAVENTA }), enVentas);
  assert.equal(temas({ isBotAdmin: false }), temas({}));
  assert.match(temas({ isGroup: false, chatId: "59899111222@s.whatsapp.net", datosChat: null }), /🗳️ temáticas · 🪙 coins · 🎰 casino/);
});

test("menú: el 🔒 va en todas las respuestas, y lo bloqueado no entra en lo más usado", () => {
  usar(G, "trivia", 100);
  const bloqueados = new Set(["trivia"]);
  assert.match(menu({ pedido: "juegos", bloqueados }), /▸ \.trivia ❔ – `Pregunta con cuatro opciones; respondé con la letra\.` 🔒/);
  assert.match(menu({ pedido: "todo", bloqueados }), /▸ \.trivia .+ 🔒/);
  assert.ok(!comandos(masUsados({ bloqueados })).includes("trivia"));
  assert.equal(comandos(masUsados())[0], "trivia");
});

test("menú: un juego apagado con .juego lleva ⛔, no entra en lo más usado, y el tema config ofrece .juego", () => {
  const SIN = { ...ABIERTO, juegosApagados: '["mines","trivia"]' };
  assert.match(menu({ pedido: "casino", datosChat: SIN }), /\n▸ \.mines .+ ⛔\n/);
  assert.match(menu({ pedido: "juegos", datosChat: SIN }), /\n▸ \.trivia .+ ⛔\n/);
  assert.doesNotMatch(menu({ pedido: "juegos", datosChat: SIN }), /▸ \.ahorcado .+ ⛔/);
  assert.match(menu({ pedido: "todo", datosChat: SIN }), /▸ \.mines .+ ⛔\n/);
  assert.match(menu({ pedido: "juegos", datosChat: SIN, bloqueados: new Set(["trivia"]) }), /▸ \.trivia .+ ⛔ 🔒\n/, "las dos marcas");
  assert.doesNotMatch(menu({ pedido: "casino" }), /⛔/, "sin nada apagado, sin marcas");
  usar(G, "trivia", 100);
  usar(G, "mines", 90);
  usar(G, "clima", 10);
  const cmds = comandos(masUsados({ datosChat: SIN }));
  assert.ok(!cmds.includes("trivia") && !cmds.includes("mines") && cmds.includes("clima"), cmds.join(","));
  assert.deepEqual(comandos(masUsados()).slice(0, 2), ["trivia", "mines"]);
  assert.match(menu({ pedido: "config", ...MOD }), /\n▸ \.juego mines off ⛔ – `Apaga un solo juego/);
  // in private there is no group to switch anything off in
  assert.doesNotMatch(menu({ pedido: "juegos", isGroup: false, chatId: "59899111222@s.whatsapp.net", datosChat: SIN }), /⛔/);
});

// The lines write a name as people do (".recordá que…", ".cárcel" in .gay's) and read it as the parser reads a typed
// one, without its accents (lib/comandos.js): that's how the uses are counted and the plugins declare it.
test("lo más usado: una línea escrita con tilde cuenta los usos del comando sin tilde, y lleva su 🔒", () => {
  assert.equal(M.comandoDeLinea("▸ .recordá que <algo> 🧠 – `x`"), "recorda");
  usar(G, "recorda", 50);
  usar(G, "carcel", 40); // named in .gay's line, as .cárcel
  assert.deepEqual(comandos(masUsados()).slice(0, 2), ["recorda", "gay"]);
  assert.match(menu({ pedido: "extras", bloqueados: new Set(["recorda"]) }), /\n▸ \.recordá que <algo> .+ 🔒\n/);
});

test("lo más usado: lo del grupo, con los alias de cada línea juntos", () => {
  usar(G, "sticker", 15);
  usar(G, "s", 10); // .s and .sticker are the same line: 25
  usar(G, "play", 12); // dl-youtube: .play is the .audio line
  usar(G, "videoya", 11); // and .videoya the .video line, not .audio's
  usar(G, "gemini", 9); // .gemini lands on .ia
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

test("lo más usado: cuenta el casino y los laburos, que no tenían línea", () => {
  usar(G, "ruleta", 40);
  usar(G, "cobrar", 30); // .laburos's line
  usar(G, "pedir", 20); // a move of the blackjack: its line
  usar(G, "clima", 10);
  assert.deepEqual(comandos(masUsados()).slice(0, 4), ["ruleta", "laburos", "blackjack", "clima"]);
  assert.deepEqual(comandos(masUsados({ datosChat: { ...ABIERTO, casino: 0 } })).slice(0, 2), ["laburos", "clima"], "sin el casino, quedan los laburos");
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

// Where Claudia isn't admin, the dispatcher refuses every plugin.botAdmin: the index used to recommend them anyway.
test("lo más usado: donde Claudia no es admin, no recomienda lo que necesita que lo sea, y lo avisa", () => {
  const sinAdmin = comandos(masUsados({ isBotAdmin: false, ahora: new Date(2040, 5, 1, 15, 0) }));
  const necesitanAdmin = M.MENU.POR_DEFECTO.filter((cmd) => Object.values(globalThis.plugins).some((p) => p.cmd?.includes(cmd) && p.botAdmin));
  assert.ok(necesitanAdmin.length > 0, "la lista fija tiene comandos que piden admin");
  for (const cmd of necesitanAdmin) assert.ok(!sinAdmin.includes(cmd), `.${cmd} necesita admin`);
  assert.match(menu({ isBotAdmin: false }), /⚠️ Acá no soy admin: muchos comandos no andan hasta que me hagan admin del grupo\./);
  assert.doesNotMatch(menu(), /no soy admin/);
  assert.doesNotMatch(menu({ isBotAdmin: false, isGroup: false }), /no soy admin/, "en privado no aplica");
});

test("lo más usado: cada comando de la lista fija tiene su línea para todos", () => {
  const publicas = M.entradasDelMenu(".").filter((e) => e.seccion.para === "todos");
  for (const cmd of M.MENU.POR_DEFECTO) assert.ok(publicas.some((e) => e.cmd === cmd), `.${cmd} no tiene línea`);
});

test(".menu: manda el índice citando y reacciona; con el modo blacklist marca lo bloqueado", async () => {
  F.initDataDB({ chat: G, sender: "111@lid", senderJid: "", pushName: "Ana" });
  const m = { chat: G, isGroup: true, pushName: "Ana", key: { id: "PEDIDO" } };
  await Menu.run(m, { client: conexion.client, usedPrefix: ".", args: [], chat: F.getChat(G), isMod: false, isOwner: false });
  const [indice, reaccion] = globalThis.enviados.slice(-2);
  assert.match(indice.msg.text, /^👋 \*Hola, Ana\*/);
  assert.equal(reaccion.msg.react.text, "📚");
  F.addToChatBlacklist(G, "trivia");
  await Menu.run(m, { client: conexion.client, usedPrefix: ".", args: ["juegos"], chat: { ...F.getChat(G), blacklistMode: 1 }, isMod: false, isOwner: false });
  assert.match(globalThis.enviados.at(-2).msg.text, /▸ \.trivia .+ 🔒/);
  assert.ok(ultimoEnviado().msg.react);
});

// .info tells that the bot's code is open, and where (plugins/info-bot.js); its line still said "Cómo instalar el bot".
test("menú: la línea de .info dice lo que cuenta .info", () => {
  const linea = M.seccionesDelMenu(".").flatMap((s) => s.lineas.split("\n")).find((l) => l.includes(".info 💻"));
  assert.match(linea, /código es abierto/);
  assert.doesNotMatch(linea, /instalar/);
});

test("consistencia: puedeCorrerAca mira los mismos interruptores que handle-message", () => {
  // The ranking leaves out what wouldn't run here. If handle-message checks change, lib/menu.js has to follow.
  const fuente = fs.readFileSync(path.join(RAIZ, "handle-message.js"), "utf8");
  for (const condicion of ["plugin.onlyGroup && !m.isGroup", "plugin.botAdmin && !isBotAdmin", "plugin.juego && !chat.games", "plugin.casino && m.isGroup && chat.casino === 0", "juegoApagadoPara(chat, command, args)", "plugin.economia && m.isGroup && chat.monedas === 0"]) {
    assert.ok(fuente.includes(condicion), `handle-message ya no chequea «${condicion}»: revisá puedeCorrerAca en lib/menu.js`);
  }
});

// Claudia's manual names every command, the admins' included: those that whoever asks can't use aren't recommended to
// them (plugins/_auto-ia.js). Out of reach is what's in a topic they don't see, unless another topic they see names it,
// and what a plugin keeps for a role they don't have; a few anyone can use in part (.roles lists, .iniciativa says how
// it's going) stay in.
test("sinPermisoEn: lo que nombra un texto y no puede usar quien pregunta, según su rol", () => {
  // .reglas and .antecedentes head lines of the admins' topic (.reglas set, .antecedentes @persona), and a topic for
  // everyone has them too.
  // .voz alone tells anyone how the voice is set, as .iniciativa does: an admin switches it.
  const texto = "Probá .tagall, .notagall, .kick, .horariojuegos, .casino, .adminbot, .roles, .calificaciones, .iniciativa, .voz, .reglas, .antecedentes, .4enlinea, .addowner o .menu.";
  assert.deepEqual(M.sinPermisoEn(texto, {}), ["tagall", "kick", "horariojuegos", "casino", "adminbot", "addowner"]);
  // A moderator has the moderators' commands, not the ones a plugin keeps for admins or for the owner.
  const deModeracion = "Probá .tagall, .kick, .horariojuegos, .llamar o .addowner.";
  assert.deepEqual(M.sinPermisoEn(deModeracion, { isMod: true }), ["horariojuegos", "llamar", "addowner"]);
  assert.deepEqual(M.sinPermisoEn(deModeracion, { isMod: true, isAdmin: true }), ["addowner"]);
  assert.deepEqual(M.sinPermisoEn(`${texto} ${deModeracion}`, { isMod: true, isAdmin: true, isOwner: true }), []);
});
