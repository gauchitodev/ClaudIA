import { leerMensaje } from "../lib/espias.js";

// The secret missions (lib/espias.js): every group message is read for the open mission's word, and for nothing else.
// It takes nothing from the message and marks nothing on it: the games, the counters and Claudia's chat get it as
// they always did. With no mission open in the group, which is nearly always, it's one indexed query.
const plugin = (m) => m;
plugin.before = async (m, { client }) => {
  try {
    if (!m.isGroup || !m.message || m.fromMe || m.isBaileys || !m.text) return;
    const r = leerMensaje(m.chat, [m.sender, m.senderJid].filter(Boolean), m.text);
    if (!r) return;
    // Not awaited: it waits its turn to go out (lib/envios.js), and the hooks after this one shouldn't wait with it.
    client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m }).catch((e) => console.error("[espias] ERROR:", e));
  } catch (e) {
    console.error("[espias] ERROR:", e);
  }
};

export default plugin;
