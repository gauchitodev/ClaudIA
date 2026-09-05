import { dirname } from "path";
import { fileURLToPath } from "url";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import fluent_ffmpeg from "fluent-ffmpeg";
import { fileTypeFromBuffer } from "file-type";
import webp from "node-webpmux";
import fetch from "node-fetch";
import { spawn } from "child_process";
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Convert using fluent-ffmpeg
 * @param {string} img
 * @param {string} url
 */
function sticker6(img, url) {
  return new Promise((resolve, reject) => {
    (async () => {
    if (url) {
      const res = await fetch(url);
      if (res.status !== 200) throw new Error(await res.text());
      img = await res.buffer();
    }
    const type = (await fileTypeFromBuffer(img)) || {
      mime: "application/octet-stream",
      ext: "bin",
    };
    if (type.ext == "bin") return reject(img);
    const tmp = path.join(__dirname, `../tmp/${+new Date()}.${type.ext}`);
    const out = path.join(tmp + ".webp");
    await fs.promises.writeFile(tmp, img);
    // https://github.com/MhankBarBar/termux-wabot/blob/main/index.js#L313#L368
    const Fffmpeg = /video/i.test(type.mime) ? fluent_ffmpeg(tmp).inputFormat(type.ext) : fluent_ffmpeg(tmp).input(tmp);
    Fffmpeg.on("error", function (err) {
      fs.promises.unlink(tmp).catch(() => {});
      reject(img);
    })
      .on("end", async function () {
        try {
          fs.promises.unlink(tmp).catch(() => {});
          let resultSticker = await fs.promises.readFile(out);

          //Si el sticker pesa mas de 1MB
          if (resultSticker.length > 1000000) {
            //Comprimir
            resultSticker = await sticker6_compress(img, null);
          }

          resolve(resultSticker);
        } catch (e) {
          reject(e);
        }
      })
      .addOutputOptions([`-vcodec`, `libwebp`, `-vf`, `scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15, pad=320:320:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse`])
      .toFormat("webp")
      .save(out);
    // Antes un fallo acá (Tenor caído, sin carpeta tmp, etc.) quedaba como rechazo sin manejar y tumbaba el proceso.
    })().catch(reject);
  });
}

/**
 * Convert using fluent-ffmpeg
 * Kurt18: reducir la resolucion de 320x320 a 224x224
 * @param {string} img
 * @param {string} url
 */
function sticker6_compress(img, url) {
  return new Promise((resolve, reject) => {
    (async () => {
    if (url) {
      const res = await fetch(url);
      if (res.status !== 200) throw new Error(await res.text());
      img = await res.buffer();
    }
    const type = (await fileTypeFromBuffer(img)) || {
      mime: "application/octet-stream",
      ext: "bin",
    };
    if (type.ext == "bin") return reject(img);
    const tmp = path.join(__dirname, `../tmp/${+new Date()}.${type.ext}`);
    const out = path.join(tmp + ".webp");
    await fs.promises.writeFile(tmp, img);
    // https://github.com/MhankBarBar/termux-wabot/blob/main/index.js#L313#L368
    const Fffmpeg = /video/i.test(type.mime) ? fluent_ffmpeg(tmp).inputFormat(type.ext) : fluent_ffmpeg(tmp).input(tmp);
    Fffmpeg.on("error", function (err) {
      console.error(err);
      fs.promises.unlink(tmp).catch(() => {});
      reject(img);
    })
      .on("end", async function () {
        fs.promises.unlink(tmp).catch(() => {});
        fs.promises.readFile(out).then(resolve, reject);
      })
      .addOutputOptions([`-vcodec`, `libwebp`, `-vf`, `scale='min(224,iw)':min'(224,ih)':force_original_aspect_ratio=decrease,fps=15, pad=224:224:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse`])
      .toFormat("webp")
      .save(out);
    // Antes un fallo acá (Tenor caído, sin carpeta tmp, etc.) quedaba como rechazo sin manejar y tumbaba el proceso.
    })().catch(reject);
  });
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
