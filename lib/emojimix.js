// Emoji Kitchen for .emojimix (plugins/sticker-emojimix.js). Google publishes no index of its mixed emojis, so it's
// built from the community's metadata.json (99 MB, some 9 MB on the wire, read as a stream) and only a small index is
// kept: for each pair of emojis, the path of its newest image on gstatic.com. It lives in database/emojimix.tsv.
//
// Nothing runs on load. main.js calls iniciarEmojimix() on start, which only looks at the index on disk and downloads
// it in the background if there's none or it's older than REFRESCO_MS. The index goes into memory (some 16 MB) the
// first time someone uses the command, not before: most starts nobody does. A refresh asks GitHub with the ETag of the
// catalogue the index was built from, and the catalogue changes a few times a year: nearly every refresh is a 304 that
// downloads nothing. A failed download never replaces an index that works.
import { mkdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { setImmediate as cederTurno } from "node:timers/promises";
import path from "node:path";

const CATALOGO_URL = "https://raw.githubusercontent.com/xsalazar/emoji-kitchen-backend/main/app/metadata.json";
const IMAGENES_URL = "https://www.gstatic.com/android/keyboard/emojikitchen/";
const INDICE = path.join("database", "emojimix.tsv");
const ETAG = `${INDICE}.etag`; // the ETag of the catalogue the index on disk was built from
const REFRESCO_MS = 14 * 24 * 60 * 60 * 1000; // Google adds combinations now and then
// After a failed download: 10 minutes, and twice as long after each failure in a row, up to a day. At a fixed 10
// minutes, a connection too slow to ever finish started the download over every time someone used the command.
const REINTENTO_MS = 10 * 60 * 1000;
const REINTENTO_MAX_MS = 24 * 60 * 60 * 1000;
const DESCARGA_MAX_MS = 15 * 60 * 1000; // some 80 kbps for the 9 MB: at 5 minutes a slow connection never made it
const MIN_PARES = 10_000; // fewer than this is a broken catalogue: there are over 100.000

// A flat object of metadata.json holding one combination (the outer ones have nested braces, so they don't match).
const OBJETO = /\{[^{}]*"gStaticUrl"[^{}]*\}/g;
const COLA_MAX = 4096; // a combination is under 1 KB: of what's left unparsed only the end is kept, it may be a cut one
const CODIGO = /^[0-9a-f]+(?:-[0-9a-f]+)*$/;
const RUTA = /^[\w./-]+$/;
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const VS16 = "fe0f";
const TONOS = new Set(["1f3fb", "1f3fc", "1f3fd", "1f3fe", "1f3ff"]);

let indice = null; // { pares: "a|b" -> "<fecha>/<ruta>.png", conocidos }, in memory once the command was used
let enUso = false; // someone used the command: from then on the index stays in memory
let armadoEn = null; // when the index on disk was built or last confirmed; 0 = there's none; null = not looked at yet
let mirando = null; // the first look at the disk, done once
let cargando = null; // the read from disk into memory, one at a time
let bajando = null; // the download in progress
let fallos = 0; // failed downloads in a row
let falloEn = 0;

const claveDePar = (a, b) => (a <= b ? `${a}|${b}` : `${b}|${a}`);

// "2764-fe0f" and "2764" are the same emoji.
const sinVS16 = (codigo) =>
  codigo
    .split("-")
    .filter((parte) => parte !== VS16)
    .join("-");

function fijarIndice(pares) {
  // each emoji without its variation selector -> the form the catalogue writes it in
  const conocidos = new Map();
  for (const clave of pares.keys()) for (const codigo of clave.split("|")) conocidos.set(sinVS16(codigo), codigo);
  indice = { pares, conocidos };
}

// The catalogue has no skin tones, so an emoji with one falls back to the base emoji.
function resolverEmoji(emoji) {
  const partes = Array.from(emoji, (c) => c.codePointAt(0).toString(16));
  const sinTono = partes.filter((parte) => !TONOS.has(parte));
  return indice.conocidos.get(sinVS16(partes.join("-"))) ?? indice.conocidos.get(sinVS16(sinTono.join("-"))) ?? null;
}

// Whether there's an index on disk, and since when: all the start needs to know.
async function mirarDisco() {
  try {
    armadoEn = (await stat(INDICE)).mtimeMs;
  } catch {
    armadoEn = 0;
  }
}

// The index, from disk into memory. One that doesn't serve counts as none: the next refresh downloads it whole.
async function cargarIndice() {
  try {
    const pares = new Map();
    for (const linea of (await readFile(INDICE, "utf8")).split("\n")) {
      const tab = linea.indexOf("\t");
      if (tab > 0) pares.set(linea.slice(0, tab), linea.slice(tab + 1));
    }
    if (pares.size < MIN_PARES) throw new Error(`solo tiene ${pares.size} combinaciones`);
    fijarIndice(pares);
  } catch (e) {
    armadoEn = 0;
    console.error(`[emojimix] el índice guardado no sirve (${e.message}), lo bajo de nuevo`);
  }
}

// The catalogue's combinations, read as they arrive: "a|b" -> the path of the newest image of that pair.
async function leerCatalogo(cuerpo) {
  const pares = new Map();
  let pendiente = "";
  for await (const texto of cuerpo.pipeThrough(new TextDecoderStream())) {
    pendiente += texto;
    let hasta = 0;
    for (const m of pendiente.matchAll(OBJETO)) {
      hasta = m.index + m[0].length;
      let c;
      try {
        c = JSON.parse(m[0]);
      } catch {
        continue;
      }
      const url = String(c.gStaticUrl);
      const ruta = url.startsWith(IMAGENES_URL) ? url.slice(IMAGENES_URL.length) : "";
      const izquierda = c.leftEmojiCodepoint;
      const derecha = c.rightEmojiCodepoint;
      if (c.isLatest !== true || !CODIGO.test(izquierda) || !CODIGO.test(derecha) || !RUTA.test(ruta)) continue;

      // The path starts with its date (aaaammdd/), so if a pair shows up twice the newest wins.
      const clave = claveDePar(izquierda, derecha);
      if (ruta > (pares.get(clave) ?? "")) pares.set(clave, ruta);
    }
    pendiente = pendiente.slice(Math.max(hasta, pendiente.length - COLA_MAX));
    await cederTurno(); // so the bot keeps answering while a file this size is read
  }
  return pares;
}

async function descargar() {
  try {
    // Only with an index on disk to keep: without one, a 304 would leave the bot with nothing.
    const etag = armadoEn ? (await readFile(ETAG, "utf8").catch(() => "")).trim() : "";
    const respuesta = await fetch(CATALOGO_URL, { headers: etag ? { "If-None-Match": etag } : {}, signal: AbortSignal.timeout(DESCARGA_MAX_MS) });
    if (respuesta.status === 304) {
      // The catalogue is the one the index was built from: it's good for another REFRESCO_MS. Its date on disk says
      // so, for the next start; if the index isn't there any more, that throws, and the next try downloads it whole.
      const ahora = new Date();
      await utimes(INDICE, ahora, ahora).catch((e) => {
        armadoEn = 0;
        throw e;
      });
      armadoEn = ahora.getTime();
      fallos = 0;
      return;
    }
    if (!respuesta.ok) throw new Error(`GitHub respondió ${respuesta.status}`);
    console.log("⬇️ [emojimix] bajando el catálogo de Emoji Kitchen (la primera vez, y cuando cambia)...");

    const pares = await leerCatalogo(respuesta.body);
    if (pares.size < MIN_PARES) throw new Error(`el catálogo trae solo ${pares.size} combinaciones`);

    let guardado = false;
    try {
      await mkdir(path.dirname(INDICE), { recursive: true });
      await writeFile(`${INDICE}.tmp`, [...pares].map(([clave, ruta]) => `${clave}\t${ruta}`).join("\n"));
      await rename(`${INDICE}.tmp`, INDICE); // renamed, so a cut write never leaves a half index
      guardado = true;
      // After the index, and without one if GitHub sent none: an ETag on disk always belongs to the index beside it.
      const nuevo = respuesta.headers.get("etag");
      if (nuevo) await writeFile(ETAG, nuevo);
      else await rm(ETAG, { force: true });
    } catch (e) {
      console.error(`[emojimix] no pude guardar el índice en disco: ${e.message}`);
    }
    armadoEn = Date.now();
    fallos = 0;
    // Into memory if the command is in use, or if it couldn't be saved: then it's the only copy there is (and it's
    // downloaded again on the next start).
    if (enUso || !guardado) fijarIndice(pares);
    console.log(`🧑‍🍳 Emoji Kitchen: ${pares.size} combinaciones listas.`);
  } catch (e) {
    fallos++;
    falloEn = Date.now();
    console.error(`[emojimix] no pude bajar el catálogo${armadoEn ? " (sigo con el anterior)" : ""}: ${e.message}`);
  }
}

// Downloads the catalogue if there's no index, or it's older than REFRESCO_MS, unless a download is going or the last
// one failed a moment ago. bajando is set before descargar's first await, so two calls in a row never start two.
function refrescarSiHaceFalta() {
  if (armadoEn === null || bajando) return;
  const vencido = Date.now() - armadoEn >= REFRESCO_MS;
  const espera = fallos ? Math.min(REINTENTO_MS * 2 ** (fallos - 1), REINTENTO_MAX_MS) : 0;
  if (vencido && Date.now() - falloEn >= espera) bajando = descargar().finally(() => (bajando = null));
}

// main.js calls it once on start, WITHOUT await: it looks at the index on disk and, if there's none or it's old,
// downloads it in the background. It never rejects. buscarMezcla calls it too, so it's safe even if main.js didn't.
export function iniciarEmojimix() {
  return (mirando ??= mirarDisco()).then(refrescarSiHaceFalta);
}

// The image of the mix of two emojis, as they were typed. The only network it may use is the refresh, which it
// doesn't wait for.
// { estado: "ok", url } | "no_disponible" (no catalogue yet) | "no_soportado" (sinCatalogo: the emojis it doesn't have)
// | "sin_combinacion"
export async function buscarMezcla(primero, segundo) {
  enUso = true;
  await iniciarEmojimix();
  if (!indice && armadoEn) await (cargando ??= cargarIndice().finally(() => (cargando = null)));
  refrescarSiHaceFalta(); // the index may have gone stale while the bot was running, or the one on disk didn't serve
  if (!indice) return { estado: "no_disponible" };

  const codigos = [primero, segundo].map(resolverEmoji);
  if (codigos.includes(null)) {
    return { estado: "no_soportado", sinCatalogo: [primero, segundo].filter((_, i) => codigos[i] === null) };
  }
  const ruta = indice.pares.get(claveDePar(...codigos));
  if (!ruta) return { estado: "sin_combinacion" };
  return { estado: "ok", url: IMAGENES_URL + ruta };
}

// The PNG of a mix (the url buscarMezcla gave). Throws if it fails or what comes isn't a PNG.
export async function bajarMezcla(url) {
  const respuesta = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!respuesta.ok) throw new Error(`gstatic respondió ${respuesta.status}`);
  const png = Buffer.from(await respuesta.arrayBuffer());
  if (!png.subarray(0, FIRMA_PNG.length).equals(FIRMA_PNG)) throw new Error("gstatic no devolvió un PNG");
  return png;
}

// For the tests: as just imported, and the download in progress (null if there's none) to wait for.
export const _pruebas = {
  reiniciar() {
    indice = mirando = cargando = bajando = armadoEn = null;
    enUso = false;
    fallos = falloEn = 0;
  },
  descarga: () => bajando,
  enMemoria: () => Boolean(indice),
};
