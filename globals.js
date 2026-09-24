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
// Las API keys pueden setearse por variable de entorno (recomendado para no guardarlas en texto plano);
// si no está la variable, se usa el valor de config.toml.
globalThis.geminiApiKey = process.env.GEMINI_API_KEY || config.geminiApiKey || "";
globalThis.groqApiKey = process.env.GROQ_API_KEY || config.groqApiKey || "";
globalThis.tenorApiKey = process.env.TENOR_API_KEY || config.tenorApiKey || "";
globalThis.cerebrasApiKey = process.env.CEREBRAS_API_KEY || config.cerebrasApiKey || "";
globalThis.openrouterApiKey = process.env.OPENROUTER_API_KEY || config.openrouterApiKey || "";
globalThis.nvidiaApiKey = process.env.NVIDIA_API_KEY || config.nvidiaApiKey || "";

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
