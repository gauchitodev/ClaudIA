import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { proto, getMediaKeys, generateForwardMessageContent } from "@whiskeysockets/baileys";
import { clienteFalso, G } from "./helpers.mjs";

// Baileys 7 leaves the protos with create(), encode() and decode(), and nothing else (docs/migration/to-v7.0.0.md):
// fromObject(), toObject() and toJSON() go. The installed release still has them, so the bot's wrapper
// (lib/wa-socket.js) runs here twice: with the protos as they are, and with what goes taken off, as a release that
// drops them would hand them over. A quote and the copy of it the bot keeps, the hidetag's forward, a reaction and a
// deletion on it, and the copies cMod() and copy() make.

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const [ANA, BETO, CARLA] = ["300000000000091@lid", "300000000000092@lid", "300000000000093@lid"];
const OTRO = "120363000000000095@g.us";
const CLAVE = Buffer.alloc(32, 7); // a photo's media key: the keys to decrypt the file derive from it

// What a release with only create(), encode() and decode() would lack, taken off every type while fn runs.
const SACADOS = ["fromObject", "toObject", "verify", "encodeDelimited", "decodeDelimited", "getTypeUrl"];
async function conProtosDeV7(fn) {
  const quitados = [];
  const vistos = new Set();
  const recorrer = (espacio) => {
    for (const tipo of Object.values(espacio)) {
      if (typeof tipo !== "function" || typeof tipo.encode !== "function" || vistos.has(tipo)) continue;
      vistos.add(tipo);
      for (const [donde, nombre] of [...SACADOS.map((n) => [tipo, n]), [tipo.prototype, "toJSON"]]) {
        if (!Object.hasOwn(donde, nombre)) continue;
        quitados.push([donde, nombre, donde[nombre]]);
        delete donde[nombre];
      }
      recorrer(tipo); // the nested types: proto.Message.ImageMessage…
    }
  };
  recorrer(proto);
  try {
    return await fn();
  } finally {
    for (const [donde, nombre, valor] of quitados) donde[nombre] = valor;
  }
}
const MUNDOS = [
  ["con los protos de hoy", (fn) => fn()],
  ["con los protos de Baileys 7", conProtosDeV7],
];

// As Baileys hands a message over: decoded from its bytes.
const deBaileys = (o) => proto.WebMessageInfo.decode(proto.WebMessageInfo.encode(o).finish());
// A photo of Beto's that mentions Carla, at a local address that refuses the connection: nothing downloads for real.
const FOTO = { imageMessage: { url: "https://127.0.0.1:9/media", directPath: "/v/foto", mimetype: "image/jpeg", caption: "la foto de Beto", mediaKey: CLAVE, fileLength: 123456, contextInfo: { mentionedJid: [CARLA] } } };
const laFoto = () => deBaileys({ key: { remoteJid: G, fromMe: false, id: "FOTO1", participant: BETO }, message: FOTO });
// Ana answering it.
const laRespuesta = () => deBaileys({ key: { remoteJid: G, fromMe: false, id: "RESPUESTA1", participant: ANA }, message: { extendedTextMessage: { text: "qué linda", contextInfo: { stanzaId: "FOTO1", participant: BETO, quotedMessage: FOTO } } } });

// A media key still works the way Baileys uses it: it derives the keys that decrypt the file (as when the anti-delete
// downloads it), and it survives the copy through its bytes Baileys makes of whatever it forwards.
async function laClaveSirve(clave, donde) {
  assert.deepEqual(await getMediaKeys(clave, "image"), await getMediaKeys(CLAVE, "image"), `${donde}: con esa clave no se descifra el archivo`);
  const reenviada = generateForwardMessageContent({ key: { fromMe: false }, message: { imageMessage: { mediaKey: clave } } }, false);
  assert.deepEqual(Buffer.from(reenviada.imageMessage.mediaKey), CLAVE, `${donde}: la clave se pierde al reenviarla`);
}

let WS, client;
const enviados = [];
before(async () => {
  WS = await import("../lib/wa-socket.js");
  WS.serialize();
  const crearReal = WS._dep.crearSocket;
  WS._dep.crearSocket = () => ({ ...clienteFalso(), user: { id: "59800000001:5@s.whatsapp.net", lid: "200000000000001@lid" }, ev: { emit() {}, on() {} } });
  try {
    client = WS.makeWASocket({});
  } finally {
    WS._dep.crearSocket = crearReal;
  }
  client.chats[G] = { id: G, subject: "Familia", metadata: { id: G, subject: "Familia", participants: [] } };
  client.sendMessage = async (chat, contenido) => enviados.push({ chat, contenido });
});

test("el simulacro le saca a cada proto lo que Baileys 7 saca, y después se lo devuelve", async () => {
  const { ImageMessage } = proto.Message;
  await conProtosDeV7(() => {
    for (const tipo of [proto.WebMessageInfo, proto.MessageKey, ImageMessage, proto.ContextInfo]) {
      assert.deepEqual([typeof tipo.fromObject, typeof tipo.toObject, typeof tipo.prototype.toJSON], ["undefined", "undefined", "undefined"]);
      assert.deepEqual([typeof tipo.create, typeof tipo.encode, typeof tipo.decode], ["function", "function", "function"]);
    }
  });
  assert.equal(typeof ImageMessage.fromObject, "function");
  assert.equal(typeof ImageMessage.prototype.toJSON, "function");
});

for (const [mundo, en] of MUNDOS) {
  test(`lo que guarda el bot se puede bajar y reenviar: la foto, y la que vino citada (${mundo})`, () =>
    en(async () => {
      for (const id of Object.keys(client.chats)) if (id !== G) delete client.chats[id];
      delete client.chats[G].messages;
      await client.pushMessage(laFoto());
      await client.pushMessage(laRespuesta());
      // As the anti-delete brings it back when Beto deletes it.
      const borrada = client.serializeM(client.loadMessage("FOTO1", G));
      assert.equal(borrada.message.imageMessage.caption, "la foto de Beto");
      await laClaveSirve(borrada.message.imageMessage.mediaKey, "la foto guardada");
      // The quoted copy, under its author.
      const citada = client.chats[BETO].messages.FOTO1.message.imageMessage;
      assert.deepEqual(citada.contextInfo.mentionedJid, [CARLA]);
      await laClaveSirve(citada.mediaKey, "la copia de la cita");
    }));

  test(`m.quoted trae la cita como vino, y su fakeObj, su reacción y su borrado apuntan a ella (${mundo})`, () =>
    en(async () => {
      const m = WS.smsg(client, laRespuesta());
      assert.deepEqual([m.quoted.mtype, m.quoted.mimetype, m.quoted.text, m.quoted.sender], ["imageMessage", "image/jpeg", "la foto de Beto", BETO]);
      assert.deepEqual(m.quoted.contextInfo.mentionedJid, [CARLA], ".ttp y .tts nombran a los que menciona");
      await laClaveSirve(m.quoted.mediaKey, "m.quoted");

      const { key, participant } = m.quoted.fakeObj;
      assert.deepEqual([key.remoteJid, key.id, key.fromMe, participant], [G, "FOTO1", false, BETO]);
      // What sendMessage({ forward }) does with it when .ht answers the photo.
      const reenviada = generateForwardMessageContent(m.quoted.fakeObj, false).imageMessage;
      assert.deepEqual([reenviada.caption, reenviada.contextInfo.isForwarded], ["la foto de Beto", true]);
      await laClaveSirve(reenviada.mediaKey, "lo que reenvía .ht");

      enviados.length = 0;
      await m.quoted.react("👍");
      await m.quoted.delete(); // what .kick does to the message it answers
      const reaccion = enviados[0].contenido.react;
      assert.deepEqual([reaccion.text, reaccion.key.remoteJid, reaccion.key.id], ["👍", G, "FOTO1"]);
      assert.deepEqual(enviados[1].contenido, { delete: { remoteJid: G, fromMe: false, id: "FOTO1", participant: BETO } });
    }));

  test(`cMod() y copy() hacen copias que se pueden mandar, sin tocar el original (${mundo})`, () =>
    en(async () => {
      const m = WS.smsg(client, laRespuesta());
      const original = m.quoted.vM;
      const cambiado = client.cMod(OTRO, original, "otro texto", BETO, { mentions: ANA });
      assert.deepEqual([cambiado.key.remoteJid, cambiado.key.fromMe, cambiado.message.imageMessage.caption], [OTRO, false, "otro texto"]);
      assert.deepEqual(cambiado.message.imageMessage.contextInfo.mentionedJid, [ANA]);
      await laClaveSirve(cambiado.message.imageMessage.mediaKey, "cMod");
      assert.deepEqual([original.key.remoteJid, original.message.imageMessage.caption], [G, "la foto de Beto"], "el original, como estaba");
      assert.ok(proto.WebMessageInfo.encode(cambiado).finish().length > 0);

      const copia = m.copy();
      assert.deepEqual([copia.key.id, copia.text, copia.quoted.id], ["RESPUESTA1", "qué linda", "FOTO1"]);
      copia.message.extendedTextMessage.text = "otra cosa";
      assert.equal(m.text, "qué linda", "cambiar la copia no toca el mensaje");
      const citada = m.quoted.copy(); // it threw: it asked for a client its scope doesn't have
      assert.deepEqual([citada.key.id, citada.participant, citada.mtype], ["FOTO1", BETO, "imageMessage"]);
      await laClaveSirve(citada.message.imageMessage.mediaKey, "m.quoted.copy()");
    }));
}

// What the simulation can't run: copyNForward() ends in Baileys' own generateWAMessageFromContent, which still uses
// fromObject() in this release. And any new spot that copies a message some other way.
test("consistencia: el bot no usa lo que Baileys 7 les saca a los protos, y copia los mensajes de una sola manera", () => {
  const archivos = (carpeta) =>
    fs
      .readdirSync(path.join(RAIZ, carpeta))
      .filter((f) => /\.m?js$/.test(f))
      .map((f) => path.join(RAIZ, carpeta, f));
  const usos = [];
  for (const archivo of [...archivos("."), ...archivos("lib"), ...archivos("plugins"), ...archivos("test")]) {
    fs.readFileSync(archivo, "utf8")
      .split("\n")
      .forEach((linea, i) => {
        if (!/^\s*\/\//.test(linea) && /\.(fromObject|toObject|toJSON)\(/.test(linea)) usos.push(`${path.relative(RAIZ, archivo)}:${i + 1}`);
      });
  }
  assert.deepEqual(usos, [], `usan lo que Baileys 7 les saca a los protos (create, encode y decode es lo que queda):\n${usos.join("\n")}`);

  // In lib/wa-socket.js, every copy through JSON goes with BufferJSON (copiaJSON): one without it works today, and
  // stops working the day the protos lose toJSON().
  const sinBufferJSON = fs
    .readFileSync(path.join(RAIZ, "lib/wa-socket.js"), "utf8")
    .split("\n")
    .flatMap((linea, i) => (/JSON\.stringify\(/.test(linea) && !/BufferJSON\.replacer/.test(linea) ? [`lib/wa-socket.js:${i + 1}`] : []));
  assert.deepEqual(sinBufferJSON, [], `copian por JSON sin BufferJSON:\n${sinBufferJSON.join("\n")}`);
});
