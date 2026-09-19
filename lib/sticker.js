import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";
import webp from "node-webpmux";
import { spawn } from "child_process";

// Imagen o video a webp con ffmpeg. Antes se usaba fluent-ffmpeg, que está abandonado; la línea de comando es la
// misma que armaba esa librería (con un solo -i, que ella repetía). "lado" es el tamaño del cuadrado: 320 normal,
// 224 para comprimir cuando el sticker pasa de 1 MB.
function ffmpegWebp(tmp, out, type, lado) {
  const filtro = `scale='min(${lado},iw)':min'(${lado},ih)':force_original_aspect_ratio=decrease,fps=15, pad=${lado}:${lado}:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse`;
  const args = [...(/video/i.test(type.mime) ? ["-f", type.ext] : []), "-i", tmp, "-y", "-vcodec", "libwebp", "-vf", filtro, "-f", "webp", out];
  return new Promise((resolve, reject) => {
    const proceso = spawn("ffmpeg", args);
    // Sin esto el motivo real se perdía y quedaba solo el código de salida, que no dice nada. ffmpeg explica en
    // stderr si le falta el codificador, si no entiende el formato o si el archivo llegó cortado.
    let salidaError = "";
    proceso.stderr?.on("data", (d) => {
      if (salidaError.length < 4000) salidaError += d;
    });
    proceso.on("error", (e) => reject(Object.assign(e, { motivo: e.code === "ENOENT" ? "no-instalado" : "no-arranca" })));
    proceso.on("close", (code) => (code === 0 ? resolve() : reject(Object.assign(new Error(`ffmpeg salió con código ${code}`), { motivo: "fallo", stderr: salidaError.trim() }))));
  });
}

// Traduce un fallo de ffmpeg a una causa concreta y accionable. La idea es que el log alcance solo: quien lo lee (o
// manda una captura) no tiene que correr ningún comando para saber qué pasó.
function explicarFalloFfmpeg(e, type, lado) {
  if (e?.motivo === "no-instalado") {
    console.error("[sticker] ❌ ffmpeg NO ESTÁ INSTALADO, o no está en el PATH del proceso del bot (spawn devolvió ENOENT).");
    console.error("[sticker] ➜ CAUSA: falta ffmpeg. En Termux se instala con: pkg install ffmpeg");
    return;
  }
  const dijo = String(e?.stderr || "")
    .split("\n")
    .filter((l) => l.trim())
    .slice(-4)
    .join(" | ");
  console.error(`[sticker] ❌ ffmpeg falló convirtiendo ${type?.mime || "?"} a webp de ${lado}x${lado}: ${e?.message || e}`);
  if (dijo) console.error(`[sticker]    ffmpeg dijo: ${dijo}`);
  if (/libwebp|unknown encoder|encoder not found/i.test(dijo)) {
    console.error("[sticker] ➜ CAUSA: este build de ffmpeg no trae el codificador libwebp, así que no puede hacer stickers. Hay que reinstalar ffmpeg con soporte webp.");
  } else {
    console.error("[sticker] ➜ CAUSA: ffmpeg está y arranca, pero no pudo con este archivo. El detalle está en la línea de arriba.");
  }
}

async function convertirASticker(img, url, lado) {
  if (url) {
    const res = await fetch(url);
    if (res.status !== 200) throw new Error(await res.text());
    img = Buffer.from(await res.arrayBuffer());
  }
  const type = (await fileTypeFromBuffer(img)) || { mime: "application/octet-stream", ext: "bin" };
  // Como siempre: si no es imagen ni video, o ffmpeg falla, se rechaza con la imagen original, y sticker() la devuelve
  // tal cual para que el plugin mande la foto en vez de nada.
  if (type.ext === "bin") {
    console.error(`[sticker] ❌ no se reconoció el tipo del archivo (${img?.length ?? 0} bytes): no parece ni imagen ni video.`);
    throw img;
  }
  const tmp = path.join(import.meta.dirname, `../tmp/${Date.now()}.${type.ext}`);
  const out = `${tmp}.webp`;
  await fs.promises.writeFile(tmp, img);
  try {
    await ffmpegWebp(tmp, out, type, lado);
  } catch (e) {
    // Antes acá decía `if (lado !== 320) console.error(e)`: el fallo de la pasada normal —la de 320— no dejaba
    // ningún rastro, y desde afuera el bot parecía simplemente no hacer nada.
    explicarFalloFfmpeg(e, type, lado);
    throw img;
  } finally {
    fs.promises.unlink(tmp).catch(() => {});
  }
  return fs.promises.readFile(out);
}

/**
 * Image/Video to webp sticker (320x320). If it weighs more than 1 MB, it is redone at 224x224.
 * @param {Buffer} img
 * @param {string} url
 */
async function sticker6(img, url) {
  const resultado = await convertirASticker(img, url, 320);
  return resultado.length > 1000000 ? sticker6_compress(img, null) : resultado;
}

/**
 * Kurt18: reducir la resolucion de 320x320 a 224x224
 */
function sticker6_compress(img, url) {
  return convertirASticker(img, url, 224);
}

/**
 * Add WhatsApp JSON Exif Metadata
 * Taken from https://github.com/pedroslopez/whatsapp-web.js/pull/527/files
 * @param {Buffer} webpSticker
 * @param {String} packname
 * @param {String} author
 * @param {String} categories
 * @param {Object} extra
 * @returns
 */
async function addExif(webpSticker, packname, author, categories = [""], extra = {}) {
  const img = new webp.Image();
  const stickerPackId = crypto.randomBytes(32).toString("hex");
  const json = {
    "sticker-pack-id": stickerPackId,
    "sticker-pack-name": packname,
    "sticker-pack-publisher": author,
    emojis: categories,
    ...extra,
  };
  const exifAttr = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  const jsonBuffer = Buffer.from(JSON.stringify(json), "utf8");
  const exif = Buffer.concat([exifAttr, jsonBuffer]);
  exif.writeUIntLE(jsonBuffer.length, 14, 4);
  await img.load(webpSticker);
  img.exif = exif;
  return await img.save(null);
}

/**
 * Image/Video to Sticker
 * @param {Buffer} img Image/Video Buffer
 * @param {String} url Image/Video URL
 * @param {...String}
 */
async function _quickTest() {
  const test = await Promise.all(
    [spawn("ffmpeg"), spawn("ffprobe"), spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-filter_complex", "color", "-frames:v", "1", "-f", "webp", "-"]), spawn("convert"), spawn("magick"), spawn("gm"), spawn("find", ["--version"])].map((p) => {
      return Promise.race([
        new Promise((resolve) => {
          p.on("close", (code) => {
            resolve(code !== 127);
          });
        }),
        new Promise((resolve) => {
          p.on("error", (_) => resolve(false));
        }),
      ]);
    })
  );
  const [ffmpeg, ffprobe, ffmpegWebp, convert, magick, gm, find] = test;
  return { ffmpeg, ffprobe, ffmpegWebp, convert, magick, gm, find };
}

async function sticker(img, url, ...args) {
  // La causa más difícil de ver desde afuera: el archivo nunca llegó. Pasa cuando download() devuelve null o
  // undefined y termina en un error de file-type que no menciona ni la descarga ni el mensaje.
  if (!url && !(img && img.length)) {
    console.error(`[sticker] ❌ no hay nada para convertir: llegó ${img === undefined ? "undefined" : img === null ? "null" : `${typeof img} de ${img?.length ?? 0} bytes`}.`);
    console.error("[sticker] ➜ CAUSA: el archivo no se pudo bajar de WhatsApp (download() vino vacío). NO es problema de ffmpeg.");
  }
  const support = await _quickTest();
  if (!support.ffmpeg) {
    console.error("[sticker] ❌ ffmpeg NO ESTÁ DISPONIBLE: no se pudo ejecutar el binario 'ffmpeg'.");
    console.error("[sticker] ➜ CAUSA: falta ffmpeg, o no está en el PATH del proceso del bot. En Termux: pkg install ffmpeg");
  }
  let lastError;
  let stiker;
  for (const func of [support.ffmpeg && sticker6].filter((f) => f)) {
    try {
      stiker = await func(img, url, ...args);
      if (stiker.includes("html")) continue;
      if (stiker.includes("WEBP")) {
        try {
          return await addExif(stiker, ...args);
        } catch (e) {
          console.error("[sticker] ⚠️ no se pudo escribir el exif; el sticker se manda igual, sin nombre de pack:", e?.message || e);
          return stiker;
        }
      }
      throw stiker.toString();
    } catch (err) {
      // Los fallos con causa ya explicada llegan acá como el buffer original (throw img); cualquier otra cosa es
      // inesperada y tiene que verse.
      if (!Buffer.isBuffer(err)) console.error("[sticker] ❌ fallo inesperado armando el sticker:", err);
      lastError = err;
      continue;
    }
  }
  return lastError;
}

const support = {
  ffmpeg: true,
  ffprobe: true,
  ffmpegWebp: true,
  convert: true,
  magick: false,
  gm: false,
  find: false,
};

export { sticker, sticker6, addExif, support };
