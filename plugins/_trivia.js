import { responderTrivia } from "../lib/trivia.js";

// Runs on every message: if a trivia is open in the chat (from .trivia or lightning), it reads the answer.
const plugin = (m) => m;
plugin.before = async (m, { client }) => {
  try {
    if (!m.message || m.fromMe || m.isBaileys || !m.text) return;
    if (globalThis.prefix.some((p) => m.text.startsWith(p))) return;
    const r = responderTrivia(m);
    if (!r) return;
    if (r.reaccion) m.react(r.reaccion).catch(() => {});
    // Not awaited: the turn is taken when it's called, so the order holds, and the hooks after this one don't wait.
    if (r.texto) client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m }).catch((e) => console.error("[trivia] ERROR:", e));
  } catch (e) {
    console.error("[trivia] ERROR:", e);
  }
};

export default plugin;
