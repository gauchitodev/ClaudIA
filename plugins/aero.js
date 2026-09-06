import { textoMetar, textoTaf, textoMenuAero, textoSigmet, textoSolDe } from "../lib/aero.js";
import { textoCruzado, textoReciproco, textoFactorCarga } from "../lib/aero-calculos.js";
import { textoReloj, textoDtg } from "../lib/aero-reloj.js";

const plugin = {};
plugin.cmd = ["metar", "taf", "sigmet", "cruzado", "reciproco", "recíproco", "opuesto", "factorcarga", "factordecarga", "sol", "zulu", "reloj", "utc", "dtg", "menuaero", "aero"];

// .metar [ICAO o nombre ...] · .taf [ICAO o nombre ...] · .sigmet · .cruzado <pista> <viento> · .reciproco <rumbo o pista> · .factorcarga <ángulo> [Vs] · .sol [ciudad] · .zulu · .dtg · .menuaero
plugin.run = async (m, { client, command, text }) => {
  if (command === "menuaero" || command === "aero") return client.sendText(m.chat, textoMenuAero(), m);
  if (command === "cruzado") return client.sendText(m.chat, textoCruzado(text), m);
  if (command === "reciproco" || command === "recíproco" || command === "opuesto") return client.sendText(m.chat, textoReciproco(text), m);
  if (command === "factorcarga" || command === "factordecarga") return client.sendText(m.chat, textoFactorCarga(text), m);
  if (command === "dtg") return client.sendText(m.chat, textoDtg(), m);
  if (command === "zulu" || command === "reloj" || command === "utc") return client.sendText(m.chat, textoReloj(), m);
  await client.sendPresenceUpdate?.("composing", m.chat);
  const respuesta = command === "taf" ? await textoTaf(text) : command === "sigmet" ? await textoSigmet() : command === "sol" ? await textoSolDe(text) : await textoMetar(text);
  return client.sendText(m.chat, respuesta, m);
};

export default plugin;
