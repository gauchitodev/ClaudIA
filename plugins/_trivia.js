import { responderTrivia } from "../lib/trivia.js";
import { esComando } from "../lib/comandos.js";

// Runs on every message: if a trivia is open in the chat (from .trivia or lightning), it reads the answer.
const plugin = (m) => m;
plugin.before = async (m, { client }) => {
  try {
    if (!m.message || m.fromMe || m.isBaileys || !m.text) return;
    // A command isn't an answer, told the dispatcher's way (lib/comandos.js): "@Ana c" is someone answering.
    if (esComando(m.text)) return;
    // One message, one game: a move or a letter a game played with plain messages took first (a "7" of the 4 en línea,
    // an "a" of the hangman) isn't an answer. To answer the trivia meanwhile, it's quoted.
    if (m.respuestaDeJuego) return;
    const r = responderTrivia(m);
    if (!r) return;
    // An answer, even one that names her ("c, claudia"): Claudia's chat, which runs after this hook, leaves it alone.
    m.respuestaDeJuego = true;
    if (r.reaccion) m.react(r.reaccion).catch(() => {});
    // Not awaited: the turn is taken when it's called, so the order holds, and the hooks after this one don't wait.
    if (r.texto) client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m }).catch((e) => console.error("[trivia] ERROR:", e));
  } catch (e) {
    console.error("[trivia] ERROR:", e);
  }
};

export default plugin;
