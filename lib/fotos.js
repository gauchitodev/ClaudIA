// Photos Claudia looks at: one sent to her (with a caption that names her, or answering a message of hers), or one
// someone quotes while talking to her ("claudia, ¿qué es esto?"). Nobody else's: she doesn't look at the group's
// photos. Never one sent to be seen once, whoever quotes it. One per answer, and it's kept nowhere: it goes from
// WhatsApp to the request, in memory. Of what she saw, a line stays in her short-term memory, inside the photo's mark
// (lib/adjuntos.js), as what a voice note said stays (plugins/_auto-ia.js).
// Only Gemini sees them (lib/gemini.js); the fallback models get told the photo stayed behind (lib/ia.js).
import { esVistaUnica, esVistaUnicaRecibida } from "./vista-unica.js";
import { conLoVisto } from "./adjuntos.js";
import { mensajeEnMemoria, editarMensaje } from "./contexto-chat.js";

export const FOTOS = {
  // Gemini takes up to 20 MB per request, and base64 adds a third on top (Google's docs, checked via Context7). A
  // photo as WhatsApp sends it is a few hundred KB, a few MB in HD: this is for what isn't one.
  MAX_BYTES: 8 * 1024 * 1024,
};

// What Gemini accepts as an image (same docs). WhatsApp sends its photos as JPEG.
const ACEPTADOS = new Map([
  ["image/jpeg", "image/jpeg"],
  ["image/jpg", "image/jpeg"],
  ["image/png", "image/png"],
  ["image/webp", "image/webp"],
  ["image/heic", "image/heic"],
  ["image/heif", "image/heif"],
]);

// A message or a quoted one, as lib/wa-socket.js builds them. A sticker isn't one, nor a photo sent as a file.
export const esFoto = (msg) => Boolean(msg) && (msg.mtype === "imageMessage" || msg.mediaType === "imageMessage");

// Where to get it from: its type and its size as the message tells them, and how to download it. Out of the wrapper,
// if the photo came in one (mediaMessage, lib/wa-socket.js).
const origenDe = (msg, contenido) => {
  const foto = msg.mediaMessage?.imageMessage || contenido;
  return { mimetype: foto?.mimetype, fileLength: foto?.fileLength, download: () => msg.download() };
};

// The photo a message brings: its own, or else the one it quotes. null when it brings none.
// { citada, id (of the message the photo is in), unaVez, suya (quoted: it's the bot's), autor (quoted: who sent it),
// origen: { mimetype, fileLength, download() } }
export function fotoDe(m) {
  if (esFoto(m)) return { citada: false, id: m.id ?? m.key?.id ?? null, unaVez: esVistaUnicaRecibida(m), origen: origenDe(m, m.msg) };
  const citado = m?.quoted;
  if (!esFoto(citado)) return null;
  return { citada: true, id: citado.id ?? null, unaVez: esVistaUnica(m.msg?.contextInfo?.quotedMessage), suya: Boolean(citado.fromMe), autor: citado.sender || null, origen: origenDe(citado, citado) };
}

// The photo ready to attach: { ok: true, adjunto: { mimeType, datos } }, or { ok: false, motivo }: "pesada" (too heavy
// to send, told by its size before downloading it when the message says it), "formato" (not an image Gemini takes) or
// "error" (it couldn't be downloaded).
export async function fotoParaIA(origen) {
  const mimeType = ACEPTADOS.get(String(origen?.mimetype || "").split(";")[0].trim().toLowerCase());
  if (!mimeType) return { ok: false, motivo: "formato" };
  if (Number(origen.fileLength) > FOTOS.MAX_BYTES) return { ok: false, motivo: "pesada" };
  try {
    const buffer = await origen.download();
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return { ok: false, motivo: "error" };
    if (buffer.length > FOTOS.MAX_BYTES) return { ok: false, motivo: "pesada" };
    return { ok: true, adjunto: { mimeType, datos: buffer.toString("base64") } };
  } catch (e) {
    console.error("[fotos] no se pudo bajar la foto:", e?.message || e);
    return { ok: false, motivo: "error" };
  }
}

// What she saw in a photo, into her short-term memory: the message it came in keeps its mark, with that inside
// ("📷 (foto: un perro en la playa) mirá"). As an edit of its author's, which is the only kind the memory takes, and
// what the copy start-process.js keeps understands. Returns whether it was noted: not for a message that's no longer
// there, nor for one of the bot's own, which has no author.
export function recordarLoVisto(chat, id, visto) {
  const entrada = mensajeEnMemoria(chat, id);
  if (!entrada) return false;
  const texto = conLoVisto(entrada.texto, visto);
  return texto !== entrada.texto && editarMensaje(chat, id, texto, [entrada.usuario, entrada.participant]);
}
