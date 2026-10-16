import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { proto } from "@whiskeysockets/baileys";
import { Jimp, JimpMime } from "jimp";
import strings from "../lib/strings.js";
import { serialize, smsg } from "../lib/wa-socket.js";
import { G } from "./helpers.mjs";

// Commands that work on a file could hold the whole bot (and the tablet's memory) with a big one: .s downloaded a
// 1,5 GB video sent as a document, .res decoded a PNG of 8000 pixels a side before looking at it, and .ttp drew any
// text on a canvas as wide as itself. They now refuse first, with the size and length the message itself carries.
// The quoted messages go through the real serializer, as decoded protobufs, the way Baileys delivers them.

globalThis.txt = strings;
serialize();

const plugins = {};
let MEDIA, CANVAS;
before(async () => {
  for (const nombre of ["sticker", "convert-to-mp3", "convert-to-ptt", "convert-to-url", "audio-effects", "recuperar-vista-unica", "tools-change-resolution", "sticker-ttp", "sticker-ttp2"]) {
    plugins[nombre] = (await import(`../plugins/${nombre}.js`)).default;
  }
  MEDIA = await import("../lib/tamano-media.js");
  CANVAS = await import("../lib/canvas.js");
});

const MB = 1024 * 1024;
// A local address that refuses the connection: if something ever downloaded for real, it would fail fast.
const DESCARGA = { url: "https://127.0.0.1:9/media", directPath: "/v/x", mediaKey: "bWVkaWFrZXk=" };
const decodificado = (o) => proto.Message.decode(proto.Message.encode(proto.Message.fromObject(o)).finish());

function cliente(archivo = Buffer.alloc(0)) {
  const c = { user: { lid: "bot@lid", id: "bot@s.whatsapp.net", jid: "bot@s.whatsapp.net" }, chats: {}, textos: [], descargas: 0 };
  c.downloadM = async () => {
    c.descargas++;
    return archivo;
  };
  c.sendText = async (chat, texto) => c.textos.push(texto);
  c.sendFile = async () => {};
  c.sendPresenceUpdate = async () => {};
  c.parseMention = () => [];
  return c;
}
// The command, written by its author, quoting `citado`.
const citando = (c, citado, texto) =>
  smsg(c, { key: { remoteJid: G, fromMe: false, id: "R1", participant: "beto@lid" }, message: decodificado({ extendedTextMessage: { text: texto, contextInfo: { stanzaId: "Q1", participant: "beto@lid", quotedMessage: citado } } }) });
const correr = (nombre, c, m, extra = {}) => plugins[nombre].run(m, { client: c, isAdmin: false, isOwner: false, text: "", command: nombre, usedPrefix: ".", ...extra });

test("excedeTope: lee peso y duración del mensaje, como Long o como texto", () => {
  assert.equal(MEDIA.excedeTope({ fileLength: "41943040" }, { mb: 50 }), null);
  assert.equal(MEDIA.excedeTope({ fileLength: "41943040" }, { mb: 20 }), "Ese archivo pesa 40 MB y el tope es de 20 MB.");
  assert.equal(MEDIA.excedeTope({ msg: { seconds: 3600 } }, { mb: 50, segundos: 600 }), "Ese archivo dura 1 h 0 min y el tope es de 10 min.");
  assert.equal(MEDIA.excedeTope({}, { mb: 1, segundos: 1 }), null, "sin datos no frena: no hay con qué");
});

test("los comandos de archivos frenan un archivo grande antes de bajarlo", async () => {
  const casos = [
    ["sticker", { documentMessage: { mimetype: "video/mp4", fileLength: 1_500_000_000, ...DESCARGA } }, /pesa 1431 MB y el tope es de 10 MB/],
    ["convert-to-mp3", { videoMessage: { mimetype: "video/mp4", seconds: 240, fileLength: 80 * MB, ...DESCARGA } }, /pesa 80 MB y el tope es de 50 MB/],
    ["convert-to-ptt", { audioMessage: { mimetype: "audio/ogg; codecs=opus", seconds: 3600, fileLength: 5 * MB, ...DESCARGA } }, /dura 1 h 0 min y el tope es de 10 min/],
    ["audio-effects", { audioMessage: { mimetype: "audio/mpeg", seconds: 360, fileLength: 6 * MB, ...DESCARGA } }, /dura 6 min y el tope es de 5 min/],
    ["convert-to-url", { imageMessage: { mimetype: "image/jpeg", fileLength: 30 * MB, ...DESCARGA } }, /pesa 30 MB y el tope es de 20 MB/],
    ["recuperar-vista-unica", { videoMessage: { mimetype: "video/mp4", seconds: 60, fileLength: 60 * MB, ...DESCARGA } }, /pesa 60 MB y el tope es de 50 MB/],
  ];
  for (const [nombre, citado, esperado] of casos) {
    const c = cliente();
    await correr(nombre, c, citando(c, citado, "."), { command: nombre === "audio-effects" ? "bass" : nombre });
    assert.match(c.textos.at(-1) || "", esperado, nombre);
    assert.equal(c.descargas, 0, `${nombre}: no bajó nada`);
  }
});

// A PNG that only says how big it is: the header is all .res reads before deciding.
function pngDe(ancho, alto) {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4, "ascii");
  ihdr.writeUInt32BE(ancho, 8);
  ihdr.writeUInt32BE(alto, 12);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr]);
}

test(".res: lee las dimensiones del encabezado y frena una imagen gigante sin decodificarla", async () => {
  const chica = new Jimp({ width: 30, height: 20, color: 0xff0000ff });
  assert.deepEqual(CANVAS.dimensionesImagen(await chica.getBuffer(JimpMime.png)), { ancho: 30, alto: 20 });
  assert.deepEqual(CANVAS.dimensionesImagen(await chica.getBuffer(JimpMime.jpeg)), { ancho: 30, alto: 20 });
  assert.equal(CANVAS.dimensionesImagen(Buffer.from("no es una imagen, aunque lo diga")), null);

  const imagen = { imageMessage: { mimetype: "image/png", fileLength: 300 * 1024, ...DESCARGA } };
  let c = cliente(pngDe(12000, 12000));
  const antes = Date.now();
  await correr("tools-change-resolution", c, citando(c, imagen, ".res 100"), { text: "100" });
  assert.equal(c.textos.at(-1), "Esa imagen es de 12000 x 12000: como mucho 25 megapíxeles.");
  assert.ok(Date.now() - antes < 1000, "sin decodificar 144 megapíxeles");

  c = cliente(await chica.getBuffer(JimpMime.png));
  await correr("tools-change-resolution", c, citando(c, imagen, ".res 4096"), { text: "4096" });
  assert.equal(c.textos.at(-1), "Tamaño inválido: cada lado tiene que estar entre 1 y 2048 píxeles.");
});

test(".ttp y .ttp2: un texto largo se rechaza, y la librería igual lo corta", async () => {
  for (const nombre of ["sticker-ttp", "sticker-ttp2"]) {
    const c = cliente();
    const m = { chat: G, sender: "beto@lid", react: () => {} };
    await plugins[nombre].run(m, { client: c, text: "a".repeat(CANVAS.MAX_LETRAS_STICKER + 1) });
    assert.equal(c.textos.at(-1), `Muy largo para un sticker: como mucho ${CANVAS.MAX_LETRAS_STICKER} letras.`, nombre);
  }
  // Without the cut, 5000 letters with no spaces took minutes, or blew up asking for a 2 GB buffer.
  const antes = Date.now();
  assert.ok((await CANVAS.stickerDeTexto("W".repeat(5000))).length > 0);
  assert.ok(Date.now() - antes < 15000, `tardó ${Date.now() - antes} ms`);
});

test("consistencia: ninguna descarga junta los pedazos copiando todo lo anterior en cada vuelta", () => {
  const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const acumula = /(\w+)\s*=\s*Buffer\.concat\(\[\s*\1\s*,/;
  const culpables = [];
  for (const carpeta of ["lib", "plugins"]) {
    for (const archivo of fs.readdirSync(path.join(raiz, carpeta)).filter((a) => a.endsWith(".js"))) {
      if (acumula.test(fs.readFileSync(path.join(raiz, carpeta, archivo), "utf8"))) culpables.push(`${carpeta}/${archivo}`);
    }
  }
  assert.deepEqual(culpables, [], "x = Buffer.concat([x, pedazo]) en un bucle es cuadrático: 32 MB tardaban 5 s");
});
