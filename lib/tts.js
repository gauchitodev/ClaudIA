// Text to speech through Google Translate's public endpoint, which is all node-gtts did (and it dragged in the
// deprecated "request" library). The text is split into chunks under MAX_CHARS the way node-gtts did, each one is
// requested and the mp3s are concatenated. Node's core client is used, as request did underneath.
import { pedirHttp } from "./http.js";

export const TTS = {
  URL: "https://translate.google.com/translate_tts",
  MAX_CHARS: 100,
  TIMEOUT_MS: 15000,
  MAX_PEDAZOS: 30, // ~3000 characters; beyond that it's abusing the endpoint
};

const CABECERAS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Referer: "https://translate.google.com/",
};

// So the request can be injected in the tests.
export const _dep = { pedir: pedirHttp };

// Splits the text on punctuation and spaces into chunks under MAX_CHARS, like node-gtts.
export function partirTexto(texto) {
  const partes = String(texto || "")
    .split(/[¡!()[\]¿?.,;:—«»\n ]/)
    .filter((p) => p.length > 0);
  const salida = [];
  for (const p of partes) {
    const i = salida.length - 1;
    if (i >= 0 && salida[i].length + p.length + 1 < TTS.MAX_CHARS) salida[i] += ` ${p}`;
    else salida.push(p);
  }
  return salida;
}

const urlDe = (pedazo, idioma, indice, total) => `${TTS.URL}?ie=UTF-8&tl=${encodeURIComponent(idioma)}&q=${encodeURIComponent(pedazo)}&total=${total}&idx=${indice}&client=tw-ob&textlen=${pedazo.length}`;

// Returns the mp3 (Buffer) of the text in that language.
export async function sintetizar(texto, idioma = "es") {
  const pedazos = partirTexto(texto);
  if (!pedazos.length) throw new Error("No hay texto para leer");
  if (pedazos.length > TTS.MAX_PEDAZOS) throw new Error(`Texto demasiado largo: como mucho ${TTS.MAX_PEDAZOS * TTS.MAX_CHARS} caracteres`);
  const audios = [];
  for (const [i, pedazo] of pedazos.entries()) {
    const res = await _dep.pedir(urlDe(pedazo, idioma, i, pedazos.length), { headers: CABECERAS, timeoutMs: TTS.TIMEOUT_MS });
    if (!res.ok) throw new Error(`Google respondió ${res.status}`);
    audios.push(Buffer.from(await res.arrayBuffer()));
  }
  return Buffer.concat(audios);
}
