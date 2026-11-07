import { guardarSticker, mandarStickerAlAzar, mandarSticker, elegirRespuesta, describirPendientes, shaDe, STICKERS, _dep } from "../lib/stickers-grupo.js";
import { esMensajeDeJuego } from "../lib/mensajes-de-juego.js";
import { pausa } from "../lib/pausas.js";
import { estadoDe } from "../lib/estado-de-plugins.js";

// Claudia's pace in each chat, shared with plugins/_auto-ia.js and lib/vistazos.js: she doesn't answer a sticker right
// after saying something.
const ritmoDeClaudia = estadoDe("ia-ultima-respuesta", () => new Map());

// Every sticker people send in a group is kept for it (lib/stickers-grupo.js), and a sticker that answers one of
// Claudia's messages sometimes gets one back: the one the AI picks for what she had said and what she got, or none if
// nothing fits; at random only when the AI can't choose. .respuestastickers off stops the answers (they're still kept). A sticker the moderation deleted (a muted person, the blacklist) never
// gets here (handle-message.js). The hooks run one after the other, so the download, the pause and the send go on
// their own: waited here, they held up every hook behind this one, and the command, for seconds.
const ultimaRespuesta = new Map(); // chat -> when she last answered a sticker with one

// Whether a sticker answering her gets one back: her chat on, nothing closing the door (the same ones as
// plugins/_auto-ia.js), not too soon, and not always.
export function contestaConSticker(m, { user, chat, isMod, isOwner }, ahora = Date.now()) {
  if (!m.quoted?.fromMe || esMensajeDeJuego(m.quoted.id)) return false;
  if (chat?.charla === 0 || chat?.stickersAuto === 0) return false;
  if (!isOwner && (chat?.isBanned || user?.banned || (chat?.adminMode && !isMod))) return false;
  if (ahora - (ultimaRespuesta.get(m.chat) || 0) < STICKERS.RESPUESTA_PAUSA_MS) return false;
  if (ahora - (ritmoDeClaudia.get(m.chat) || 0) < 20 * 1000) return false; // she just said something
  return _dep.random() < STICKERS.RESPUESTA_PROBABILIDAD;
}

async function atender(m, client, contestar) {
  const buffer = await m.download?.().catch(() => null);
  if (buffer && guardarSticker(m.chat, m.sender, buffer) === "nuevo") describirPendientes();
  // Never the same one she got: without knowing which it was (the download failed), she doesn't answer.
  if (!contestar || !buffer) return;
  const excluir = [shaDe(buffer)];
  const eleccion = await elegirRespuesta(m.chat, { suTexto: m.quoted.text || "", recibido: buffer, excluir });
  if (eleccion && !eleccion.sha) return; // nothing she has fits: better nothing than any old one
  await pausa(1000 + Math.floor(_dep.random() * 2000)); // nobody answers a sticker in the same second
  const enviado = eleccion ? await mandarSticker(client, m.chat, eleccion.sha, m) : await mandarStickerAlAzar(client, m.chat, m, { excluir });
  if (enviado) ritmoDeClaudia.set(m.chat, Date.now());
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
