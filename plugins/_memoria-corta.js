import { aplicarAMemoria } from "../lib/memoria-corta.js";

// Claudia's short-term memory (lib/contexto-chat.js), what her chat, her glances and .resumen read: each message as it
// comes, right after the moderation (hooksEnOrden, load-functions.js). Her chat hook used to write it, and that one
// goes last: a message got there only after every hook before it was done, sends included, and a send waits its turn
// (lib/ritmo.js). A "#vendo" waited for its confirmation, and the question about it that came a second later got there
// first and was answered without it. What a message leaves there is lib/memoria-corta.js's.
const plugin = (m) => m;
plugin.trasModeracion = true;

plugin.before = async (m, { user }) => {
  try {
    // What the moderation just deleted (the anti-links, the blacklist and the mass mentions mark it) never existed for
    // her: she used to keep it for .resumen and the initiative. A deletion or an edit still applies.
    aplicarAMemoria(m, { user, guardar: !m.moderado });
  } catch (e) {
    console.error("[memoria corta] ERROR:", e);
  }
};

export default plugin;
