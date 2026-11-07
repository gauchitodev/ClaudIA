import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { partirTexto, sintetizar, _dep, TTS } from "../lib/tts.js";
import { prepararBase, clienteFalso } from "./helpers.mjs";
import strings from "../lib/strings.js";

// The database is for .tts, which reads mentions out as names (lib/menciones.js).
before(async () => {
  await prepararBase("tts");
});

test("tts: parte el texto como node-gtts y concatena los pedazos de audio", async () => {
  assert.deepEqual(partirTexto("Hola, ¿cómo andás? Todo bien."), ["Hola cómo andás Todo bien"]);
  const largo = Array.from({ length: 40 }, (_, i) => `palabra${i}`).join(" ");
  const pedazos = partirTexto(largo);
  assert.ok(pedazos.length > 1 && pedazos.every((p) => p.length < TTS.MAX_CHARS), `pedazos: ${pedazos.map((p) => p.length)}`);
  assert.equal(pedazos.join(" "), largo, "no se pierde ninguna palabra");
  assert.deepEqual(partirTexto(""), []);
  const urls = [];
  _dep.pedir = async (url) => {
    urls.push(url);
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([urls.length]).buffer };
  };
  const audio = await sintetizar(largo, "es");
  assert.equal(urls.length, pedazos.length);
  assert.match(urls[0], /tl=es&q=palabra0%20palabra1.*&total=\d+&idx=0&client=tw-ob&textlen=\d+$/);
  assert.deepEqual([...audio], urls.map((_, i) => i + 1), "un byte por pedazo, en orden");
  await assert.rejects(sintetizar("", "es"), /No hay texto/);
  _dep.pedir = async () => ({ ok: false, status: 429 });
  await assert.rejects(sintetizar("hola", "es"), /Google respondió 429/);
});

test("consistencia: ningún audio sale con una duración inventada", () => {
  // SawBot sent voice notes with seconds: "9999999999999". WhatsApp keeps 32 bits of it and shows what's left over the
  // whole days: a single word came out as a 1:01:51 voice note. Without the option, Baileys measures the audio. A
  // merge that brings back an old copy of these plugins would bring the number back without anything failing.
  const carpetas = ["../plugins/", "../lib/"].map((c) => new URL(c, import.meta.url));
  const archivos = carpetas.flatMap((c) => fs.readdirSync(c).filter((f) => f.endsWith(".js")).map((f) => new URL(f, c)));
  assert.ok(archivos.length > 100, `se encontraron muy pocos archivos (${archivos.length}): el escaneo no está andando`);
  const inventadas = [];
  for (const archivo of archivos) {
    fs.readFileSync(archivo, "utf8")
      .split("\n")
      .forEach((linea, i) => {
        if (/\bseconds\s*:\s*["'`]?\d/.test(linea)) inventadas.push(`${archivo.pathname.split("/").slice(-2).join("/")}:${i + 1}`);
      });
  }
  assert.deepEqual(inventadas, [], `la duración del audio la mide Baileys; no hay que pasarle seconds:\n${inventadas.join("\n")}`);
});

// .tts reads text: what's typed after it, or the message it replies to. Replying to an audio, someone's voice note, it
// answered it with an audio of whatever was typed, and with nothing typed asked for a text: it says it's for text and
// reads nothing. The replies are real ones, through the bot's own wrapper (smsg), as handle-message gets them: a voice
// note, a view-once one, and a text and a photo, which go as before.
test(".tts: solo con texto; respondiendo un audio no lee nada", async () => {
  const { proto } = await import("@whiskeysockets/baileys");
  const WS = await import("../lib/wa-socket.js");
  const Tts = (await import("../plugins/convert-text-to-ptt.js")).default;
  WS.serialize();
  const crearReal = WS._dep.crearSocket;
  WS._dep.crearSocket = () => ({
    ...clienteFalso(),
    user: { id: "59800000001:5@s.whatsapp.net", lid: "200000000000001@lid" },
    ev: { emit() {}, on() {} },
    groupFetchAllParticipating: async () => ({}),
    groupMetadata: async (id) => ({ id, subject: "Grupo", participants: [] }),
  });
  let client;
  try {
    client = WS.makeWASocket({});
  } finally {
    WS._dep.crearSocket = crearReal;
  }
  const leido = [];
  _dep.pedir = async (url) => {
    leido.push(new URL(url).searchParams.get("q"));
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1]).buffer };
  };
  const enviados = [];
  const cliente = { sendPresenceUpdate: async () => {}, sendText: async (chat, text) => enviados.push({ text }), sendFile: async (chat, archivo, nombre) => enviados.push({ archivo: nombre }) };
  let n = 0;
  // Ana replies to one of Beto's messages with the command: what Google was asked to read, and what she got.
  const tts = async (comando, citado) => {
    const msg = {
      key: { remoteJid: "120363000000000001@g.us", fromMe: false, id: `TTS${++n}`, participant: "300000000000002@lid" },
      message: proto.Message.decode(proto.Message.encode({ extendedTextMessage: { text: comando, contextInfo: { stanzaId: `CITADO${n}`, participant: "300000000000003@lid", quotedMessage: citado } } }).finish()),
    };
    const guardando = client.pushMessage(msg); // not awaited before smsg, as in handle-message
    const m = WS.smsg(client, msg);
    await guardando;
    leido.length = 0;
    enviados.length = 0;
    const args = comando.split(" ").slice(1);
    await Tts.run(m, { client: cliente, args, text: args.join(" ") });
    return { leido: [...leido], enviados: [...enviados] };
  };
  const nota = { audioMessage: { url: "https://mmg.whatsapp.net/v/nota.enc", mimetype: "audio/ogg; codecs=opus", seconds: 4, ptt: true, directPath: "/v/nota.enc", mediaKey: new Uint8Array(32), fileLength: 1000 } };
  const foto = { imageMessage: { url: "https://mmg.whatsapp.net/v/foto.enc", mimetype: "image/jpeg", caption: "una foto", directPath: "/v/foto.enc", mediaKey: new Uint8Array(32) } };
  const soloTexto = { leido: [], enviados: [{ text: strings.textToPTTAudio }] };
  assert.deepEqual(await tts(".tts", nota), soloTexto, "una nota de voz");
  assert.deepEqual(await tts(".tts hola", nota), soloTexto, "aunque se escriba un texto");
  assert.deepEqual(await tts(".tts -en hello", { viewOnceMessageV2Extension: { message: nota } }), soloTexto, "ni una de ver una vez");
  const leyo = (texto) => ({ leido: [texto], enviados: [{ archivo: "textToPTT.mp3" }] });
  assert.deepEqual(await tts(".tts", { conversation: "un texto" }), leyo("un texto"), "un texto citado, sí");
  assert.deepEqual(await tts(".tts", foto), leyo("una foto"), "y el pie de una foto");
  assert.deepEqual(await tts(".tts hola", foto), leyo("hola"), "y lo escrito, respondiendo otra cosa");
});
