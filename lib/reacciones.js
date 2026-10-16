// Reaction points (main.js, messages.reaction): "received" for whoever wrote the message, "given" for whoever reacted,
// their UruCoins and the hashtag vote (lib/urucoins.js).
import { sumarInteraccion } from "../database-functions.js";
import { mesDe } from "./hashtags.js";
import { otorgarPorReaccion } from "./urucoins.js";
import { registrarReaccionAClaudia } from "./iniciativa.js";

// Reactions already counted (message + who reacted), in RAM and capped, so the same one is never counted twice.
const reaccionesContadas = new Map();
const MAX_REACCIONES_RECORDADAS = 5000;
function marcarReaccionContada(messageId, reactorLid) {
  const clave = `${messageId}|${reactorLid}`;
  if (reaccionesContadas.has(clave)) return false;
  reaccionesContadas.set(clave, Date.now());
  if (reaccionesContadas.size > MAX_REACCIONES_RECORDADAS) reaccionesContadas.delete(reaccionesContadas.keys().next().value);
  return true;
}

export function contarReaccion(client, { key, reaction }) {
  if (!key?.remoteJid?.endsWith("@g.us")) return;
  if (!reaction?.text) return;

  const autorLid = key.participant;
  const reactorLid = reaction.key?.participant;
  if (!autorLid || !reactorLid) return;
  if (autorLid === reactorLid) return;
  // The bot's own reactions (🕐 on downloads, 🔥 for streaks, 🪙 for the daily question) hand out no coins or ranking.
  if (reaction.key?.fromMe || reactorLid === client.user?.lid) return;
  // Removing and re-adding a reaction (or changing the emoji) fires the event again: without this it piled up
  // ranking, UruCoins and hashtag votes without limit.
  if (!marcarReaccionContada(key.id, reactorLid)) return;

  // A reaction to one of Claudia's messages is an answer to her (lib/iniciativa.js); Baileys sets fromMe on the key
  // when the reacted message is the bot's. Whoever reacted gets their "given" as always, but she collects nothing: she
  // earned UruCoins and a "received" point for each one, and could end up in .baltop and as the month's most voted.
  const aClaudia = key.fromMe || autorLid === client.user?.lid || autorLid === client.user?.jid;
  if (aClaudia) registrarReaccionAClaudia(key.remoteJid, key.id);

  const mes = mesDe();
  if (!aClaudia) sumarInteraccion(mes, key.remoteJid, autorLid, "recibidas");
  sumarInteraccion(mes, key.remoteJid, reactorLid, "emitidas");
  otorgarPorReaccion(key.remoteJid, aClaudia ? null : autorLid, reactorLid, key.id);
}
