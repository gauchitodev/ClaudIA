// "Ver una vez" (lib/vista-unica.js): .r, .s and every command that takes a quoted file answer to one rule (the author,
// the admins and the owner; nobody else), and the anti-delete never re-posts one. The messages go through the real
// serializer (serialize/smsg in lib/wa-socket.js) as decoded protobufs, the way Baileys delivers them: a decoded
// protobuf has every field on its prototype as an enumerable null, which is what a hand-rolled check can trip on.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { proto } from "@whiskeysockets/baileys";
import strings from "../lib/strings.js";
import { serialize, smsg } from "../lib/wa-socket.js";
import { esVistaUnica } from "../lib/vista-unica.js";
import { G } from "./helpers.mjs";

globalThis.txt = strings;
serialize();

const plugins = {};
before(async () => {
  // The anti-delete imports Baileys through this global (globals.js sets it when the bot starts).
  globalThis.baileys = "@whiskeysockets/baileys";
  for (const nombre of ["recuperar-vista-unica", "sticker", "convert-to-url", "tools-change-resolution", "convert-to-mp3", "convert-to-ptt", "audio-effects", "grupo-hidetag", "_anti-delete-messages"]) {
    plugins[nombre] = (await import(`../plugins/${nombre}.js`)).default;
  }
});

// A local address that refuses the connection at once: if some code ever downloads for real, it fails fast and offline.
const MEDIA = { url: "https://127.0.0.1:9/media", mediaKey: "bWVkaWFrZXk=" };
const foto = (extra = {}) => ({ imageMessage: { mimetype: "image/jpeg", ...MEDIA, ...extra } });
const video = (extra = {}) => ({ videoMessage: { mimetype: "video/mp4", ...MEDIA, ...extra } });
const nota = (extra = {}) => ({ audioMessage: { mimetype: "audio/ogg; codecs=opus", ptt: true, ...MEDIA, ...extra } });

// Every shape a view-once can arrive in. The V1 wrapper (the one Baileys sends them in) has no flag on the media inside.
const FORMATOS = {
  "foto con viewOnce": foto({ viewOnce: true }),
  "video con viewOnce": video({ viewOnce: true }),
  "nota de voz con viewOnce": nota({ viewOnce: true }),
  V1: { viewOnceMessage: { message: foto() } },
  V2: { viewOnceMessageV2: { message: foto({ viewOnce: true }) } },
  V2Extension: { viewOnceMessageV2Extension: { message: nota({ viewOnce: true }) } },
  "efímero con V1 adentro": { ephemeralMessage: { message: { viewOnceMessage: { message: foto() } } } },
};
const DE_AUDIO = new Set(["nota de voz con viewOnce", "V2Extension"]);
const RESTRINGIDO = /solo lo pueden usar los admins/;

// Like the messages Baileys hands over: a protobuf decoded from bytes.
const decodificado = (o) => proto.Message.decode(proto.Message.encode(proto.Message.fromObject(o)).finish());

function cliente() {
  const c = { user: { lid: "bot@lid", id: "bot@s.whatsapp.net", jid: "bot@s.whatsapp.net" }, chats: { [G]: { subject: "Grupo" } }, textos: [], archivos: [], mensajes: [], descargas: 0, guardado: null };
  // Like client.downloadM (lib/wa-socket.js): an empty buffer without url/directPath; without a mediaKey, the error
  // Baileys throws (getMediaKeys). Nothing goes out to WhatsApp.
  c.downloadM = async (media) => {
    c.descargas++;
    if (!media || !(media.url || media.directPath)) return Buffer.alloc(0);
    if (!media.mediaKey?.length) throw new Error("Cannot derive from empty media key");
    return Buffer.from("contenido");
  };
  c.sendText = async (chat, texto) => c.textos.push(texto);
  c.sendFile = async (chat, archivo, nombre, caption, quoted, ptt) => c.archivos.push({ archivo, nombre, caption, ptt });
  c.sendMessage = async (chat, msg) => c.mensajes.push(msg);
  c.sendPresenceUpdate = async () => {};
  c.parseMention = () => [];
  c.loadMessage = () => c.guardado;
  c.serializeM = (msg) => smsg(c, msg);
  return c;
}

// The message that runs the command, quoting `citado`: as text, or as the caption of a photo. "de" goes in
// key.participant and "deAlt" in key.participantAlt, the sender's other format; "autor" is who sent the quoted message.
function respuesta(c, citado, { de = "caro@lid", deAlt, autor = "beto@lid", comoFoto = false, texto = ".r" } = {}) {
  const contextInfo = { stanzaId: "VO1", participant: autor, quotedMessage: citado };
  const message = comoFoto ? { imageMessage: { ...foto().imageMessage, caption: texto, contextInfo } } : { extendedTextMessage: { text: texto, contextInfo } };
  return smsg(c, { key: { remoteJid: G, fromMe: false, id: "R1", participant: de, participantAlt: deAlt }, message: decodificado(message) });
}

// Runs a plugin the way handle-message does (nobody special unless said so), keeping what it logs with console.error.
async function correr(P, m, c, permisos = {}) {
  const errores = [];
  const original = console.error;
  console.error = (...a) => errores.push(a.map(String).join(" "));
  try {
    await P.run(m, { client: c, text: "", args: [], command: P.cmd[0], usedPrefix: ".", participants: [], chat: { mentions: 1 }, isAdmin: false, isOwner: false, isMod: false, ...permisos });
  } finally {
    console.error = original;
  }
  return errores;
}

test("esVistaUnica: reconoce todos los formatos, también decodificados, y nada más", () => {
  for (const [nombre, citado] of Object.entries(FORMATOS)) {
    assert.equal(esVistaUnica(citado), true, `${nombre} (objeto plano)`);
    assert.equal(esVistaUnica(decodificado(citado)), true, `${nombre} (decodificado)`);
  }
  // A decoded photo carries viewOnceMessage on its prototype, as null: only its own fields may count.
  const fotoNormal = decodificado(foto());
  assert.ok("viewOnceMessage" in fotoNormal, "el prototipo del protobuf ya no trae todos los campos: esta prueba dejó de cubrir esa trampa");
  assert.equal(esVistaUnica(fotoNormal), false, "foto normal (decodificada)");
  assert.equal(esVistaUnica(foto()), false, "foto normal");
  assert.equal(esVistaUnica({ conversation: "hola" }), false);
  assert.equal(esVistaUnica(decodificado({ extendedTextMessage: { text: "hola" } })), false);
  assert.equal(esVistaUnica(null), false);
  assert.equal(esVistaUnica(undefined), false);
  // A photo that replied to a view-once isn't one: contextInfo is never searched.
  const respondeAUno = { imageMessage: { ...foto().imageMessage, contextInfo: { quotedMessage: FORMATOS.V1 } } };
  assert.equal(esVistaUnica(respondeAUno), false);
  assert.equal(esVistaUnica(decodificado(respondeAUno)), false);
});

test(".r: el ver una vez ajeno lo recuperan el autor, los admins y el owner; nadie más, en ningún formato", async () => {
  const R = plugins["recuperar-vista-unica"];
  for (const [nombre, citado] of Object.entries(FORMATOS)) {
    // Someone else, moderators included: the notice, and nothing gets downloaded.
    for (const permisos of [{}, { isMod: true }]) {
      const c = cliente();
      await correr(R, respuesta(c, citado), c, permisos);
      assert.equal(c.textos.length, 1, `${nombre} ${JSON.stringify(permisos)}`);
      assert.match(c.textos[0], RESTRINGIDO, nombre);
      assert.equal(c.descargas, 0, `${nombre}: no se baja nada`);
      assert.equal(c.archivos.length, 0, nombre);
    }
    const pueden = {
      "el autor (por lid)": [{ de: "beto@lid" }, {}],
      // A group addressed by number: the quote names the author by number, and the sender's lid comes in participantAlt.
      "el autor (por número)": [{ de: "59811111111@s.whatsapp.net", deAlt: "5981@lid", autor: "59811111111@s.whatsapp.net" }, {}],
      "un admin": [{}, { isAdmin: true }],
      "el owner": [{}, { isOwner: true }],
    };
    for (const [quien, [opciones, permisos]] of Object.entries(pueden)) {
      const c = cliente();
      await correr(R, respuesta(c, citado, opciones), c, permisos);
      assert.deepEqual(c.textos, [], `${nombre}, ${quien}`);
      assert.equal(c.archivos.length, 1, `${nombre}, ${quien}`);
      assert.equal(c.archivos[0].archivo.toString(), "contenido");
      if (DE_AUDIO.has(nombre)) {
        // A voice note goes through sendFile as ptt (ogg/opus), not as an audio/mpeg sendMessage.
        assert.equal(c.archivos[0].ptt, true, `${nombre}: sale como nota de voz`);
        assert.equal(c.mensajes.length, 0, `${nombre}: ningún sendMessage con el audio`);
      } else {
        assert.match(c.archivos[0].caption, /Contenido recuperado/, `${nombre}, ${quien}`);
      }
    }
  }
});

test(".r como pie de una foto que responde al ver una vez: la misma regla", async () => {
  // The old check only looked inside extendedTextMessage, so this got past it.
  const c = cliente();
  await correr(plugins["recuperar-vista-unica"], respuesta(c, FORMATOS.V2, { comoFoto: true }), c);
  assert.equal(c.textos.length, 1);
  assert.match(c.textos[0], RESTRINGIDO);
  assert.equal(c.descargas, 0);
});

test(".r: una foto normal la recupera cualquiera", async () => {
  const c = cliente();
  await correr(plugins["recuperar-vista-unica"], respuesta(c, foto()), c);
  assert.equal(c.archivos.length, 1);
  assert.match(c.archivos[0].caption, /Contenido recuperado/);
});

test(".r: si la copia citada no alcanza para bajar el archivo, lo dice en vez de mandar un archivo vacío o callarse", async () => {
  const sinDireccion = { viewOnceMessage: { message: { imageMessage: { mimetype: "image/jpeg", mediaKey: MEDIA.mediaKey } } } };
  const sinClave = { viewOnceMessage: { message: { imageMessage: { mimetype: "image/jpeg", url: MEDIA.url } } } };
  for (const [nombre, citado] of Object.entries({ sinDireccion, sinClave })) {
    const c = cliente();
    const errores = await correr(plugins["recuperar-vista-unica"], respuesta(c, citado, { de: "beto@lid" }), c);
    assert.equal(c.descargas, 1, nombre);
    assert.equal(c.archivos.length, 0, `${nombre}: no sale ningún archivo`);
    assert.equal(c.textos.length, 1, nombre);
    assert.match(c.textos[0], /No pude recuperar el archivo/, nombre);
    if (citado === sinClave) assert.match(errores.join("\n"), /\[recuperar\].*empty media key/, "el log dice por qué");
  }
});

test(".s: la misma regla que .r", async () => {
  const S = plugins.sticker;
  let c = cliente();
  await correr(S, respuesta(c, FORMATOS.V1, { texto: ".s" }), c);
  assert.equal(c.textos.length, 1);
  assert.match(c.textos[0], RESTRINGIDO);
  assert.equal(c.descargas, 0);

  // An admin gets through. Without a url the download comes back empty and .s stops there, before ffmpeg.
  c = cliente();
  const sinDireccion = { viewOnceMessage: { message: { imageMessage: { mimetype: "image/jpeg" } } } };
  const errores = await correr(S, respuesta(c, sinDireccion, { texto: ".s" }), c, { isAdmin: true });
  assert.deepEqual(c.textos, []);
  assert.equal(c.descargas, 1);
  assert.match(errores.join("\n"), /la descarga del archivo vino vacía/);
});

test("los demás comandos que toman un archivo citado respetan la misma regla", async () => {
  for (const nombre of ["convert-to-url", "tools-change-resolution", "convert-to-mp3", "convert-to-ptt", "audio-effects", "grupo-hidetag"]) {
    const P = plugins[nombre];
    for (const citado of [FORMATOS.V1, FORMATOS.V2Extension]) {
      const c = cliente();
      // A moderator: .hidetag lets them in, and moderators don't get someone else's view-once.
      await correr(P, respuesta(c, citado, { texto: `.${P.cmd[0]}` }), c, { isMod: true });
      assert.equal(c.textos.length, 1, nombre);
      assert.match(c.textos[0], RESTRINGIDO, nombre);
      assert.equal(c.descargas, 0, `${nombre}: no se baja nada`);
      assert.equal(c.mensajes.length + c.archivos.length, 0, `${nombre}: no se manda nada`);
    }
  }
});

test("anti-delete: un ver una vez borrado no se repostea; un mensaje normal, sí", async () => {
  const A = plugins["_anti-delete-messages"];
  const borrado = { chat: G, message: { protocolMessage: { type: 0, key: { id: "VO1" } } } };
  // How pushMessage keeps a quoted message: a JSON copy under its stanzaId.
  const guardado = (message) => ({ key: { remoteJid: G, fromMe: false, id: "VO1", participant: "beto@lid" }, message: JSON.parse(JSON.stringify(message)) });
  for (const [nombre, citado] of Object.entries(FORMATOS)) {
    const c = cliente();
    c.guardado = guardado(citado);
    await A.before(borrado, { client: c, chat: { antiDelete: 1 } });
    assert.equal(c.mensajes.length + c.archivos.length + c.textos.length, 0, `${nombre}: no se repostea`);
  }
  // The control: without it, a before that bailed out for any other reason would pass the loop above.
  const c = cliente();
  c.guardado = guardado({ conversation: "hola" });
  await A.before(borrado, { client: c, chat: { antiDelete: 1 } });
  assert.equal(c.mensajes.length, 1);
  assert.match(c.mensajes[0].text, /hola/);
});

test("consistencia: todo plugin que baja o reenvía un archivo citado pasa por puedeRecuperarCitado", () => {
  const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "plugins");
  // The ones that don't need it, and why. The reason is checked against the code, so it can't go stale unnoticed.
  const EXENTOS = {
    "grupo-hidetag2.js": /plugin\.onlyAdmin = true/,
    "grupo-set-pp.js": /plugin\.onlyAdmin = true/,
    "set-pp-bot.js": /plugin\.onlyOwner = true/,
    // Only stickers, which can't be sent as view-once.
    "convert-sticker-to-img.js": /\/sticker\/\.test\(mime\)/,
    "sticker-wm.js": /\/webp\/\.test\(mime\)/,
  };
  const TOMA_CITADO = /(\bq|\.quoted)\.(download|fakeObj)\b|audioParaIA\(m\.quoted/;
  const encontrados = [];
  const sinRegla = [];
  for (const archivo of fs.readdirSync(carpeta).filter((f) => f.endsWith(".js"))) {
    const codigo = fs.readFileSync(path.join(carpeta, archivo), "utf8");
    if (!TOMA_CITADO.test(codigo)) continue;
    encontrados.push(archivo);
    if (EXENTOS[archivo]) assert.match(codigo, EXENTOS[archivo], `${archivo} dejó de cumplir el motivo por el que está exento`);
    else if (!codigo.includes("puedeRecuperarCitado(")) sinRegla.push(archivo);
  }
  assert.ok(encontrados.length >= 10 && encontrados.includes("sticker.js"), `el escaneo encontró muy pocos plugins (${encontrados.length}): no está andando`);
  assert.deepEqual(sinRegla, [], `estos plugins toman un archivo citado sin pasar por puedeRecuperarCitado (lib/vista-unica.js):\n${sinRegla.join("\n")}`);
  assert.match(fs.readFileSync(path.join(carpeta, "_anti-delete-messages.js"), "utf8"), /esVistaUnica\(msg\.message\)/, "el anti-delete tiene que saltear los ver una vez");
});
