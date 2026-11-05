import { guardarSticker, mandarStickerAlAzar, shaDe, STICKERS, _dep } from "../lib/stickers-grupo.js";
import { esMensajeDeJuego } from "../lib/mensajes-de-juego.js";
import { pausa } from "../lib/pausas.js";

// Every sticker people send in a group is kept for it (lib/stickers-grupo.js), and a sticker that answers one of
// Claudia's messages sometimes gets one back. A sticker the moderation deleted (a muted person, the blacklist) never
// gets here (handle-message.js). The hooks run one after the other, so the download, the pause and the send go on
// their own: waited here, they held up every hook behind this one, and the command, for seconds.
const ultimaRespuesta = new Map(); // chat -> when she last answered a sticker with one

// Whether a sticker answering her gets one back: her chat on, nothing closing the door (the same ones as
// plugins/_auto-ia.js), not too soon, and not always.
export function contestaConSticker(m, { user, chat, isMod, isOwner }, ahora = Date.now()) {
  if (!m.quoted?.fromMe || esMensajeDeJuego(m.quoted.id)) return false;
  if (chat?.charla === 0) return false;
  if (!isOwner && (chat?.isBanned || user?.banned || (chat?.adminMode && !isMod))) return false;
  if (ahora - (ultimaRespuesta.get(m.chat) || 0) < STICKERS.RESPUESTA_PAUSA_MS) return false;
  if (ahora - (globalThis.autoIaCooldown?.get(m.chat) || 0) < 20 * 1000) return false; // she just said something
  return _dep.random() < STICKERS.RESPUESTA_PROBABILIDAD;
}

async function atender(m, client, contestar) {
  const buffer = await m.download?.().catch(() => null);
  if (buffer) guardarSticker(m.chat, m.sender, buffer);
  // Never the same one she got: without knowing which it was (the download failed), she doesn't answer.
  if (!contestar || !buffer) return;
  await pausa(1500 + Math.floor(_dep.random() * 2500)); // nobody answers a sticker in the same second
  if (await mandarStickerAlAzar(client, m.chat, m, { excluir: [shaDe(buffer)] })) globalThis.autoIaCooldown?.set(m.chat, Date.now());
}

const plugin = (m) => m;
plugin.before = async (m, permisos) => {
  if (!m.isGroup || m.fromMe || m.isBaileys || m.mtype !== "stickerMessage") return;
  if (Number(m.msg?.fileLength || 0) > STICKERS.MAX_BYTES) return;
  const contestar = contestaConSticker(m, permisos);
  if (contestar) ultimaRespuesta.set(m.chat, Date.now());
  plugin.enCurso = atender(m, permisos.client, contestar).catch((e) => console.error("[stickers del grupo] ERROR:", e));
};

export default plugin;
