import { preguntarGemini } from "../lib/gemini.js";
import { sinMenciones, conNombres } from "../lib/menciones.js";

// One question at a time per chat: each one is a request to the models Claudia chats with, and .ia over and over spent
// the quota of the whole bot. It counts from the question, answered or not.
const ESPERA_MS = 20 * 1000;
if (!globalThis.esperaIa) globalThis.esperaIa = new Map(); // chat -> when she was last asked

// The bot's number used to be one of the commands too, so "@Claudia ..." came here and got an answer without the
// group's context. Mentioning her is now talking to her: plugins/_auto-ia.js answers it, like naming her.
const plugin = {};
plugin.cmd = ["gemini", "ia", "bot"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text }) => {
  if (!text) return client.sendText(m.chat, txt.iaPeticion, m);

  if (!globalThis.geminiApiKey) {
    return client.sendText(m.chat, "Falta configurar la API key de Gemini en config.toml (geminiApiKey).", m);
  }

  const ahora = Date.now();
  const falta = (globalThis.esperaIa.get(m.chat) || 0) + ESPERA_MS - ahora;
  if (falta > 0) return client.sendText(m.chat, `Recién me preguntaron algo; probá de nuevo en ${Math.ceil(falta / 1000)} s.`, m);
  globalThis.esperaIa.set(m.chat, ahora);

  await client.sendPresenceUpdate("composing", m.chat).catch(() => {}); // a nicety: a failure there mustn't end the command

  // The mentions as names: a mention travels as the digits of a LID, and the answer would repeat them.
  const respuesta = await preguntarGemini(conNombres(text, m.mentionedJid));
  if (respuesta.ok) {
    return client.sendText(m.chat, sinMenciones(respuesta.texto), m);
  } else if (respuesta.porHoy) {
    return client.sendText(m.chat, "Se me acabó la cuota gratis de la IA por hoy, probá de nuevo mañana.", m);
  } else {
    return client.sendText(m.chat, "Ta, se me complicó pensar ahora, probá de nuevo en un rato bo.", m);
  }
};

export default plugin;
