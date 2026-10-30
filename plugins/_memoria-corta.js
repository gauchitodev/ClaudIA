import { recordarMensaje, olvidarMensaje, editarMensaje, esComando } from "../lib/contexto-chat.js";
import { conNombres } from "../lib/menciones.js";

// Claudia's short-term memory (lib/contexto-chat.js), what her chat, her glances and .resumen read: each message as it
// comes, right after the moderation (hooksEnOrden, load-functions.js). Her chat hook used to write it, and that one
// goes last: a message got there only after every hook before it was done, sends included, and a send waits its turn
// (lib/ritmo.js). A "#vendo" waited for its confirmation, and the question about it that came a second later got there
// first and was answered without it.
const plugin = (m) => m;
plugin.trasModeracion = true;

// The text of a message's content: what an edit leaves. With its mentions as names ("@Ana"), like every text she keeps:
// a mention travels as the digits of a LID, which only the admins get to see (.id), and she'd repeat them. And whether
// it's a command, told by the text as typed (fueComando, lib/contexto-chat.js).
const textoDe = (contenido) => {
  const texto = contenido?.conversation || Object.values(contenido || {}).map((v) => v?.text ?? v?.caption).find((t) => typeof t === "string") || "";
  return { texto: conNombres(texto, Object.values(contenido || {}).map((v) => v?.contextInfo?.mentionedJid).find(Array.isArray)), comando: esComando(texto) };
};

plugin.before = async (m, { user }) => {
  try {
    // A deleted message leaves the memory: Claudia shouldn't quote it, react to it or summarize it. An edited one stays
    // as it was left. Before the check of her own messages, because a deletion made from Claudia's phone is one of hers
    // too; the ones the bot sends never come back here (handle-message drops its own echoes), so lib/envios.js forgets
    // those as they go out. An edit can come wrapped in editedMessage.
    const protocolo = m.message?.protocolMessage || m.message?.editedMessage?.message?.protocolMessage;
    if (protocolo?.type === 0) return void olvidarMensaje(m.chat, protocolo.key?.id);
    if (protocolo?.type === 14) {
      const { texto, comando } = textoDe(protocolo.editedMessage);
      // Its author by any of their ids: an edit may come without the LID the message came with,
      // or the other way around.
      return void editarMensaje(m.chat, protocolo.key?.id, texto, [m.sender, m.senderJid, m.key?.participant], { comando });
    }
    if (m.fromMe || m.isBaileys) return;
    // What the moderation just deleted (the anti-links, the blacklist and the mass mentions mark it) never existed for
    // her: she used to keep it for .resumen and the initiative.
    if (m.moderado) return;
    // A reaction arrives as a message whose text is the emoji: it isn't something anyone said. A voice note has no
    // text: when it's for her, her chat writes down what it said once she has heard it (plugins/_auto-ia.js).
    if (m.mtype === "reactionMessage" || !m.text) return;
    // Every message with text, commands included, with what a glance of the initiative needs to react to it or quote it
    // later (lib/vistazos.js).
    // Without a name, "alguien": the digits of their id would be their LID, which only the admins see (.id).
    const nombre = user?.apodo || m.pushName || user?.pushName || "alguien";
    recordarMensaje(m.chat, nombre, conNombres(m.text, m.mentionedJid), false, { id: m.id ?? m.key?.id, usuario: m.sender, participant: m.key?.participant, comando: esComando(m.text) });
  } catch (e) {
    console.error("[memoria corta] ERROR:", e);
  }
};

export default plugin;
