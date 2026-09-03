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

// Link del Discord (.discord y .links) y texto de .faggi
globalThis.discordUrl = config.discordUrl || "";
globalThis.textoFaggi = config.textofaggi || "";

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

// Canal de WhatsApp para la etiqueta "reenviado desde el canal" en los archivos que manda el bot.
// En config.toml: sección [canal] con enlace = "https://whatsapp.com/channel/..." y, opcional, nombre = "..." para
// mostrar otro nombre. El ID interno del canal lo pide main.js a WhatsApp al conectarse y queda en globalThis.canal.
globalThis.canalConfig = {
  enlace: config.canal?.enlace || "",
  nombre: config.canal?.nombre || "",
};
if (!globalThis.canal) globalThis.canal = null;

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


// delirius api
globalThis.deliriusApi = "https://api.delirius.store";
