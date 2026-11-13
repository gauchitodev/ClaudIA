// .qr: turns a text or a link into a QR code image, or the text of the message it answers. Self-contained: it reuses
// the encoder qrcode-terminal already brings (main.js prints the login code with it; no new dependency) and draws the
// modules with jimp, black squares on white with the 4-module quiet zone scanners need. That encoder writes one byte
// per character, so the text goes in as its UTF-8 bytes (one "latin1" character per byte); otherwise an "ñ" or an emoji
// would come out garbled. It's loaded from the package's vendor/ folder, which isn't its public API: if an update moved
// it, this plugin wouldn't load, and the tests would say so.
import { createRequire } from "node:module";
import { Jimp, JimpMime } from "jimp";
import { conNombres, sinMenciones } from "../lib/menciones.js";

const requerir = createRequire(import.meta.url);
const QRCode = requerir("qrcode-terminal/vendor/QRCode");
const NIVEL = requerir("qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel");

const plugin = {};
plugin.cmd = ["qr"];
plugin.botAdmin = true;

// The limit counts characters as people see them, an emoji with its skin tone or a flag being one, and it caps the
// bytes too, which are what fills a code: 500 letters fit, and 500 emojis, of four bytes or more each, don't. 1500
// bytes is version 32 of 40 at level M, what the limit of 500 UTF-16 units this plugin had came to at worst (500 "€");
// that one counted an emoji as two. The caption shows up to RESUMEN characters, whole ones: cut by UTF-16 units, an
// emoji came out halved, a "�".
export const QR = { MAX_CARACTERES: 500, MAX_BYTES: 1500, RESUMEN: 60, MODULO: 12, MARGEN: 4, LADO_MAXIMO: 1000 };

const GRAFEMAS = new Intl.Segmenter("es", { granularity: "grapheme" });
const caracteres = (texto) => Array.from(GRAFEMAS.segment(texto), ({ segment }) => segment);

// The image: each module a square of "modulo" pixels, 12 for most codes and fewer for the big ones, so the side stays
// under LADO_MAXIMO. Drawing holds the whole bot, nothing else gets answered meanwhile, and jimp's PNG takes about as
// long as the pixels it has: at 12 the largest code the limit lets in, 1836 px, took 1.85 s, and at 918 px 0.46 s; it
// still reads after a strong JPEG compression, as WhatsApp may apply. Each line of modules is drawn once, as a line of
// pixels, and copied "modulo" times: a callback per pixel took five times longer. The 32-bit view needs the bitmap at
// a multiple of 4 bytes, and jimp makes it with Buffer.alloc, which starts at 0 (allocUnsafe could take it from the
// shared pool, at any offset). Returns the PNG, the modules a side, the pixels a module and the pixels a side.
const BLANCO = 0xffffffff;
const NEGRO = new Uint32Array(new Uint8Array([0, 0, 0, 255]).buffer)[0]; // the RGBA bytes 0 0 0 255, in this CPU's order
export async function codigoQR(texto) {
  const qr = new QRCode(-1, NIVEL.M);
  qr.addData(Buffer.from(String(texto), "utf8").toString("latin1"));
  qr.make();
  const n = qr.getModuleCount();
  const modulo = Math.min(QR.MODULO, Math.floor(QR.LADO_MAXIMO / (n + 2 * QR.MARGEN)));
  const lado = (n + 2 * QR.MARGEN) * modulo;
  const img = new Jimp({ width: lado, height: lado, color: BLANCO });
  const pixeles = new Uint32Array(img.bitmap.data.buffer, img.bitmap.data.byteOffset, lado * lado);
  const linea = new Uint32Array(lado);
  for (let fila = 0; fila < n; fila++) {
    linea.fill(BLANCO);
    for (let columna = 0; columna < n; columna++) {
      if (qr.isDark(fila, columna)) linea.fill(NEGRO, (QR.MARGEN + columna) * modulo, (QR.MARGEN + columna + 1) * modulo);
    }
    for (let y = (QR.MARGEN + fila) * modulo, hasta = y + modulo; y < hasta; y++) pixeles.set(linea, y * lado);
  }
  return { png: await img.getBuffer(JimpMime.png), n, modulo, lado };
}

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  // Mentions go in as names, the way .ttp draws them (conNombres, lib/menciones.js): in the text they're the digits of
  // a LID, which only the admins get to see (.id), and a code would hand them to whoever scans it. With no text, the
  // message it answers, with that message's own mentions.
  const texto = (text ? conNombres(text, m.mentionedJid) : conNombres(m.quoted?.text || "", m.quoted?.contextInfo?.mentionedJid)).trim();
  if (!texto) return client.sendText(m.chat, `Escribí el texto o el link: ${usedPrefix}${command} https://ejemplo.com\nO respondé a un mensaje con ${usedPrefix}${command}.`, m);
  const letras = caracteres(texto);
  if (letras.length > QR.MAX_CARACTERES || Buffer.byteLength(texto) > QR.MAX_BYTES) {
    return client.sendText(m.chat, `Es muy largo para un QR: entran hasta ${QR.MAX_CARACTERES} caracteres, menos si lleva muchos emojis (el tuyo tiene ${letras.length}).`, m);
  }

  m.react("⏳");
  try {
    const { png } = await codigoQR(texto);
    // The caption shows what the code says, its start if it's long, with no "@<digits>" left (sinMenciones): sendFile
    // tags whoever those digits are (parseMention, lib/wa-socket.js), and .qr with four mentions tagged three people
    // and a fourth that was nobody, cut off. A number typed by hand stays in the code as it was typed.
    const visible = caracteres(sinMenciones(texto));
    const resumen = visible.length > QR.RESUMEN ? `${visible.slice(0, QR.RESUMEN - 3).join("")}...` : visible.join("");
    await client.sendFile(m.chat, png, "qr.png", `📱 ${resumen}`, m);
  } catch (err) {
    console.error(err);
    client.sendText(m.chat, "No me salió el QR. Probá de nuevo en un rato.", m);
  }
};

export default plugin;
