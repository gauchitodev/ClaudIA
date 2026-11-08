import fs from "fs";
import toml from "@iarna/toml";

// The bot's settings, in one place: what config.toml says (the bot's number, the AI and Tenor keys, the owners, the
// voice, the channel and the group's card) and the version in package.json. They used to be globals that arranque.js
// put on globalThis and some twenty files read off it: a test had to set up each one a file read, and one it forgot
// was undefined with no complaint.
//
// Nothing is read on import: main.js loads them before anything else (arranque.js calls cargarConfiguracion), and the
// tests, which never read a config.toml nor its keys, set here the ones they need. .addowner changes the owners here
// as well as in config.toml.

// The settings out of a parsed config.toml: without a key, what the bot does with it unset (no AI, no card).
function desde(config) {
  return {
    // Without "+", spaces or dashes. Empty to pair with a QR code.
    numberBot: config.numberBot || "",
    geminiApiKey: config.geminiApiKey || "",
    groqApiKey: config.groqApiKey || "",
    tenorApiKey: config.tenorApiKey || "",
    cerebrasApiKey: config.cerebrasApiKey || "",
    openrouterApiKey: config.openrouterApiKey || "",
    nvidiaApiKey: config.nvidiaApiKey || "",
    // What .faggi answers.
    textoFaggi: config.textofaggi || "",
    // Claudia's voice for the voice notes (.voz) and .tts: the edge-tts voice, rate and pitch (lib/voz.js, [voz]).
    vozConfig: config.voz || {},
    // The owners' numbers, without "+", spaces or dashes.
    owners: config.owners || [""],
    // The WhatsApp channel for the "forwarded from the channel" tag on the files the bot sends: [canal], with enlace =
    // "https://whatsapp.com/channel/..." and, optionally, nombre = "..." to show a name other than its own. main.js
    // asks WhatsApp for the channel's ID on connect and keeps it in lib/conexion.js (canal).
    canalConfig: { enlace: config.canal?.enlace || "", nombre: config.canal?.nombre || "" },
    // The link card attached to the files the bot sends (audio, video, image), [tarjetaGrupo]: without "enlace" they go
    // out with no card. It replaced the fake channel attribution SawBot shipped with, whose ID was its author's.
    tarjetaGrupo: {
      titulo: config.tarjetaGrupo?.titulo || "ClaudIA :)",
      cuerpo: config.tarjetaGrupo?.cuerpo || "Unite al grupo",
      enlace: config.tarjetaGrupo?.enlace || "",
    },
    // "v" and package.json's version (cargarConfiguracion), so there aren't two different numbers around.
    botVersion: "",
  };
}

export const configuracion = desde({});

// config.toml and package.json, from the folder the bot runs in (where .addowner writes config.toml), into
// configuracion. Without config.toml, or with one that doesn't parse, it says so and the bot runs with nothing set.
export function cargarConfiguracion() {
  let config = {};
  try {
    config = toml.parse(fs.readFileSync("config.toml", "utf8"));
  } catch (error) {
    console.error("Error al cargar config.toml:", error.message);
  }
  let version = "3.0.0";
  try {
    version = JSON.parse(fs.readFileSync("package.json", "utf8")).version || version;
  } catch (error) {
    console.error("No se pudo leer la versión de package.json:", error.message);
  }
  return Object.assign(configuracion, desde(config), { botVersion: `v${version}` });
}
