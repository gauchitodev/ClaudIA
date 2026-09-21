import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";
import webp from "node-webpmux";
import { spawn } from "child_process";

// Image or video to webp with ffmpeg. It used to use fluent-ffmpeg, which is abandoned; the command line is the same
// one that library built (with a single -i, which it repeated). "lado" is the square's size: 320 normally, 224 to
// compress when the sticker goes over 1 MB.
function ffmpegWebp(tmp, out, type, lado) {
  const filtro = `scale='min(${lado},iw)':min'(${lado},ih)':force_original_aspect_ratio=decrease,fps=15, pad=${lado}:${lado}:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse`;
  const args = [...(/video/i.test(type.mime) ? ["-f", type.ext] : []), "-i", tmp, "-y", "-vcodec", "libwebp", "-vf", filtro, "-f", "webp", out];
  return new Promise((resolve, reject) => {
    const proceso = spawn("ffmpeg", args);
    // Without this the real reason was lost and only the exit code remained, which says nothing. ffmpeg explains on
    // stderr whether it's missing the encoder, doesn't understand the format, or the file arrived truncated.
    let salidaError = "";
    proceso.stderr?.on("data", (d) => {
      if (salidaError.length < 4000) salidaError += d;
    });
    proceso.on("error", (e) => reject(Object.assign(e, { motivo: e.code === "ENOENT" ? "no-instalado" : "no-arranca" })));
    proceso.on("close", (code) => (code === 0 ? resolve() : reject(Object.assign(new Error(`ffmpeg salió con código ${code}`), { motivo: "fallo", stderr: salidaError.trim() }))));
  });
}

// Turns an ffmpeg failure into a concrete, actionable cause. The idea is that the log alone should be enough:
// whoever reads it (or sends a screenshot) shouldn't have to run anything to find out what happened.
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
  // As always: if it isn't an image or a video, or ffmpeg fails, it rejects with the original image, and sticker()
  // returns it untouched so the plugin sends the photo instead of nothing.
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
    // This used to read `if (lado !== 320) console.error(e)`: a failure on the normal pass —the 320 one— left no
    // trace at all, and from the outside the bot simply looked like it was doing nothing.
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
  // The hardest cause to spot from outside: the file never arrived. It happens when download() returns null or
  // undefined and ends up as a file-type error that mentions neither the download nor the message.
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
      // Failures whose cause was already explained arrive here as the original buffer (throw img); anything else is
      // unexpected and has to be visible.
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
