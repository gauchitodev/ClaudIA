import fs from "fs";
import toml from "@iarna/toml";

// The bot's clock is Uruguay's unless the environment sets TZ: the daily rounds, the trivia window, the birthdays and
// the weekly and monthly closings all go by the process's time zone, and nothing used to set it, so it was whatever
// the tablet's environment handed Node. Setting it at runtime resets Node's time zone cache (since v13).
process.env.TZ ||= "America/Montevideo";

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
globalThis.geminiApiKey = config.geminiApiKey || "";
globalThis.groqApiKey = config.groqApiKey || "";
globalThis.tenorApiKey = config.tenorApiKey || "";
globalThis.cerebrasApiKey = config.cerebrasApiKey || "";
globalThis.openrouterApiKey = config.openrouterApiKey || "";
globalThis.nvidiaApiKey = config.nvidiaApiKey || "";

// Discord link (.discord and .links) and the text for .faggi
globalThis.textoFaggi = config.textofaggi || "";

// Claudia's voice for the voice notes (.voz) and .tts: the edge-tts voice, rate and pitch (lib/voz.js; [voz] in
// config.toml).
globalThis.vozConfig = config.voz || {};

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

// The bot's texts are imported from lib/strings.js wherever they're used: as a global (txt), 91 files depended on this
// file having run first, and every test had to set it up before anything else.

// WhatsApp channel for the "forwarded from the channel" tag on files the bot sends.
// In config.toml: a [canal] section with enlace = "https://whatsapp.com/channel/..." and, optionally, nombre = "..."
// to show a different name. main.js asks WhatsApp for the internal channel ID on connect and stores it
// in globalThis.canal.
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
