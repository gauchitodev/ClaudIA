// Texto a voz con el endpoint público de Google Translate, que es lo único que hacía node-gtts (y arrastraba la
// librería "request", deprecada). El texto se parte en pedazos de menos de MAX_CHARS como hacía node-gtts, se pide
// cada uno y se concatenan los mp3. Se usa el cliente del core de Node, como hacía request por dentro.
import { pedirHttp } from "./http.js";

export const TTS = {
  URL: "https://translate.google.com/translate_tts",
  MAX_CHARS: 100,
  TIMEOUT_MS: 15000,
  MAX_PEDAZOS: 30, // ~3000 caracteres; más que eso es abuso del endpoint
};

const CABECERAS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Referer: "https://translate.google.com/",
};

// Para poder inyectar el pedido en los tests.
export const _dep = { pedir: pedirHttp };

// Parte el texto por puntuación y espacios en pedazos de menos de MAX_CHARS, como node-gtts.
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

// Devuelve el mp3 (Buffer) del texto en ese idioma.
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
