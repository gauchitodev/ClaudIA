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
    spawn("ffmpeg", args)
      .on("error", reject)
      .on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg terminó con código ${code}`))));
  });
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
  if (type.ext === "bin") throw img;
  const tmp = path.join(import.meta.dirname, `../tmp/${Date.now()}.${type.ext}`);
  const out = `${tmp}.webp`;
  await fs.promises.writeFile(tmp, img);
  try {
    await ffmpegWebp(tmp, out, type, lado);
  } catch (e) {
    if (lado !== 320) console.error(e);
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
  const support = await _quickTest();
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
          console.error(e);
          return stiker;
        }
      }
      throw stiker.toString();
    } catch (err) {
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
