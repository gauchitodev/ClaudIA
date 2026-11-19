// What a message that isn't text leaves in Claudia's short-term memory (lib/contexto-chat.js): a mark at the start of
// its text, "📷 (foto)", and after it the caption, if it has one. She used to keep only text: a photo, a sticker or
// someone else's voice note didn't exist for her, and neither did what the bot itself sent that wasn't her chat.
//
// The mark is all there is: whether a stored message is a photo, and whether there's anything in it to read, is told
// from its text, here. That way it holds in the copy start-process.js keeps (lib/relevo-memoria.js), which stores the
// fields it knew when it started and drops any other.
//
// Nothing but plain functions, and no imports.

// The emoji is the one WhatsApp shows for each in a notification, none with a variation selector: the mark is read
// back from the text.
const TIPOS = {
  foto: { emoji: "📷", uno: "foto", varios: "fotos" },
  video: { emoji: "🎥", uno: "video", varios: "videos" },
  gif: { emoji: "🎬", uno: "gif", varios: "gifs" },
  audio: { emoji: "🎤", uno: "audio", varios: "audios" },
  sticker: { emoji: "💟", uno: "sticker", varios: "stickers" },
  archivo: { emoji: "📎", uno: "archivo", varios: "archivos" },
  ubicacion: { emoji: "📍", uno: "ubicación", varios: "ubicaciones" },
  contacto: { emoji: "👤", uno: "contacto", varios: "contactos" },
  encuesta: { emoji: "📊", uno: "encuesta", varios: "encuestas" },
};
const POR_PALABRA = new Map(Object.entries(TIPOS).map(([tipo, t]) => [t.uno, tipo]));
// A detail starts with a space or a colon (" de 0:35", ": apuntes.pdf"): "(fotografía)" isn't a mark.
const MARCA = new RegExp(`^(?:${Object.values(TIPOS).map((t) => t.emoji).join("|")}) \\((${Object.values(TIPOS).map((t) => t.uno).join("|")})((?:[ :][^)]*)?)\\)\\s*([\\s\\S]*)$`, "u");

// A detail goes inside the mark's brackets, so it can't close them, and it's one line of a reasonable length.
const MAX_DETALLE = 60;
const sinParentesis = (texto) =>
  String(texto || "")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DETALLE)
    .trim();

// "📷 (foto)", or with a detail: marca("archivo", ": apuntes.pdf") is "📎 (archivo: apuntes.pdf)".
export const marca = (tipo, detalle = "") => `${TIPOS[tipo].emoji} (${TIPOS[tipo].uno}${detalle})`;

// The mark with what the message says after it: "📷 (foto) mirá lo que encontré".
export const conMarca = (tipo, texto = "", detalle = "") => `${marca(tipo, detalle)} ${String(texto || "").trim()}`.trim();

// Several in a row from the same person, as one line: "📷 (4 fotos)".
export const variasDe = (tipo, cuantas) => `${TIPOS[tipo].emoji} (${cuantas} ${TIPOS[tipo].varios})`;

// What a stored text says it is: { tipo, detalle, resto } (resto: what was said with it, "" for none), or null for
// plain text.
export function adjuntoDe(texto) {
  const partes = MARCA.exec(String(texto || ""));
  return partes ? { tipo: POR_PALABRA.get(partes[1]), detalle: partes[2], resto: partes[3].trim() } : null;
}

// Whether a stored text is an attachment with nothing said with it: something she knows is there and can't read.
export const esAdjuntoMudo = (texto) => adjuntoDe(texto)?.resto === "";

// A new text for a stored message, with the mark it already had: an edited caption is still a photo's.
export function conLaMarcaDe(anterior, texto) {
  const previo = adjuntoDe(anterior);
  return previo && !adjuntoDe(texto) ? conMarca(previo.tipo, texto, previo.detalle) : texto;
}

const segundos = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// What goes inside the mark besides its name: how long an audio is, a file's name, what a poll asks.
function detalleDe(tipo, contenido) {
  if (tipo === "audio" && Number(contenido?.seconds) > 0) return ` de ${segundos(Number(contenido.seconds))}`;
  const nombre = sinParentesis(tipo === "archivo" ? contenido?.fileName : tipo === "encuesta" ? contenido?.name : "");
  return nombre ? `: ${nombre}` : "";
}

// ---------- what came in ----------

const POR_CLAVE = {
  imageMessage: "foto",
  videoMessage: "video",
  ptvMessage: "video",
  audioMessage: "audio",
  stickerMessage: "sticker",
  documentMessage: "archivo",
  locationMessage: "ubicacion",
  liveLocationMessage: "ubicacion",
  contactMessage: "contacto",
  contactsArrayMessage: "contacto",
  pollCreationMessage: "encuesta",
  pollCreationMessageV2: "encuesta",
  pollCreationMessageV3: "encuesta",
};

// The attachment in a message's content, as Baileys hands it over (m.message): { tipo, contenido (its own part of the
// message), unaVez }, or null for text and for what isn't said by anyone (a deletion, a vote in a poll, a reaction).
// It follows the { message } wrappers (a view-once, a document with a caption, a disappearing message), and never goes
// into a contextInfo: a text that answers a photo isn't one. Only own properties: a decoded protobuf has every field on
// its prototype (lib/vista-unica.js).
export function adjuntoEn(mensaje, nivel = 0) {
  if (!mensaje || typeof mensaje !== "object" || nivel > 5) return null;
  for (const [clave, valor] of Object.entries(mensaje)) {
    if (!valor || typeof valor !== "object") continue;
    if (POR_CLAVE[clave]) return { tipo: clave === "videoMessage" && valor.gifPlayback ? "gif" : POR_CLAVE[clave], contenido: valor, unaVez: valor.viewOnce === true };
    const dentro = adjuntoEn(valor.message, nivel + 1);
    if (dentro) return /^viewOnce/.test(clave) ? { ...dentro, unaVez: true } : dentro;
  }
  return null;
}

// Its mark. A view-once says so, and that's all it says: its caption was for whoever opened it.
export const marcaDeAdjunto = ({ tipo, contenido, unaVez }) => marca(tipo, unaVez ? " de ver una vez" : detalleDe(tipo, contenido));

// A sticker's sha256 as lib/stickers-grupo.js names its file, off the message itself and without downloading it:
// fileSha256 is the hash of the file as it was before WhatsApp encrypted it (Baileys' encryptedStream,
// Utils/messages-media.js), which is what a download gives back. It comes as bytes, or as base64 once it went through
// JSON. null without one.
export function shaDelArchivo(contenido) {
  const crudo = contenido?.fileSha256;
  if (!crudo) return null;
  try {
    const bytes = typeof crudo === "string" ? Buffer.from(crudo, "base64") : Buffer.from(crudo);
    return bytes.length === 32 ? bytes.toString("hex") : null;
  } catch {
    return null;
  }
}

// ---------- what the bot sends ----------

const POR_ENVIO = { image: "foto", video: "video", audio: "audio", sticker: "sticker", document: "archivo", location: "ubicacion", contacts: "contacto", poll: "encuesta" };

// The mark of what the bot sends, from the content it hands to sendMessage: null for a text.
export function marcaDeEnvio(contenido) {
  const clave = Object.keys(POR_ENVIO).find((k) => contenido?.[k]);
  if (!clave) return null;
  const tipo = clave === "video" && contenido.gifPlayback ? "gif" : POR_ENVIO[clave];
  return marca(tipo, detalleDe(tipo, clave === "poll" ? contenido.poll : contenido));
}
