// How big a file can be before a command downloads it. These commands hold the whole file in memory and hand it to
// ffmpeg or jimp, on a tablet: a 1,5 GB video sent as a document was downloaded whole by .s, whose 7-second check
// never saw it (a document carries no duration). A message carries its file's size and length (fileLength and
// seconds; a Long in a message, a string in a quoted one, and Number() reads both), so nothing is downloaded to find out.
import { duracion } from "./tiempo.js";

export const TOPES_MEDIA = {
  sticker: { mb: 10 }, // .s (a video also has its 7 seconds)
  audio: { mb: 50, segundos: 10 * 60 }, // .tomp3 and .vn: the audio out of a video, or a voice note
  efecto: { mb: 20, segundos: 5 * 60 }, // .bass, .reverse…: reversing holds the whole decoded track in memory
  subir: { mb: 20 }, // .tourl
  imagen: { mb: 10 }, // .res
  vistaUnica: { mb: 50 }, // .r
};

const MB = 1024 * 1024;

// The sentence for whoever asked when the file (a message or a quoted one) is past its limits, or null when it fits.
export function excedeTope(q, { mb, segundos = null }) {
  const datos = q?.msg || q || {};
  const bytes = Number(datos.fileLength);
  if (bytes > mb * MB) return `Ese archivo pesa ${Math.ceil(bytes / MB)} MB y el tope es de ${mb} MB.`;
  const largo = Number(datos.seconds);
  if (segundos && largo > segundos) return `Ese archivo dura ${duracion(largo * 1000)} y el tope es de ${duracion(segundos * 1000)}.`;
  return null;
}
