// emoji kitchen for .emojimix (plugins/sticker-emojimix.js). google publishes no index of its mixed emojis, so it's built
// from the community's metadata.json (huge, read as a stream) and only a small index is kept: for each pair of emojis, the
// path of its newest image on gstatic.com. It lives in database/emojimix.tsv and in memory
//
// Nothing runs on load: main.js calls iniciarEmojimix() on start, which reads the index from disk, or downloads it in the
// background if there's none (meanwhile buscarMezcla answers "no_disponible"), and it's refreshed every REFRESCO_MS.
// a failed download never replaces an index that works
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { setImmediate as cederTurno } from "node:timers/promises";
import path from "node:path";

const CATALOGO_URL = "https://raw.githubusercontent.com/xsalazar/emoji-kitchen-backend/main/app/metadata.json";
const IMAGENES_URL = "https://www.gstatic.com/android/keyboard/emojikitchen/";
const INDICE = path.join("database", "emojimix.tsv");
const REFRESCO_MS = 14 * 24 * 60 * 60 * 1000; // google adds combinations now and then
const REINTENTO_MS = 10 * 60 * 1000; // after a failed download
const MIN_PARES = 10_000; // fewer than this is a broken catalogue there are over 100.000

// a flat object of metadata.json holding one combination (the outer ones have nested braces, so they don't match)
const OBJETO = /\{[^{}]*"gStaticUrl"[^{}]*\}/g;
const COLA_MAX = 4096; // a combination is under 1 KB: of what's left unparsed only the end is kept, it may be a cut one
const CODIGO = /^[0-9a-f]+(?:-[0-9a-f]+)*$/;
const RUTA = /^[\w./-]+$/;
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const VS16 = "fe0f";
const TONOS = new Set(["1f3fb", "1f3fc", "1f3fd", "1f3fe", "1f3ff"]);

let indice = null; // { pares: "a|b" - "<fecha>/<ruta>.png", conocidos, armadoEn }
let cargando = null; // the first read from disk, done once
let bajando = false;
let falloEn = 0;

const claveDePar = (a, b) => (a <= b ? `${a}|${b}` : `${b}|${a}`);

// "2764-fe0f" and "2764" are the same emoji
const sinVS16 = (codigo) =>
  codigo
    .split("-")
    .filter((parte) => parte !== VS16)
    .join("-");

function fijarIndice(pares, armadoEn) {
  // each emoji without its variation selector - the form the catalogue writes it in
  const conocidos = new Map();
  for (const clave of pares.keys()) for (const codigo of clave.split("|")) conocidos.set(sinVS16(codigo), codigo);
  indice = { pares, conocidos, armadoEn };
  console.log(`🧑‍🍳 Emoji Kitchen: ${pares.size} combinaciones listas.`);
}

// the catalogue has no skin tones, so an emoji with one falls back to the base emoji
function resolverEmoji(emoji) {
  const partes = Array.from(emoji, (c) => c.codePointAt(0).toString(16));
  const sinTono = partes.filter((parte) => !TONOS.has(parte));
  return indice.conocidos.get(sinVS16(partes.join("-"))) ?? indice.conocidos.get(sinVS16(sinTono.join("-"))) ?? null;
}

async function cargarIndice() {
  try {
    const [texto, info] = await Promise.all([readFile(INDICE, "utf8"), stat(INDICE)]);
    const pares = new Map();
    for (const linea of texto.split("\n")) {
      const tab = linea.indexOf("\t");
      if (tab > 0) pares.set(linea.slice(0, tab), linea.slice(tab + 1));
    }
    if (pares.size < MIN_PARES) throw new Error(`solo tiene ${pares.size} combinaciones`);
    fijarIndice(pares, info.mtimeMs);
  } catch (e) {
    if (e.code !== "ENOENT") console.error(`[emojimix] el índice guardado no sirve (${e.message}), lo bajo de nuevo`);
  }
}

async function descargar() {
  bajando = true;
  try {
    console.log("⬇️ [emojimix] bajando el catálogo de Emoji Kitchen (solo la primera vez y cada tanto)...");
    const respuesta = await fetch(CATALOGO_URL, { signal: AbortSignal.timeout(5 * 60 * 1000) });
    if (!respuesta.ok) throw new Error(`GitHub respondió ${respuesta.status}`);

    const pares = new Map();
    let pendiente = "";
    for await (const texto of respuesta.body.pipeThrough(new TextDecoderStream())) {
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

        // the path starts with its date (aaaammdd/), so if a pair shows up twice the newest wins
        const clave = claveDePar(izquierda, derecha);
        if (ruta > (pares.get(clave) ?? "")) pares.set(clave, ruta);
      }
      pendiente = pendiente.slice(Math.max(hasta, pendiente.length - COLA_MAX));
      await cederTurno(); // so the bot keeps answering while a file this size is read
    }
    if (pares.size < MIN_PARES) throw new Error(`el catálogo trae solo ${pares.size} combinaciones`);
    fijarIndice(pares, Date.now());

    // if it can't be saved the one in memory still works (it's downloaded again on the next start)
    try {
      await mkdir(path.dirname(INDICE), { recursive: true });
      await writeFile(`${INDICE}.tmp`, [...pares].map(([clave, ruta]) => `${clave}\t${ruta}`).join("\n"));
      await rename(`${INDICE}.tmp`, INDICE); // renamed, so a cut write never leaves a half index
    } catch (e) {
      console.error(`[emojimix] no pude guardar el índice en disco: ${e.message}`);
    }
  } catch (e) {
    falloEn = Date.now();
    console.error(`[emojimix] no pude bajar el catálogo${indice ? " (sigo con el anterior)" : ""}: ${e.message}`);
  } finally {
    bajando = false;
  }
}

// downloads the catalogue if there's none, or it's older than REFRESCO_MS (and the last try didn't fail a moment ago).
// descargar() marks bajando before its first await, so two calls in a row never start two downloads
function refrescarSiHaceFalta() {
  const vencido = !indice || Date.now() - indice.armadoEn >= REFRESCO_MS;
  if (vencido && !bajando && Date.now() - falloEn >= REINTENTO_MS) descargar();
}

// main.js calls it once on start, WITHOUT await: reads the index from disk and, if there's none or it's old, downloads it
// in the background. It never rejects. buscarMezcla calls it too, so it's safe even if main.js didn't
export function iniciarEmojimix() {
  return (cargando ??= cargarIndice().then(refrescarSiHaceFalta));
}

// The image of the mix of two emojis, as they were typed. Doesn't use the network: only the index in memory.
// { estado: "ok", url } | "no_disponible" (no catalogue yet) | "no_soportado" (sinCatalogo: the emojis it doesn't have)
// | "sin_combinacion"
export async function buscarMezcla(primero, segundo) {
  await iniciarEmojimix();
  refrescarSiHaceFalta(); // the index may have gone stale while the bot was running
  if (!indice) return { estado: "no_disponible" };

  const codigos = [primero, segundo].map(resolverEmoji);
  if (codigos.includes(null)) {
    return { estado: "no_soportado", sinCatalogo: [primero, segundo].filter((_, i) => codigos[i] === null) };
  }
  const ruta = indice.pares.get(claveDePar(...codigos));
  if (!ruta) return { estado: "sin_combinacion" };
  return { estado: "ok", url: IMAGENES_URL + ruta };
}

// The PNG of a mix (the url buscarMezcla gave) throws if it fails or what comes isn't a png
export async function bajarMezcla(url) {
  const respuesta = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!respuesta.ok) throw new Error(`gstatic respondió ${respuesta.status}`);
  const png = Buffer.from(await respuesta.arrayBuffer());
  if (!png.subarray(0, FIRMA_PNG.length).equals(FIRMA_PNG)) throw new Error("gstatic no devolvió un PNG");
  return png;
}
