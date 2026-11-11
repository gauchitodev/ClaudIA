// Shared helpers for the tests. Each test file runs in its own process (node --test) with a fresh SQLite database
// in a temp folder, so they don't step on each other or touch the bot's real database.
import fs from "fs";
import os from "os";
import path from "path";
import { configuracion } from "../lib/configuracion.js";
import { conexion } from "../lib/conexion.js";

export const G = "grupo@g.us";
export { setTimeout as esperar } from "node:timers/promises";
export const carta = (s) => ({ v: s.slice(0, -1), p: s.slice(-1) });
// cards are dealt with pop(): the first in the list comes out first
export const mazoDe = (...cartas) => cartas.map(carta).reverse();

export function clienteFalso() {
  globalThis.enviados = [];
  return {
    user: { lid: "bot@lid", id: "bot@s.whatsapp.net", jid: "bot@s.whatsapp.net", name: "Claudia" },
    chats: {},
    sendMessage: async (chat, msg) => {
      globalThis.enviados.push({ chat, msg });
      return { key: { id: `MSG${globalThis.enviados.length}` } };
    },
    // Like the real one (lib/wa-socket.js), the mentions travel with the message.
    sendText: async (chat, text, quoted, opciones = {}) => {
      globalThis.enviados.push({ chat, msg: opciones?.mentions ? { text, mentions: opciones.mentions } : { text } });
      return { key: { id: `MSG${globalThis.enviados.length}` } };
    },
    sendFile: async (chat, archivo) => {
      globalThis.enviados.push({ chat, archivo });
      return {};
    },
  };
}

// Creates a fresh database in a temp folder, and sets the settings the tests start from (lib/configuracion.js: an
// owner, no AI keys) and the connection (lib/conexion.js: a fake socket, connected).
export async function prepararBase(nombre = "prueba") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `claudia-test-${nombre}-`));
  process.chdir(dir);
  process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
  configuracion.owners = ["59899111222"];
  configuracion.geminiApiKey = "";
  configuracion.groqApiKey = "";
  configuracion.cerebrasApiKey = "";
  conexion.botConectado = true;
  conexion.client = clienteFalso();
  // The plugins' pauses for show (lib/pausas.js) pass at once, after a turn of the event loop as a timer would give:
  // waited out, they were most of what the slowest files took. A test that checks one sets its own.
  (await import("../lib/pausas.js"))._dep.esperar = () => new Promise((r) => setImmediate(r));
  // The intent classifier (lib/intencion.js) reads nothing unless a test says what it reads: what its weights make of
  // a text changes with every training, and the tests of the sales rules are about the rules.
  (await import("../lib/intencion.js"))._dep.probabilidades = () => null;
  const F = await import("../database-functions.js");
  globalThis.db = F.loadDatabase();
  return { F, dir };
}

export const ultimoEnviado = () => globalThis.enviados[globalThis.enviados.length - 1];

// The nodes of some code's syntax tree, as ESLint parses it, that match a selector (the language of
// no-restricted-syntax, eslint.config.js), each with its parent. For what the tests check of main.js, which no test can
// run (it connects to WhatsApp): read as text, a call commented out still matched, and a variable renamed broke the
// check. ESLint is loaded only by the files that ask.
export async function nodosQue(selector, codigo) {
  const { Linter } = await import("eslint");
  const nodos = [];
  const regla = { create: () => ({ [selector]: (nodo) => nodos.push(nodo) }) };
  const config = { languageOptions: { ecmaVersion: "latest", sourceType: "module" }, plugins: { prueba: { rules: { nodos: regla } } }, rules: { "prueba/nodos": "error" } };
  const fatal = new Linter().verify(codigo, [config], { filename: "codigo.js" }).find((m) => m.fatal);
  if (fatal) throw new Error(`El código no parsea: ${fatal.message} (línea ${fatal.line})`);
  return nodos;
}

// Of a node nodosQue found, the handler it's in among those main.js gives client.ev.on("…", handler): the function
// passed as the second argument, or null.
export function manejadorDe(nodo) {
  for (let n = nodo.parent; n; n = n.parent) if (n.type.includes("Function") && n.parent?.callee?.property?.name === "on" && n.parent.arguments[1] === n) return n;
  return null;
}

// Whether a node is the client as main.js names it, off lib/conexion.js (conexion.client), or bare, as the tests' own
// examples write it.
export const esElCliente = (nodo) => nodo?.name === "client" || (nodo?.object?.name === "conexion" && nodo.property?.name === "client");

// Whether a node is inside another one, of the same tree.
export function dentroDe(nodo, otro) {
  for (let n = nodo; n; n = n.parent) if (n === otro) return true;
  return false;
}

// Whether a call inside a handler gets each thing the event brings: its second argument is the variable of a for…of
// over the handler's parameter (or over that parameter || []).
export function recorreElEvento(llamada) {
  const manejador = manejadorDe(llamada);
  const evento = manejador?.params[0]?.name;
  for (let n = llamada.parent; n && n !== manejador; n = n.parent) {
    if (n.type !== "ForOfStatement") continue;
    const recorre = n.right.type === "LogicalExpression" ? n.right.left : n.right;
    if (recorre.name === evento && n.left.declarations?.[0]?.id.name === llamada.arguments[1]?.name) return true;
  }
  return false;
}

// Sets the balance to exactly n (moverCoins takes negatives; ganarCoins ignores amounts <= 0).
export function fijarSaldo(F, chat, usuario, n) {
  const diferencia = n - F.getSaldoCoins(chat, usuario);
  if (diferencia !== 0) F.moverCoins(chat, usuario, diferencia, "test_carga");
}
