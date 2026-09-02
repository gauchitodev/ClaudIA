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
globalThis.tenorApiKey = config.tenorApiKey || "";
globalThis.openWeatherApiKey = config.openWeatherApiKey || "";
globalThis.cerebrasApiKey = config.cerebrasApiKey || "";

// Numeros de owners del bot sin "+" ni espacios ni guiones
globalThis.owners = config.owners || [""];

// Prefijos de comandos
globalThis.prefix = [".", "/", "@"];

// Versión del bot: se lee de package.json para que no queden dos números distintos.
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

// Tarjeta con link que acompaña a los archivos que manda el bot (audio, video, imagen).
// Reemplaza a la atribución falsa a un canal que traía SawBot, cuyo ID apuntaba al canal del autor original.
// Se configura en la sección [tarjetaGrupo] de config.toml; sin "enlace" los archivos salen sin tarjeta.
globalThis.tarjetaGrupo = {
  titulo: config.tarjetaGrupo?.titulo || "ClaudIA :)",
  cuerpo: config.tarjetaGrupo?.cuerpo || "Unite al grupo",
  enlace: config.tarjetaGrupo?.enlace || "",
};

// Jid grupo URU
globalThis.jidUru = "120363404278828828@g.us";

// Fake quoted fkontak
globalThis.fkontak = { key: { participants: "0@s.whatsapp.net", remoteJid: "status@broadcast", fromMe: false, id: "Halo" }, message: { contactMessage: { vcard: `BEGIN:VCARD\nVERSION:3.0\nN:Sy;Bot;;;\nFN:y\nitem1.TEL;waid=\${m.sender.split("@")[0]}:\${m.sender.split("@")[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD` } }, participant: "0@s.whatsapp.net" };

// delirius api
globalThis.deliriusApi = "https://api.delirius.store";
