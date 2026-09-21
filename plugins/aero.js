import { textoMetar, textoTaf, textoMenuAero, textoSigmet, textoSolDe } from "../lib/aero.js";
import { textoCruzado, textoReciproco, textoFactorCarga } from "../lib/aero-calculos.js";
import { textoReloj, textoDtg } from "../lib/aero-reloj.js";
import { textoClaro } from "../lib/claros.js";

const plugin = {};
plugin.cmd = ["metar", "taf", "sigmet", "claro", "claros", "cruzado", "reciproco", "recíproco", "opuesto", "factorcarga", "factordecarga", "sol", "zulu", "reloj", "utc", "dtg", "menuaero", "aero"];

// .metar [ICAO or name ...] · .taf [ICAO or name ...] · .sigmet · .claro [actualizar] [city] · .cruzado <runway> <wind> · .reciproco <heading or runway> · .factorcarga <angle> [Vs] · .sol [city] · .zulu · .dtg · .menuaero
plugin.run = async (m, { client, command, text }) => {
  if (command === "menuaero" || command === "aero") return client.sendText(m.chat, textoMenuAero(), m);
  if (command === "cruzado") return client.sendText(m.chat, textoCruzado(text), m);
  if (command === "reciproco" || command === "recíproco" || command === "opuesto") return client.sendText(m.chat, textoReciproco(text), m);
  if (command === "factorcarga" || command === "factordecarga") return client.sendText(m.chat, textoFactorCarga(text), m);
  if (command === "dtg") return client.sendText(m.chat, textoDtg(), m);
  if (command === "zulu" || command === "reloj" || command === "utc") return client.sendText(m.chat, textoReloj(), m);
  await client.sendPresenceUpdate?.("composing", m.chat);
  const respuesta = command === "claro" || command === "claros" ? await textoClaro(text) : command === "taf" ? await textoTaf(text) : command === "sigmet" ? await textoSigmet() : command === "sol" ? await textoSolDe(text) : await textoMetar(text);
  return client.sendText(m.chat, respuesta, m);
};

export default plugin;
