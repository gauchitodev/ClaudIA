// What a message leaves in Claudia's short-term memory (lib/contexto-chat.js): plugins/_memoria-corta.js for each one
// as it comes, and handle-message.js for the ones that came late (sent while the bot was down), which no hook sees.
import { recordarMensaje, olvidarMensaje, editarMensaje, esComando } from "./contexto-chat.js";
import { conNombres } from "./menciones.js";
import { enviadoEn } from "./tiempo.js";
import { tieneEnlace } from "./enlaces.js";
import { idsDe } from "./identidad.js";
import { textoDeContenido } from "./ediciones.js";
import { getUser, isBlacklisted } from "../database-functions.js";

// When a message was sent, which is where it goes in the memory: what arrives late lands where it was said. Never ahead
// of the tablet's clock, which the server's may be.
export const fechaDe = (m, ahora = Date.now()) => Math.min(enviadoEn(m) || ahora, ahora);

// The text of a message's content: what an edit leaves. With its mentions as names ("@Ana"), like every text she keeps:
// a mention travels as the digits of a LID, which only the admins get to see (.id), and she'd repeat them. And whether
// it's a command, told by the text as typed (fueComando, lib/contexto-chat.js).
const textoDe = (contenido) => {
  const texto = textoDeContenido(contenido);
  return { texto: conNombres(texto, Object.values(contenido || {}).map((v) => v?.contextInfo?.mentionedJid).find(Array.isArray)), comando: esComando(texto) };
};

// A message into the memory: a deletion forgets, an edit leaves the text as it was left, and anything else with text is
// stored ("guardar" false applies only the first two). Returns "olvidado", "editado", "guardado" or null.
export function aplicarAMemoria(m, { user = null, guardar = true } = {}) {
  // A deleted message leaves the memory: Claudia shouldn't quote it, react to it or summarize it. An edited one stays
  // as it was left. Before the check of her own messages, because a deletion made from Claudia's phone is one of hers
  // too; the ones the bot sends never come back here (handle-message drops its own echoes), so lib/envios.js forgets
  // those as they go out. An edit can come wrapped in editedMessage.
  const protocolo = m.message?.protocolMessage || m.message?.editedMessage?.message?.protocolMessage;
  if (protocolo?.type === 0) return olvidarMensaje(m.chat, protocolo.key?.id) ? "olvidado" : null;
  if (protocolo?.type === 14) {
    const { texto, comando } = textoDe(protocolo.editedMessage);
    // Its author by any of their ids: an edit may come without the LID the message came with, or the other way around.
    return editarMensaje(m.chat, protocolo.key?.id, texto, [m.sender, m.senderJid, m.key?.participant], { comando }) ? "editado" : null;
  }
  if (!guardar || m.fromMe || m.isBaileys) return null;
  // A reaction arrives as a message whose text is the emoji: it isn't something anyone said. A voice note has no text:
  // when it's for her, her chat writes down what it said once she has heard it (plugins/_auto-ia.js).
  if (m.mtype === "reactionMessage" || !m.text) return null;
  // Every message with text, commands included, with what a glance of the initiative needs to react to it or quote it
  // later (lib/vistazos.js). Without a name, "alguien": the digits of their id would be their LID, which only the
  // admins see (.id).
  const nombre = user?.apodo || m.pushName || user?.pushName || "alguien";
  const guardado = recordarMensaje(m.chat, nombre, conNombres(m.text, m.mentionedJid), false, { id: m.id ?? m.key?.id, usuario: m.sender, participant: m.key?.participant, comando: esComando(m.text), fecha: fechaDe(m) });
  return guardado ? "guardado" : null;
}

// Whether the moderation would have deleted it, had it come in time: a link of any kind (the anti-links go by group,
// and this keeps out whatever any of them would take), ten mentions or more (plugins/_chatbot-events.js), or an author
// who's muted or on the blacklist. Without writing anything or asking WhatsApp: getUser with the chat writes the
// row's inGroup, and estaEnListaNegra may record a LID and ask WhatsApp about an owner.
export function loHabriaBorrado(m) {
  if (tieneEnlace(m.text)) return true;
  if ((m.mentionedJid?.length || 0) >= 10) return true;
  if (getUser(m.sender)?.inGroup?.[m.chat]?.mute) return true;
  return Boolean(isBlacklisted(idsDe([m.sender, m.senderJid, m.key?.participant], { conSuNumero: true }), m.chat));
}

// A message that came late (sent while the bot was down, handle-message.js): it isn't answered and doesn't run, but in
// a group it's part of what was said, so it goes into the memory where it was said, unless the moderation, which never
// sees it, would have deleted it: then it stays where it is, and out of .resumen too. A deletion or an edit from back
// then applies all the same, in any chat: once the memory outlives restarts (lib/relevo-memoria.js), what was taken
// back while the bot was down would stay otherwise.
export function guardarAtrasado(m) {
  try {
    if (!m || m.isBaileys || !m.sender) return null;
    if (m.message?.protocolMessage || m.message?.editedMessage) return aplicarAMemoria(m, { guardar: false });
    if (!m.isGroup || !m.text || loHabriaBorrado(m)) return null;
    return aplicarAMemoria(m, { user: getUser(m.sender) });
  } catch (e) {
    console.error("[memoria corta] ERROR:", e);
    return null;
  }
}
