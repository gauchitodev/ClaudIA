import { sumarMensajeHora } from "../database-functions.js";
import { claveDia } from "../lib/actividad.js";

// Counts every message the group sends, by hour. Its own hook and not part of _actividad.js because that one only
// counts conversation (no commands, at least two words) for the streak; here a command, a sticker or a "jaja" are all
// messages. Group notices (someone joined, was promoted) arrive without m.message and don't count as anyone's message.
const plugin = (m) => m;
plugin.before = async (m) => {
  try {
    if (!m.isGroup || !m.message || m.fromMe || m.isBaileys) return;
    sumarMensajeHora(m.chat, claveDia(), new Date().getHours());
  } catch (e) {
    console.error("[actividad horaria] ERROR:", e);
  }
};

export default plugin;
