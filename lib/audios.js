// Audios Claudia listens to: a voice note that answers one of her messages, or an audio someone quotes while naming
// her ("claudia, ¿qué opinás de esto?"). Nobody else's audios: she doesn't listen to the whole group.
// Only Gemini hears them (lib/gemini.js); the fallback models get told the audio stayed behind (lib/ia.js).
import { toPTT } from "./ffmpeg.js";

// A song is a few minutes; anything longer is a podcast or a recording nobody expects her to hear whole.
export const MAX_SEGUNDOS = 10 * 60;
// Gemini takes up to 20 MB per request, and base64 adds a third on top.
export const MAX_BYTES = 12 * 1024 * 1024;

// What Gemini accepts as is. The rest (WhatsApp's m4a, YouTube's audio/mp4) goes through ffmpeg to ogg first.
const ACEPTADOS = new Map([
  ["audio/ogg", "audio/ogg"],
  ["audio/opus", "audio/ogg"],
  ["audio/mp3", "audio/mp3"],
  ["audio/mpeg", "audio/mp3"],
  ["audio/wav", "audio/wav"],
  ["audio/x-wav", "audio/wav"],
  ["audio/aac", "audio/aac"],
  ["audio/flac", "audio/flac"],
  ["audio/aiff", "audio/aiff"],
]);

export const esAudio = (msg) => Boolean(msg) && (msg.mtype === "audioMessage" || msg.mediaType === "audioMessage");

// "audio/ogg; codecs=opus" → "audio/ogg". null when Gemini doesn't take it as is.
export function mimeParaGemini(mimetype) {
  const base = String(mimetype || "").split(";")[0].trim().toLowerCase();
  return ACEPTADOS.get(base) || null;
}

// The audio ready to attach: { ok: true, adjunto: { mimeType, datos } }, or { ok: false, motivo } with motivo
// "largo" (too long or too heavy to send) or "error" (it couldn't be downloaded or converted).
// msg is a message or a quoted one, as lib/wa-socket.js builds them: seconds, fileLength, mimetype and download().
export async function audioParaIA(msg, { convertir = toPTT } = {}) {
  if (Number(msg?.seconds) > MAX_SEGUNDOS || Number(msg?.fileLength) > MAX_BYTES) return { ok: false, motivo: "largo" };
  try {
    let buffer = await msg.download();
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return { ok: false, motivo: "error" };
    let mimeType = mimeParaGemini(msg.mimetype);
    if (!mimeType) {
      const convertido = await convertir(buffer, "m4a");
      buffer = convertido.data;
      await Promise.resolve(convertido.delete?.()).catch(() => {});
      mimeType = "audio/ogg";
    }
    if (buffer.length > MAX_BYTES) return { ok: false, motivo: "largo" };
    return { ok: true, adjunto: { mimeType, datos: buffer.toString("base64") } };
  } catch (e) {
    console.error("[audios] no se pudo preparar el audio:", e?.message || e);
    return { ok: false, motivo: "error" };
  }
}

// The songs .play sent, by message id: when someone quotes one and asks about it, Claudia already knows which song it
// is and doesn't need to hear it. In memory, with a cap: after a restart she just listens to it instead.
const enviados = new Map();
const MAX_ENVIADOS = 300;

export function recordarAudioEnviado(id, titulo) {
  if (!id || !titulo) return;
  enviados.set(id, String(titulo));
  if (enviados.size > MAX_ENVIADOS) enviados.delete(enviados.keys().next().value);
}

export const tituloDeAudioEnviado = (id) => (id && enviados.get(id)) || null;
