import { textoMetar, textoTaf, textoMenuAero } from "../lib/aero.js";

let plugin = {};
plugin.cmd = ["metar", "taf", "menuaero", "aero"];

// .metar [ICAO o nombre ...] · .taf [ICAO o nombre ...] · .menuaero
plugin.run = async (m, { client, command, text }) => {
  if (command === "menuaero" || command === "aero") return client.sendText(m.chat, textoMenuAero(), m);
  await client.sendPresenceUpdate?.("composing", m.chat);
  const respuesta = command === "taf" ? await textoTaf(text) : await textoMetar(text);
  return client.sendText(m.chat, respuesta, m);
};

export default plugin;
