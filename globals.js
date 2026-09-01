import strings from "./lib/strings.js";
import fs from "fs";
import toml from "@iarna/toml";

// Cargar y parsear config.toml
let config = {};
try {
  const tomlString = fs.readFileSync("config.toml", "utf8");
  config = toml.parse(tomlString);
} catch (error) {
  console.error("Error al cargar config.toml:", error.message);
}

// Session Name
globalThis.authFile = `botSession`;

// Numero del bot sin "+" ni espacios ni guiones. Dejar vacío para vincular con codigo QR.
globalThis.numberBot = config.numberBot || "";
globalThis.geminiApiKey = config.geminiApiKey || "";
globalThis.groqApiKey = config.groqApiKey || "";

// Numeros de owners del bot sin "+" ni espacios ni guiones
globalThis.owners = config.owners || [""];

// Prefijos de comandos
globalThis.prefix = [".", "/", "@"];

// Versión del bot
globalThis.botVersion = "v2.0";

// Baileys
globalThis.baileys = "@whiskeysockets/baileys";

// Strings // Texts
globalThis.txt = strings;

// Newsletters IDs
globalThis.newsletterJids = ["120363386229166956@newsletter"];
// Newsletters names
globalThis.newsletterNames = ["HOLAAAAAA🫩"];

// Jid grupo URU
globalThis.jidUru = "120363404278828828@g.us";

// Fake quoted fkontak
globalThis.fkontak = { key: { participants: "0@s.whatsapp.net", remoteJid: "status@broadcast", fromMe: false, id: "Halo" }, message: { contactMessage: { vcard: `BEGIN:VCARD\nVERSION:3.0\nN:Sy;Bot;;;\nFN:y\nitem1.TEL;waid=\${m.sender.split("@")[0]}:\${m.sender.split("@")[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD` } }, participant: "0@s.whatsapp.net" };

// delirius api
globalThis.deliriusApi = "https://api.delirius.store";
