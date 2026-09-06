import { responderTrivia } from "../lib/trivia.js";

// Corre en cada mensaje: si hay una trivia abierta en el chat (de .trivia o relámpago), lee la respuesta.
const plugin = (m) => m;
plugin.before = async (m, { client }) => {
  try {
    if (!m.message || m.fromMe || m.isBaileys || !m.text) return;
    if (globalThis.prefix.some((p) => m.text.startsWith(p))) return;
    const r = responderTrivia(m);
    if (!r) return;
    if (r.reaccion) m.react(r.reaccion).catch(() => {});
    if (r.texto) await client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m });
  } catch (e) {
    console.error("[trivia] ERROR:", e);
  }
};

export default plugin;
