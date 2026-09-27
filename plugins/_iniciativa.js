import { registrarMensajeDelGrupo } from "../lib/iniciativa.js";
import { anotarMensaje } from "../lib/vistazos.js";
import { esComando } from "../lib/contexto-chat.js";

// Claudia's initiative (lib/iniciativa.js), on every message of a group that has it on: it counts the message for the
// bursts that bring her next glance forward, and checks whether it answers her. It never
// sends anything, so it never holds up the hooks that come after it.
const plugin = (m) => m;
plugin.before = async (m, { chat }) => {
  try {
    if (!m.isGroup || !m.message || m.fromMe || m.isBaileys) return;
    if (chat?.iniciativa !== 1) return;
    // Reactions are counted in main.js (messages.reaction); a deleted message isn't a new one.
    if (m.mtype === "reactionMessage" || m.mtype === "protocolMessage") return;
    if (m.text && esComando(m.text)) return;
    const ahora = m._llegada || Date.now();
    anotarMensaje(m.chat, ahora);
    registrarMensajeDelGrupo(m, ahora);
  } catch (e) {
    console.error("[iniciativa] ERROR:", e);
  }
};

export default plugin;
