import strings from "./lib/strings.js";
import fs from "fs";
import toml from "@iarna/toml";

// Load and parse config.toml
let config = {};
try {
  const tomlString = fs.readFileSync("config.toml", "utf8");
  config = toml.parse(tomlString);
} catch (error) {
  console.error("Error al cargar config.toml:", error.message);
}

// Session Name
globalThis.authFile = `botSession`;

// Bot number without "+", spaces or dashes. Leave empty to pair with a QR code.
globalThis.numberBot = config.numberBot || "";
// Extra Gemini keys (geminiApiKeys), from other accounts: each has its own free quota, and lib/gemini.js moves on to the
// next when one runs out. geminiApiKey stays the first one, and the one the rest of the bot checks to know there's AI.
globalThis.geminiApiKeys = [...new Set([config.geminiApiKey, ...(Array.isArray(config.geminiApiKeys) ? config.geminiApiKeys : [])].map((k) => String(k || "").trim()).filter(Boolean))];
globalThis.geminiApiKey = globalThis.geminiApiKeys[0] || "";
globalThis.groqApiKey = config.groqApiKey || "";
globalThis.tenorApiKey = config.tenorApiKey || "";
globalThis.cerebrasApiKey = config.cerebrasApiKey || "";
globalThis.openrouterApiKey = config.openrouterApiKey || "";
globalThis.nvidiaApiKey = config.nvidiaApiKey || "";

// Discord link (.discord and .links) and the text for .faggi
globalThis.discordUrl = config.discordUrl || "";
globalThis.textoFaggi = config.textofaggi || "";

// Bot owner numbers without "+", spaces or dashes
globalThis.owners = config.owners || [""];

// Command prefixes
globalThis.prefix = [".", "/", "@"];

// Bot version: read from package.json so there aren't two different numbers around.
let versionPaquete = "3.0.0";
try {
  versionPaquete = JSON.parse(fs.readFileSync("package.json", "utf8")).version || versionPaquete;
} catch (error) {
  console.error("No se pudo leer la versión de package.json:", error.message);
}
globalThis.botVersion = `v${versionPaquete}`;

// Baileys
globalThis.baileys = "@whiskeysockets/baileys";

// Strings // Texts
globalThis.txt = strings;

// WhatsApp channel for the "forwarded from the channel" tag on files the bot sends.
// In config.toml: a [canal] section with enlace = "https://whatsapp.com/channel/..." and, optionally, nombre = "..."
// to show a different name. main.js asks WhatsApp for the internal channel ID on connect and stores it in globalThis.canal.
globalThis.canalConfig = {
  enlace: config.canal?.enlace || "",
  nombre: config.canal?.nombre || "",
};
if (!globalThis.canal) globalThis.canal = null;

// Link card attached to the files the bot sends (audio, video, image).
// Replaces the fake channel attribution SawBot shipped with, whose ID pointed at the original author's channel.
// Configured under [tarjetaGrupo] in config.toml; without "enlace" files go out with no card.
globalThis.tarjetaGrupo = {
  titulo: config.tarjetaGrupo?.titulo || "ClaudIA :)",
  cuerpo: config.tarjetaGrupo?.cuerpo || "Unite al grupo",
  enlace: config.tarjetaGrupo?.enlace || "",
};
