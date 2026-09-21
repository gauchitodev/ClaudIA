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

export async function stickerDeTexto(texto) {
  return (await imagenDeTexto(partirEnLineas(texto))).getBuffer(JimpMime.png);
}

// Frames of the RGB sticker: the same text, each frame in a colour of the rainbow. One PNG each.
export async function cuadrosArcoiris(texto, cantidad = 16) {
  const base = await imagenDeTexto(partirEnLineas(texto));
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
