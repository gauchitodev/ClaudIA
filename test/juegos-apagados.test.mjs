import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { prepararBase } from "./helpers.mjs";

// .juego <nombre> on|off (plugins/juego.js, lib/juegos-apagados.js): one game switched off at a time, per group. The
// catalogue against the real plugins, how a name is read, what is kept in the database, the texts, the notice's limit,
// and .config's line.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const G = "120363000000000101@g.us";
const ADMIN = "300000000000051@lid";

let F, J, Plugin, Config, plugins;
before(async () => {
  ({ F } = await prepararBase("juegos-apagados"));
  globalThis.botVersion = "v3.3.0";
  globalThis.baileys = "@whiskeysockets/baileys"; // plugins/_anti-delete-messages.js imports it dynamically
  // The real plugins, as the bot loads them: the catalogue is checked against their commands and flags.
  plugins = {};
  for (const archivo of fs.readdirSync(path.join(RAIZ, "plugins")).filter((f) => f.endsWith(".js"))) {
    const mod = await import(pathToFileURL(path.join(RAIZ, "plugins", archivo)).href);
    plugins[archivo.replace(".js", "")] = mod.default || mod;
  }
  globalThis.plugins = plugins;
  J = await import("../lib/juegos-apagados.js");
  Plugin = plugins.juego;
  Config = plugins["grupo-config"];
  F.initDataDB({ chat: G, sender: ADMIN, senderJid: "", pushName: "Ana" });
});
beforeEach(() => {
  globalThis.enviados = [];
  F.updateChat(G, { juegosApagados: "[]", games: 1, casino: 1 });
});

const fila = () => F.getChat(G);
const ultimo = () => globalThis.enviados.at(-1)?.msg?.text;
const juego = (args, extra = {}) => Plugin.run({ chat: G, sender: ADMIN, isGroup: true }, { client: globalThis.client, args, usedPrefix: ".", chat: fila(), ...extra });

// The commands of the game plugins that are not a start: moves, exits and information, which stay on with the game
// off. Everything else a plugin with juego or casino declares has to be in the catalogue.
const NO_EMPIEZAN = {
  "coins-blackjack": ["pedir", "plantarse", "plantarme", "doblar", "dividir", "seguro"],
  "coins-mines": ["destapar", "abrir", "retirar"],
  "coins-duelo": ["acepto", "rechazo", "golpe", "patada", "cubrirse", "curar"],
  "coins-mercado": ["mercados", "mercado"],
  "coins-mercado-admin": ["resolver"],
  "coins-poker-mesa": ["paso", "pago", "igualo", "voy", "subo", "allin", "novoy", "levantarme", "mesa", "delpoker"],
  "fun-4enlinea-del": ["del4enlinea"],
  "fun-rendirse": ["rendirse", "rendirme"],
};

test("el catálogo: todo comando de un plugin de juego o casino empieza un juego del catálogo o es una jugada o salida conocida", () => {
  const deJuegos = Object.entries(plugins).filter(([, p]) => (p?.juego || p?.casino) && Array.isArray(p.cmd));
  assert.ok(deJuegos.length > 30, `pocos plugins de juego cargados (${deJuegos.length})`);
  const sinClasificar = [];
  const enLosDos = [];
  for (const [archivo, p] of deJuegos) {
    for (const cmd of p.cmd) {
      const empieza = J.JUEGOS.some((j) => j.comandos.includes(cmd));
      const noEmpieza = (NO_EMPIEZAN[archivo] || []).includes(cmd);
      if (!empieza && !noEmpieza) sinClasificar.push(`${archivo}: ${cmd}`);
      if (empieza && noEmpieza) enLosDos.push(`${archivo}: ${cmd}`);
    }
  }
  assert.deepEqual(sinClasificar, [], "comandos de juego que no están en lib/juegos-apagados.js ni en la lista de jugadas del test");
  assert.deepEqual(enLosDos, []);
  // nothing stale: every command of the catalogue is a game plugin's, and no command is in two entries
  const existentes = new Set(deJuegos.flatMap(([, p]) => p.cmd));
  const muertos = J.JUEGOS.flatMap((j) => j.comandos).filter((cmd) => !existentes.has(cmd));
  assert.deepEqual(muertos, []);
  const vistos = new Map();
  for (const j of J.JUEGOS) for (const cmd of j.comandos) {
    assert.ok(!vistos.has(cmd), `${cmd} está en ${vistos.get(cmd)} y en ${j.clave}`);
    vistos.set(cmd, j.clave);
  }
  // the keys are plain words, as people have to type them, each one once, with its article in the name
  const claves = J.JUEGOS.map((j) => j.clave);
  assert.deepEqual(claves, [...new Set(claves)]);
  for (const j of J.JUEGOS) {
    assert.match(j.clave, /^[a-z0-9]+$/, j.clave);
    assert.ok(j.nombre && j.comandos.length, j.clave);
  }
  assert.deepEqual(J.JUEGOS.filter((j) => j.casino).map((j) => j.clave), ["ruleta", "tragamonedas", "blackjack", "mines", "carrera", "duelos", "poker", "loteria", "mercados"]);
  // the NO_EMPIEZAN plugins exist and still declare those commands
  for (const [archivo, cmds] of Object.entries(NO_EMPIEZAN)) for (const cmd of cmds) assert.ok(plugins[archivo]?.cmd.includes(cmd), `${archivo} ya no declara ${cmd}`);
});

test("juegoDe: la clave, cualquiera de sus comandos o un alias, escritos como se escriben; lo demás, nada", () => {
  const clave = (t) => J.juegoDe(t)?.clave ?? null;
  for (const [texto, esperada] of [
    ["Ruleta", "ruleta"],
    ["4 en línea", "4enlinea"],
    ["4enlínea", "4enlinea"],
    ["cuatroenlinea", "4enlinea"],
    ["ta-te-ti", "ttt"],
    ["tateti", "ttt"],
    ["Póker", "poker"],
    ["holdem", "poker"],
    ["bj", "blackjack"],
    ["slots", "tragamonedas"],
    ["love", "porcentajes"],
    ["topgays", "tops"],
    ["toppajer@s", "tops"],
    ["cárcel", "canvas"],
    ["pelea", "duelos"],
    ["evento", "mercados"],
    ["sortear3", "sorteos"],
    ["", null],
    ["xyz", null],
    ["juegos", null],
    ["destapar", null],
  ]) assert.equal(clave(texto), esperada, JSON.stringify(texto));
  // the dispatcher's command is exact, and arrives without its accent (lib/comandos.js): ".4enlínea" is 4enlinea
  assert.equal(J.juegoDelComando("4enlinea")?.clave, "4enlinea");
  assert.equal(J.juegoDelComando("4enlínea"), null, "nunca llega así");
  assert.equal(J.juegoDelComando("acepto"), null);
});

test("apagar y prender: quedan en la fila del grupo, en el orden del catálogo, y lo que no es una lista de claves se lee como nada", () => {
  assert.deepEqual(J.apagar(G, "mines"), { ok: true, cambio: true, juego: J.JUEGOS.find((j) => j.clave === "mines") });
  assert.equal(fila().juegosApagados, '["mines"]');
  assert.equal(J.apagar(G, "mines").cambio, false, "ya estaba");
  J.apagar(G, "trivia");
  assert.equal(fila().juegosApagados, '["trivia","mines"]', "en el orden del catálogo, no del pedido");
  assert.deepEqual([J.estaApagado(fila(), "mines"), J.estaApagado(fila(), "ruleta")], [true, false]);
  assert.deepEqual(J.prender(G, "mines"), { ok: true, cambio: true, juego: J.JUEGOS.find((j) => j.clave === "mines") });
  assert.deepEqual([fila().juegosApagados, J.prender(G, "mines").cambio], ['["trivia"]', false]);
  assert.equal(J.apagar(G, "naval").ok, false, "un juego que no existe");
  assert.equal(J.apagar("otro@g.us", "mines").ok, false, "un grupo que no está en la base");
  for (const [valor, esperado] of [
    [undefined, []],
    ["", []],
    ["no json", []],
    ["{}", []],
    ['"mines"', []],
    ['["naval", "mines", "mines"]', ["mines"]],
  ]) assert.deepEqual(J.apagadosDe({ juegosApagados: valor }), esperado, JSON.stringify(valor));
  assert.deepEqual(J.apagadosDe(null), []);
  assert.deepEqual(J.apagadosDe({}), []);
});

test("juegoApagadoPara: solo lo que empieza el juego apagado; las respuestas y salidas con el mismo comando pasan", () => {
  const f = { juegosApagados: '["aura","poker","mines","4enlinea"]' };
  assert.equal(J.juegoApagadoPara(f, "aura", ["@alguien"])?.clave, "aura");
  assert.equal(J.juegoApagadoPara(f, "aura", [])?.clave, "aura", "el ranking también es del juego");
  for (const palabra of ["si", "sí", "SI", "no"]) assert.equal(J.juegoApagadoPara(f, "aura", [palabra]), null, palabra);
  assert.equal(J.juegoApagadoPara(f, "poker", ["100"])?.clave, "poker");
  assert.equal(J.juegoApagadoPara(f, "poker", [])?.clave, "poker");
  for (const palabra of ["empezar", "arrancar"]) assert.equal(J.juegoApagadoPara(f, "poker", [palabra])?.clave, "poker", `repartir es jugar (${palabra})`);
  for (const palabra of ["salir", "levantarme", "cancelar", "cerrar"]) assert.equal(J.juegoApagadoPara(f, "poker", [palabra]), null, palabra);
  assert.equal(J.juegoApagadoPara(f, "mines", ["10"])?.clave, "mines");
  for (const cmd of ["destapar", "retirar", "del4enlinea", "rendirse", "ruleta", "levantarme"]) assert.equal(J.juegoApagadoPara(f, cmd, []), null, cmd);
  assert.equal(J.juegoApagadoPara(f, "4enlinea", [])?.clave, "4enlinea");
  assert.deepEqual([...J.comandosApagados(f)].sort(), ["4enlinea", "aura", "mines", "minas", "poker"].sort());
  assert.deepEqual([...J.comandosApagados(null)], []);
});

test("los textos: el estado, el rechazo, y el aviso que sale una vez cada 10 minutos por grupo y juego", () => {
  assert.equal(
    J.textoEstado({ juegosApagados: '["tops","mines"]', games: 1, casino: 1 }),
    "🎮 *Juegos de este grupo*\nJuegos: ✅ trivia · ✅ ahorcado · ✅ acertijos · ✅ banderas · ✅ ordenar · ✅ ttt · ✅ 4enlinea · ✅ aura · ✅ culpade · ✅ formarpareja · ⛔ tops · ✅ canvas · ✅ porcentajes · ✅ sorteos\nCasino: ✅ ruleta · ✅ tragamonedas · ✅ blackjack · ⛔ mines · ✅ carrera · ✅ duelos · ✅ poker · ✅ loteria · ✅ mercados\n\n.juego mines off apaga uno y .juego mines on lo prende. Para todos de una: .juegos y .casino.",
  );
  assert.match(J.textoEstado({ juegosApagados: "[]", games: 0, casino: 1 }), /\nOjo: acá los juegos están apagados del todo \(\.juegos off\); esto aplica cuando los prendan\.$/);
  assert.match(J.textoEstado({ juegosApagados: "[]", games: 1, casino: 0 }, "/"), /\nOjo: acá el casino está apagado del todo \(\/casino off\); esto aplica cuando lo prendan\.$/);
  assert.doesNotMatch(J.textoEstado({ games: 1, casino: 1 }), /Ojo/);
  assert.equal(J.textoJuegoApagado(J.juegoDe("4enlinea")), "⛔ Acá un admin apagó el 4 en línea. Se prende con .juego 4enlinea on.");
  assert.equal(J.textoJuegoApagado(J.juegoDe("ruleta"), "/"), "⛔ Acá un admin apagó la ruleta. Se prende con /juego ruleta on.");
  const t0 = 1_800_000_000_000;
  assert.equal(J.correspondeAvisarApagado(G, "mines", t0), true);
  assert.equal(J.correspondeAvisarApagado(G, "mines", t0 + 1000), false);
  assert.equal(J.correspondeAvisarApagado(G, "ruleta", t0 + 1000), true, "otro juego, su propio aviso");
  assert.equal(J.correspondeAvisarApagado("otro@g.us", "mines", t0 + 1000), true, "otro grupo también");
  assert.equal(J.correspondeAvisarApagado(G, "mines", t0 + J.JUEGOS_APAGADOS.AVISO_CADA_MS), true);
  for (const [palabra, valor] of [
    ["on", true],
    ["Prender", true],
    ["sí", true],
    ["off", false],
    ["apagar", false],
    ["no", false],
    ["xyz", null],
    ["", null],
  ]) assert.equal(J.leerInterruptor(palabra), valor, palabra);
});

test(".juego: lista, apaga y prende por nombre o alias, invierte sin palabra, y explica lo que no entiende", async () => {
  assert.deepEqual([Plugin.cmd, Plugin.onlyGroup, Plugin.onlyAdmin, Plugin.botAdmin, Plugin.juego, Plugin.casino], [["juego"], true, true, undefined, undefined, undefined]);
  await juego([]);
  assert.match(ultimo(), /^🎮 \*Juegos de este grupo\*\nJuegos: ✅ trivia/);

  await juego(["mines", "off"]);
  assert.equal(ultimo(), "⛔ Listo: apagué el mines en este grupo. Hasta que alguien escriba .juego mines on no se empieza más; lo que ya iba se termina.");
  assert.equal(fila().juegosApagados, '["mines"]');
  await juego(["Minas", "OFF"]);
  assert.equal(ultimo(), "⛔ Listo: apagué el mines en este grupo (ya estaba así). Hasta que alguien escriba .juego mines on no se empieza más; lo que ya iba se termina.");
  await juego(["mines"]);
  assert.deepEqual([ultimo(), fila().juegosApagados], ["✅ Listo: prendí el mines de nuevo en este grupo.", "[]"], "sin palabra, lo invierte");
  await juego(["mines"]);
  assert.equal(fila().juegosApagados, '["mines"]');
  await juego(["mines", "on"]);
  assert.equal(fila().juegosApagados, "[]");
  await juego(["mines", "on"]);
  assert.equal(ultimo(), "✅ Listo: prendí el mines de nuevo en este grupo (ya estaba así).");

  // the name as people write it, the switch's other words, and the prefix they used
  await juego(["4", "en", "línea", "apagar"]);
  assert.deepEqual([ultimo(), fila().juegosApagados], ["⛔ Listo: apagué el 4 en línea en este grupo. Hasta que alguien escriba .juego 4enlinea on no se empieza más; lo que ya iba se termina.", '["4enlinea"]']);
  await juego(["Póker", "no"], { usedPrefix: "/" });
  assert.match(ultimo(), /^⛔ Listo: apagué el póker en este grupo\. Hasta que alguien escriba \/juego poker on/);
  assert.equal(fila().juegosApagados, '["4enlinea","poker"]');
  await juego(["holdem", "si"]);
  assert.equal(fila().juegosApagados, '["4enlinea"]');

  // what it doesn't understand
  await juego(["xyz", "on"]);
  assert.equal(ultimo(), "🤔 No conozco ese juego: *xyz*. Los que se apagan de a uno: trivia, ahorcado, acertijos, banderas, ordenar, ttt, 4enlinea, aura, culpade, formarpareja, tops, canvas, porcentajes, sorteos, ruleta, tragamonedas, blackjack, mines, carrera, duelos, poker, loteria, mercados.");
  await juego(["mines", "quizás"]);
  assert.equal(ultimo(), "Usá .juego mines on o .juego mines off (sin nada, lo invierte).");
  await juego(["todos", "off"]);
  assert.equal(ultimo(), "Para todos de una: .juegos on u off, y el casino con .casino. .juego es para uno solo: .juego mines off.");
  assert.equal(fila().juegosApagados, '["4enlinea"]', "nada de eso tocó la lista");

  // with the group-wide switch off it says so, once it's done what it was asked
  F.updateChat(G, { games: 0 });
  await juego(["trivia", "off"]);
  assert.match(ultimo(), /^⛔ Listo: apagué la trivia \(y la relámpago\) en este grupo\..*\n\nOjo: acá los juegos están apagados del todo \(\.juegos off\); esto aplica cuando los prendan\.$/s);
  F.updateChat(G, { games: 1, casino: 0 });
  await juego(["ruleta", "off"]);
  assert.match(ultimo(), /\n\nOjo: acá el casino está apagado del todo \(\.casino off\); esto aplica cuando lo prendan\.$/);
  await juego(["ahorcado", "off"]);
  assert.doesNotMatch(ultimo(), /Ojo/, "el casino apagado no le cambia nada al ahorcado");
});

test(".config: dice qué juegos están apagados de a uno", async () => {
  const config = () => Config.run({ chat: G, sender: ADMIN, isGroup: true }, { client: globalThis.client, groupMetadata: { id: G, subject: "Grupo" }, chat: fila() });
  await config();
  assert.match(ultimo(), /\n🎮 Juegos apagados de a uno: ninguno \(\.juego\)\n/);
  J.apagar(G, "tops");
  J.apagar(G, "mines");
  await config();
  assert.match(ultimo(), /\n🎮 Juegos apagados de a uno: tops, mines \(\.juego\)\n/);
});
