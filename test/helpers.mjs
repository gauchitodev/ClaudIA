// Shared helpers for the tests. Each test file runs in its own process (node --test) with a fresh SQLite database
// in a temp folder, so they don't step on each other or touch the bot's real database.
import fs from "fs";
import os from "os";
import path from "path";

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
    sendText: async (chat, text) => {
      globalThis.enviados.push({ chat, msg: { text } });
      return { key: { id: `MSG${globalThis.enviados.length}` } };
    },
    sendFile: async (chat, archivo) => {
      globalThis.enviados.push({ chat, archivo });
      return {};
    },
  };
}

// Creates a fresh database in a temp folder and sets the globals the bot expects.
export async function prepararBase(nombre = "prueba") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `claudia-test-${nombre}-`));
  process.chdir(dir);
  process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
  globalThis.owners = ["59899111222"];
  globalThis.prefix = [".", "/", "@"];
  globalThis.geminiApiKey = "";
  globalThis.groqApiKey = "";
  globalThis.cerebrasApiKey = "";
  globalThis.botConectado = true;
  globalThis.client = clienteFalso();
  const F = await import("../database-functions.js");
  globalThis.db = F.loadDatabase();
  return { F, dir };
}

export const ultimoEnviado = () => globalThis.enviados[globalThis.enviados.length - 1];

// Sets the balance to exactly n (moverCoins takes negatives; ganarCoins ignores amounts <= 0).
export function fijarSaldo(F, chat, usuario, n) {
  const diferencia = n - F.getSaldoCoins(chat, usuario);
  if (diferencia !== 0) F.moverCoins(chat, usuario, diferencia, "test_carga");
}
