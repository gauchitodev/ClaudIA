// Utilidades compartidas por las pruebas. Cada archivo de prueba corre en su propio proceso (node --test) con una
// base SQLite nueva en una carpeta temporal, así que no se pisan entre sí ni tocan la base real del bot.
import fs from "fs";
import os from "os";
import path from "path";

export const G = "grupo@g.us";
export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
export const carta = (s) => ({ v: s.slice(0, -1), p: s.slice(-1) });
// las cartas se reparten con pop(): la primera de la lista sale primero
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

// Crea una base nueva en una carpeta temporal y deja los globales que el bot espera.
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

// Deja el saldo exactamente en n (moverCoins admite negativos; ganarCoins ignora cantidades <= 0).
export function fijarSaldo(F, chat, usuario, n) {
  const diferencia = n - F.getSaldoCoins(chat, usuario);
  if (diferencia !== 0) F.moverCoins(chat, usuario, diferencia, "test_carga");
}
