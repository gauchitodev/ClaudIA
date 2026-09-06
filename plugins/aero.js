import { textoMetar, textoTaf, textoMenuAero, textoSigmet, textoSolDe } from "../lib/aero.js";
import { textoCruzado } from "../lib/aero-calculos.js";

let plugin = {};
plugin.cmd = ["metar", "taf", "sigmet", "cruzado", "sol", "menuaero", "aero"];

// .metar [ICAO o nombre ...] · .taf [ICAO o nombre ...] · .sigmet · .cruzado <pista> <viento> · .sol [ciudad] · .menuaero
plugin.run = async (m, { client, command, text }) => {
  if (command === "menuaero" || command === "aero") return client.sendText(m.chat, textoMenuAero(), m);
  if (command === "cruzado") return client.sendText(m.chat, textoCruzado(text), m);
  await client.sendPresenceUpdate?.("composing", m.chat);
  const respuesta = command === "taf" ? await textoTaf(text) : command === "sigmet" ? await textoSigmet() : command === "sol" ? await textoSolDe(text) : await textoMetar(text);
  return client.sendText(m.chat, respuesta, m);
};

export default plugin;
