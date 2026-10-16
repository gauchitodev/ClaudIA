// Image compositing with jimp 1.x: cards over the profile picture, circular flag, text stickers, resizing and the
// bot's own profile picture. The plugins only work out who and what to send; everything pixel-related lives here, so
// it can be tested with generated images and no network. Each plugin used to pull in jimp 0.16 (jimp-legacy) itself.
import { Jimp, JimpMime, BlendMode, ResizeStrategy, loadFont, measureText, measureTextHeight, cssColorToHex, intToRGBA } from "jimp";
import { pedirHttp } from "./http.js";

const FUENTE = `${import.meta.dirname}/../resources/BebasNeue.fnt`;
let fuente = null;
export async function fuenteBebas() {
  fuente ??= await loadFont(FUENTE);
  return fuente;
}

// A buffer, a local path or a URL. URLs are fetched with the core client, which copes better with fussy sites.
export async function leerImagen(origen) {
  if (Buffer.isBuffer(origen) || origen instanceof ArrayBuffer) return Jimp.read(origen);
  if (/^https?:\/\//i.test(origen)) {
    const res = await pedirHttp(origen, { timeoutMs: 20000 });
    if (!res.ok) throw new Error(`no pude bajar la imagen (${res.status}): ${origen}`);
    return Jimp.read(Buffer.from(await res.arrayBuffer()));
  }
  return Jimp.read(origen);
}

// ---------- tarjetas ----------
// A layer (flag, stamp) over the photo, with opacity and scale; the layer ends up centred. JPEG.
export async function superponer(foto, capa, { opacidad = 1, escala = 1 } = {}) {
  const base = await leerImagen(foto);
  const encima = await leerImagen(capa);
  const w = Math.max(1, Math.round(base.width * escala));
  const h = Math.max(1, Math.round(base.height * escala));
  encima.resize({ w, h });
  if (opacidad < 1) encima.opacity(opacidad);
  base.composite(encima, Math.round((base.width - w) / 2), Math.round((base.height - h) / 2), { mode: BlendMode.SRC_OVER });
  return base.getBuffer(JimpMime.jpeg);
}

// Hot licence: the photo at a third of the width, slightly rotated, shifted left of the card's centre. JPEG.
export async function licenciaHot(foto, tarjeta) {
  const carta = await leerImagen(tarjeta);
  const cara = await leerImagen(foto);
  cara.resize({ w: Math.max(1, Math.round(carta.width / 3)) });
  cara.rotate(3);
  const x = Math.round((carta.width - cara.width) / 2 - 200);
  const y = Math.round((carta.height - cara.height) / 2 + 10);
  carta.composite(cara, x, y, { mode: BlendMode.SRC_OVER });
  return carta.getBuffer(JimpMime.jpeg);
}

// The photo cropped to a circle, with the flag (transparency included) on top. PNG.
export async function banderaCircular(foto, bandera) {
  const capa = await leerImagen(bandera);
  const lado = Math.min(capa.width, capa.height);
  const cara = await leerImagen(foto);
  cara.resize({ w: lado, h: lado });
  const mascara = new Jimp({ width: lado, height: lado, color: 0x00000000 });
  const radio = lado / 2;
  mascara.scan((x, y, idx) => {
    const dentro = Math.sqrt((x - radio) ** 2 + (y - radio) ** 2) < radio;
    const v = dentro ? 255 : 0;
    mascara.bitmap.data[idx] = v;
    mascara.bitmap.data[idx + 1] = v;
    mascara.bitmap.data[idx + 2] = v;
    mascara.bitmap.data[idx + 3] = v;
  });
  cara.mask({ src: mascara, x: 0, y: 0 });
  const fondo = new Jimp({ width: lado, height: lado, color: 0x00000000 });
  fondo.composite(cara, 0, 0);
  fondo.composite(capa, 0, 0, { mode: BlendMode.SRC_OVER });
  return fondo.getBuffer(JimpMime.png);
}

// ---------- texto ----------
// Spreads the words over even lines: up to 6 words on a square grid, longer ones at an ideal width.
export function partirEnLineas(texto) {
  const teks = String(texto || "").toUpperCase().trim();
  const words = teks.split(" ").filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  if (words.length <= 6) {
    const rows = Math.ceil(Math.sqrt(words.length));
    const perRow = Math.ceil(words.length / rows);
    for (let i = 0; i < words.length; i += perRow) lines.push(words.slice(i, i + perRow).join(" "));
  } else {
    const wrapLength = Math.max(10, Math.floor(Math.sqrt(teks.length * 1.3)) + 5);
    let current = "";
    for (const word of words) {
      if (`${current} ${word}`.trim().length > wrapLength) {
        lines.push(current.trim());
        current = word;
      } else current += ` ${word}`;
    }
    if (current) lines.push(current.trim());
  }
  return lines;
}

// The lines centred on a transparent canvas of width × height, scaled to fit with a margin.
export async function imagenDeTexto(lineas, { ancho = 500, alto = 500 } = {}) {
  const font = await fuenteBebas();
  const alturas = lineas.map((l) => measureTextHeight(font, l, 1000));
  const anchoTexto = Math.max(1, ...lineas.map((l) => measureText(font, l)));
  const texto = new Jimp({ width: anchoTexto + 20, height: alturas.reduce((a, b) => a + b, 0) + 20, color: 0x00000000 });
  let y = 0;
  lineas.forEach((l, i) => {
    texto.print({ font, x: Math.round((texto.width - measureText(font, l)) / 2), y, text: l });
    y += alturas[i];
  });
  texto.autocrop();
  texto.scaleToFit({ w: ancho - 40, h: alto - 40 });
  const lienzo = new Jimp({ width: ancho, height: alto, color: 0x00000000 });
  lienzo.composite(texto, Math.round((ancho - texto.width) / 2), Math.round((alto - texto.height) / 2));
  return lienzo;
}

// Text stickers (.ttp, .ttp2) are drawn by jimp, synchronously, on a canvas as wide as the text: 300 letters held the
// whole bot for several seconds, and a thousand for over a minute. The plugins refuse longer ones; this cuts them too.
export const MAX_LETRAS_STICKER = 80;
const paraSticker = (texto) => partirEnLineas(String(texto).slice(0, MAX_LETRAS_STICKER));

export async function stickerDeTexto(texto) {
  return (await imagenDeTexto(paraSticker(texto))).getBuffer(JimpMime.png);
}

// Frames of the RGB sticker: the same text, each frame in a colour of the rainbow. One PNG each.
export async function cuadrosArcoiris(texto, cantidad = 16) {
  const base = await imagenDeTexto(paraSticker(texto));
  const cuadros = [];
  for (let i = 0; i < cantidad; i++) {
    const { r, g, b } = intToRGBA(cssColorToHex(`hsl(${(i / cantidad) * 360}, 100%, 50%)`));
    const cuadro = base.clone();
    cuadro.scan((x, y, idx) => {
      if (cuadro.bitmap.data[idx + 3] > 10) {
        cuadro.bitmap.data[idx] = r;
        cuadro.bitmap.data[idx + 1] = g;
        cuadro.bitmap.data[idx + 2] = b;
      }
    });
    cuadros.push(await cuadro.getBuffer(JimpMime.png));
  }
  return cuadros;
}

// ---------- utilidades ----------
// An image's width and height from its header, without decoding it: PNG and JPEG, null for anything else. jimp decodes
// a PNG with no size limit, and a 243 KB file 8000 pixels a side took 800 MB and held the bot for seconds.
export function dimensionesImagen(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24) return null;
  // PNG: the IHDR chunk comes first, with the width and height as 32-bit numbers.
  if (buf.readUInt32BE(0) === 0x89504e47 && buf.toString("ascii", 12, 16) === "IHDR") return { ancho: buf.readUInt32BE(16), alto: buf.readUInt32BE(20) };
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  // JPEG: segment after segment up to a frame header (SOF0 to SOF15; C4, C8 and CC are other things).
  for (let i = 2; i + 9 < buf.length; ) {
    if (buf[i] !== 0xff) return null;
    const marca = buf[i + 1];
    if (marca === 0xff) {
      i++; // fill byte
      continue;
    }
    if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) return { alto: buf.readUInt16BE(i + 5), ancho: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

export async function redimensionar(imagen, ancho, alto) {
  const img = await leerImagen(imagen);
  img.resize({ w: ancho, h: alto });
  return img.getBuffer(JimpMime.png);
}

// A profile picture to upload: scaled so the longer side measures "lado". JPEG.
export async function fotoDePerfil(imagen, lado = 720) {
  const img = await leerImagen(imagen);
  const factor = lado / Math.max(img.width, img.height);
  img.resize({ w: Math.max(1, Math.floor(img.width * factor)), h: Math.max(1, Math.floor(img.height * factor)), mode: ResizeStrategy.BILINEAR });
  return img.getBuffer(JimpMime.jpeg);
}
