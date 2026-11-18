// GOES-19's animations of southern South America, for .satinf and .satvis and their stickers
// (plugins/tools-satelite.js). NOAA publishes each band as a GIF of some 9 MB: 50 frames, one every 10 minutes, so the
// last 8 hours, redone every 10 minutes. It's turned into a video (the whole sector, with NOAA's date bar) or into a
// sticker (a square around Uruguay).
//
// What's kept is the result, not the GIF: in tmp/, with the ETag of the GIF it was made from. For VIGENCIA_MS the same
// result goes out without asking anyone; after that NOAA is asked with the ETag, and a 304 keeps it. So ten people
// asking in a row cost one download and one conversion, and ffmpeg runs one conversion at a time: the bot lives on a
// tablet.
import { mkdir, readFile, rename, utimes } from "node:fs/promises";
import path from "node:path";
import { ffmpeg } from "./ffmpeg.js";
import { eventosSolares } from "./aero-calculos.js";

export const SATELITE = {
  VIGENCIA_MS: 5 * 60 * 1000,
  TIMEOUT_MS: 120_000,
  MAX_BYTES: 25 * 1024 * 1024,
  MAX_STICKER_BYTES: 500 * 1024,
  HORAS: 8, // what the 50 frames span
};

export const BANDAS = {
  infrarrojo: { numero: "13", nombre: "infrarrojo (banda 13)" },
  visible: { numero: "02", nombre: "luz visible (banda 2)" },
};
const urlDe = (banda) => `https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/ssa/${banda.numero}/GOES19-SSA-${banda.numero}-900x540.gif`;

// The sticker's square, out of the 900x540 sector: from the Andes to the south of Brazil and from Paraguay down to
// Tierra del Fuego, with Uruguay near the middle. NOAA's date bar is left out of it.
const RECORTE = "crop=360:360:270:90";
// Every other frame: the same 4 seconds at half the weight.
const FPS_STICKER = "6.25";
// [quality, side]: the first one that fits in MAX_STICKER_BYTES. The first is right at the limit (some 490 KB), so
// the second is used often; each one takes a couple of seconds on a PC.
const ESCALERA = [[35, 320], [20, 320], [30, 256], [20, 224]];
const VIDEO = ["-loglevel", "error", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an"];
// compression_level 4, libwebp's default: at 6 this same sticker took 40 seconds instead of 2, for 5% less weight.
const stickerCon = (calidad, lado) => ["-loglevel", "error", "-vf", `fps=${FPS_STICKER},${RECORTE},scale=${lado}:${lado}:flags=lanczos`, "-c:v", "libwebp_anim", "-lossless", "0", "-quality", String(calidad), "-compression_level", "4", "-loop", "0", "-an"];

// Swappable in the tests: the network, ffmpeg, and where the results are kept (ffmpeg.js writes in tmp/ too, so the
// rename never crosses filesystems; lib/limpieza-tmp.js deletes them once nobody asked for 15 minutes).
export const _dep = { fetch: (...args) => fetch(...args), ffmpeg, carpeta: path.join(import.meta.dirname, "../tmp") };

const productos = new Map(); // "infrarrojo.webp" -> { etag, hechoEn }: what's on disk under that name
const enCurso = new Map(); // "infrarrojo.webp" -> the promise of the one being made
let cola = Promise.resolve(); // ffmpeg's turn

const rutaDe = (clave) => path.join(_dep.carpeta, `satelite-${clave}`);

function enCola(tarea) {
  const resultado = cola.then(tarea);
  cola = resultado.catch(() => {});
  return resultado;
}

// The band's GIF, or null if it's still the one with that ETag.
async function bajar(banda, etag) {
  const respuesta = await _dep.fetch(urlDe(banda), { headers: etag ? { "If-None-Match": etag } : {}, signal: AbortSignal.timeout(SATELITE.TIMEOUT_MS) });
  if (respuesta.status === 304) return null;
  if (!respuesta.ok) throw new Error(`NOAA respondió ${respuesta.status}`);
  if (Number(respuesta.headers.get("content-length")) > SATELITE.MAX_BYTES) throw new Error("el GIF de NOAA es demasiado grande");
  const gif = Buffer.from(await respuesta.arrayBuffer());
  if (gif.length > SATELITE.MAX_BYTES) throw new Error("el GIF de NOAA es demasiado grande");
  if (!/^GIF8[79]a$/.test(gif.subarray(0, 6).toString("latin1"))) throw new Error("NOAA no devolvió un GIF");
  return { gif, etag: respuesta.headers.get("etag") };
}

async function aSticker(gif) {
  for (const [calidad, lado] of ESCALERA) {
    const hecho = await _dep.ffmpeg(gif, stickerCon(calidad, lado), "gif", "webp");
    if (hecho.data.length <= SATELITE.MAX_STICKER_BYTES) return hecho;
    await hecho.delete().catch(() => {});
  }
  throw new Error(`el sticker no baja de ${SATELITE.MAX_STICKER_BYTES / 1024} KB`);
}

async function obtener(banda, clave) {
  const ruta = rutaDe(clave);
  const previo = productos.get(clave);
  // The tmp cleanup may have taken it: then it's as if it had never been made.
  const guardado = previo ? await readFile(ruta).catch(() => null) : null;
  if (guardado && Date.now() - previo.hechoEn < SATELITE.VIGENCIA_MS) return guardado;

  const bajado = await bajar(banda, guardado ? previo.etag : null);
  if (!bajado) {
    previo.hechoEn = Date.now();
    const ahora = new Date();
    await utimes(ruta, ahora, ahora).catch(() => {}); // it's in use: the tmp cleanup goes by this date
    return guardado;
  }

  const hecho = await enCola(() => (clave.endsWith(".webp") ? aSticker(bajado.gif) : _dep.ffmpeg(bajado.gif, VIDEO, "gif", "mp4")));
  try {
    await mkdir(_dep.carpeta, { recursive: true });
    await rename(hecho.filename, ruta);
    productos.set(clave, { etag: bajado.etag, hechoEn: Date.now() });
  } catch (e) {
    // It goes out all the same: only the next one is made again.
    productos.delete(clave);
    hecho.delete().catch(() => {});
    console.error(`[satelite] no pude guardar ${clave}: ${e.message}`);
  }
  return hecho.data;
}

// The animation of a band ("infrarrojo" | "visible") as a Buffer: an MP4, or the sticker's WebP (without EXIF).
// Throws if NOAA or ffmpeg fail. Two requests for the same thing at once share one job.
export function animacion(nombreBanda, comoSticker = false) {
  const clave = `${nombreBanda}.${comoSticker ? "webp" : "mp4"}`;
  let trabajo = enCurso.get(clave);
  if (!trabajo) {
    trabajo = obtener(BANDAS[nombreBanda], clave).finally(() => enCurso.delete(clave));
    enCurso.set(clave, trabajo);
  }
  return trabajo;
}

// The visible band is sunlight: at night it's black. Whether the animation's hours had any: "si", "parcial" (it's night
// now, so the last frames are dark) or "no" (all of them were at night). By the sun at Montevideo, with an hour of
// margin on each side for the rest of the square, which reaches from the Andes to the coast of Brazil.
const MONTEVIDEO = { lat: -34.9, lon: -56.2 };
const MARGEN_MS = 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
export function luzVisible(ahora = Date.now()) {
  const desde = ahora - SATELITE.HORAS * 60 * 60 * 1000;
  let alguna = false;
  for (const corrimiento of [-DIA_MS, 0, DIA_MS]) {
    const fecha = new Date(ahora + corrimiento);
    const { salida, puesta } = eventosSolares(MONTEVIDEO.lat, MONTEVIDEO.lon, fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, fecha.getUTCDate());
    if (salida === null || puesta === null) continue;
    if (salida <= ahora && ahora <= puesta) return "si";
    if (salida - MARGEN_MS < ahora && puesta + MARGEN_MS > desde) alguna = true;
  }
  return alguna ? "parcial" : "no";
}

// For the tests: as just imported.
export const _pruebas = {
  reiniciar() {
    productos.clear();
    enCurso.clear();
    cola = Promise.resolve();
  },
};
