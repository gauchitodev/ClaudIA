import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";
import txt from "../lib/strings.js";

// Claudia's voice (lib/voz.js): edge-tts as a command, the text cleaned for it, the voice from config.toml, and what
// happens without the command or when it fails; .voz (plugins/voz.js) per group; and .tts with that voice when it's
// there. What the chat does with it is in auto-ia.test.mjs.
let F, V, P, Tts, TtsLib;
// A fake edge-tts: answers --version, and writes the bytes it was asked for with --write-media.
const edgeFalso = ({ falla = null, bytes = Buffer.from("MP3") } = {}) => {
  const fn = async (bin, args) => {
    fn.llamadas.push([bin, ...args]);
    if (falla) throw falla;
    if (args[0] === "--version") return { stdout: "edge-tts 7.0.0\n", stderr: "" };
    fs.writeFileSync(args.find((a) => a.startsWith("--write-media=")).slice("--write-media=".length), bytes);
    return { stdout: "", stderr: "" };
  };
  fn.llamadas = [];
  return fn;
};
const enoent = () => Object.assign(new Error("spawn edge-tts ENOENT"), { code: "ENOENT" });
before(async () => {
  ({ F } = await prepararBase("voz"));
  V = await import("../lib/voz.js");
  P = (await import("../plugins/voz.js")).default;
  Tts = (await import("../plugins/convert-text-to-ptt.js")).default;
  TtsLib = await import("../lib/tts.js");
  F.initDataDB({ chat: G, sender: "a@lid", senderJid: "", pushName: "Ana" });
});
beforeEach(() => {
  V.olvidarVoz();
  V._dep.ahora = () => Date.now();
  delete globalThis.vozConfig;
});

test("limpiarParaVoz: sin marcas, sin emojis y con los links dichos como link", () => {
  assert.equal(V.limpiarParaVoz("*Hola*, _mundo_ 😀😀 mirá https://x.com/algo y `esto` ~ya~"), "Hola, mundo mirá link y esto ya");
  assert.equal(V.limpiarParaVoz("  Dos   espacios ✨️ y familia 👨‍👩‍👧 listo "), "Dos espacios y familia listo");
  assert.equal(V.limpiarParaVoz(""), "");
});

test("hablar: llama a edge-tts con la voz de la configuración, devuelve el mp3 y limpia el temporal", async () => {
  const edge = edgeFalso({ bytes: Buffer.from("AUDIO") });
  V._dep.ejecutar = edge;
  const audio = await V.hablar("*Hola*, ¿cómo andás? 😀");
  assert.equal(String(audio), "AUDIO");
  assert.deepEqual(edge.llamadas[0], ["edge-tts", "--version"]);
  const [bin, ...args] = edge.llamadas[1];
  assert.equal(bin, "edge-tts");
  assert.deepEqual(args.slice(0, 4), ["--voice=es-AR-ElenaNeural", "--rate=+0%", "--pitch=+0Hz", "--text=Hola, ¿cómo andás?"]);
  assert.match(args[4], /^--write-media=tmp[\\/]voz_\d+_\w+\.mp3$/);
  assert.equal(args[5], "--no-progress");
  assert.ok(!fs.existsSync(args[4].slice("--write-media=".length)), "el temporal no queda");
  assert.equal(V.nombreDeLaVoz(), "Elena");
  // the voice, rate and pitch of config.toml's [voz]
  globalThis.vozConfig = { voz: "es-AR-TomasNeural", velocidad: "-10%", tono: "+5Hz" };
  await V.hablar("Hola");
  assert.deepEqual(edge.llamadas[2].slice(1, 4), ["--voice=es-AR-TomasNeural", "--rate=-10%", "--pitch=+5Hz"]);
  assert.equal(V.nombreDeLaVoz(), "Tomas");
  globalThis.vozConfig = { voz: "en-US-EmmaMultilingualNeural" };
  assert.equal(V.nombreDeLaVoz(), "Emma");
  // nothing to say, or too much: null without asking
  const antes = edge.llamadas.length;
  assert.equal(await V.hablar("😀 *_*"), null);
  assert.equal(await V.hablar("x".repeat(V.VOZ.MAX_LETRAS + 1)), null);
  assert.equal(edge.llamadas.length, antes);
  // an empty file isn't an audio: by text
  V._dep.ejecutar = edgeFalso({ bytes: Buffer.alloc(0) });
  assert.equal(await V.hablar("Hola"), null, "un mp3 vacío no es audio");
});

test("hablar: sin el comando, null y no se insiste por un rato; si falla, null y se vuelve a probar", async () => {
  let ahora = 1_000_000;
  V._dep.ahora = () => ahora;
  const sinComando = edgeFalso({ falla: enoent() });
  V._dep.ejecutar = sinComando;
  assert.equal(await V.hablar("Hola"), null);
  assert.equal(await V.hayVoz(), false);
  assert.equal(await V.hablar("Hola de nuevo"), null);
  assert.equal(sinComando.llamadas.length, 1, "una sola vez se lo buscó");
  ahora += V.VOZ.REINTENTO_MS + 1;
  assert.equal(await V.hablar("Hola"), null);
  assert.equal(sinComando.llamadas.length, 2, "pasado el rato, se lo busca de nuevo");
  // a failure of the synthesis itself: null, and the next one tries again
  V.olvidarVoz();
  let fallos = 0;
  const errorReal = console.error;
  console.error = () => {};
  try {
    V._dep.ejecutar = async (bin, args) => {
      if (args[0] === "--version") return { stdout: "edge-tts 7\n" };
      if (fallos++ === 0) throw Object.assign(new Error("Command failed"), { code: 1 });
      fs.writeFileSync(args.find((a) => a.startsWith("--write-media=")).slice("--write-media=".length), Buffer.from("OK"));
      return { stdout: "" };
    };
    assert.equal(await V.hablar("Hola"), null);
    assert.equal(await V.hayVoz(), true);
    assert.equal(String(await V.hablar("Hola")), "OK");
    // gone between the probe and the synthesis: remembered as missing, without asking again
    V.olvidarVoz();
    const seFue = edgeFalso();
    V._dep.ejecutar = async (bin, args) => (args[0] === "--version" ? seFue(bin, args) : Promise.reject(enoent()));
    assert.equal(await V.hablar("Hola"), null);
    assert.equal(await V.hayVoz(), false);
    assert.equal(seFue.llamadas.length, 1, "no se lo vuelve a buscar");
  } finally {
    console.error = errorReal;
  }
});

test(".voz: muestra cómo está; un admin la pone en on, siempre y off; avisa si edge-tts no está", async () => {
  const correr = async (args, { isAdmin = false } = {}) => {
    globalThis.enviados = [];
    await P.run({ chat: G, sender: "a@lid", isGroup: true }, { client: globalThis.client, args, isAdmin, isOwner: false });
    return ultimoEnviado().msg.text;
  };
  V._dep.ejecutar = edgeFalso();
  assert.match(await correr([]), /^🎙️ Voz en este grupo: apagada, contesto por texto\. Un admin la prende con \.voz on/);
  assert.equal(await correr(["on"]), txt.onlyAdmin);
  assert.equal(V.modoDeVoz(G), "");
  assert.equal(await correr(["on"], { isAdmin: true }), "🎙️ Listo: cuando me hablen por nota de voz, contesto con nota de voz, con la voz de Elena. Con .voz siempre hablo todo, y con .voz off vuelvo al texto.");
  assert.equal(V.modoDeVoz(G), "audios");
  assert.deepEqual([V.hablaCon(G, { notaDeVoz: true }), V.hablaCon(G, { notaDeVoz: false })], [true, false]);
  assert.match(await correr([]), /^🎙️ Voz en este grupo: cuando me hablan por nota de voz, con la voz de Elena\./);
  assert.equal(await correr(["siempre"], { isAdmin: true }), "🎙️ Listo: en este grupo contesto todo con nota de voz, con la voz de Elena. Con .voz on hablo solo cuando me hablan por nota de voz, y con .voz off vuelvo al texto.");
  assert.deepEqual([V.hablaCon(G, { notaDeVoz: true }), V.hablaCon(G, { notaDeVoz: false })], [true, true]);
  assert.match(await correr([]), /^🎙️ Voz en este grupo: siempre, con la voz de Elena\./);
  assert.match(await correr(["a", "veces"], { isAdmin: true }), /^🎙️ Listo: contesto con nota de voz cuando me hablan por nota de voz y, de vez en cuando, alguna respuesta corta/);
  assert.equal(V.modoDeVoz(G), "aveces");
  V._dep.random = () => 0.9;
  assert.deepEqual([V.hablaCon(G, { notaDeVoz: true }), V.hablaCon(G, { notaDeVoz: false })], [true, false], "con el dado alto, solo a la nota de voz");
  V._dep.random = () => 0.1;
  assert.equal(V.hablaCon(G, { notaDeVoz: false }), true, "y una de cada cuatro, por su cuenta");
  assert.deepEqual([V.maxLetrasDeVoz(G), V.maxLetrasDeVoz(G, { notaDeVoz: true })], [V.VOZ.A_VECES_MAX_LETRAS, V.VOZ.MAX_LETRAS], "por su cuenta, solo las cortas");
  assert.equal(await V.hablar("x".repeat(V.VOZ.A_VECES_MAX_LETRAS + 1), { maxLetras: V.VOZ.A_VECES_MAX_LETRAS }), null);
  V._dep.random = Math.random;
  assert.match(await correr([]), /^🎙️ Voz en este grupo: a veces, con la voz de Elena/);
  assert.equal(await correr(["off"], { isAdmin: true }), "⌨️ Listo: vuelvo a contestar por texto.");
  assert.equal(V.modoDeVoz(G), "");
  assert.match(await correr(["otra"], { isAdmin: true }), /^❌ Las opciones son \.voz on/);
  // without the command where she runs, the setting stays and she says she goes on by text meanwhile
  V._dep.ejecutar = edgeFalso({ falla: enoent() });
  V.olvidarVoz();
  assert.match(await correr(["on"], { isAdmin: true }), /\n⚠️ Ojo: donde corro todavía no está edge-tts \(pip install edge-tts\), así que mientras tanto sigo por texto\.$/);
  assert.equal(V.modoDeVoz(G), "audios");
  // whatever else the column holds reads as off
  F.updateChat(G, { voz: "cualquiera" });
  assert.equal(V.modoDeVoz(G), "");
  assert.equal(V.hablaCon(G, { notaDeVoz: true }), false);
  F.updateChat(G, { voz: "" });
});

test(".tts habla con la voz de Claudia cuando está, y con Google para otros idiomas o sin ella", async () => {
  const pedidas = [];
  TtsLib._dep.pedir = async (url) => {
    pedidas.push(new URL(url).searchParams.get("q"));
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1]).buffer };
  };
  const tts = async (args) => {
    const salidas = [];
    const client = { sendPresenceUpdate: async () => {}, sendText: async (chat, text) => salidas.push({ text }), sendFile: async (chat, archivo, nombre, caption, quoted, ptt) => salidas.push({ archivo: String(archivo), ptt }) };
    await Tts.run({ chat: G, mentionedJid: [], quoted: null }, { client, args });
    return salidas;
  };
  V._dep.ejecutar = edgeFalso({ bytes: Buffer.from("EDGE") });
  assert.deepEqual(await tts(["hola", "mundo"]), [{ archivo: "EDGE", ptt: true }]);
  assert.deepEqual(pedidas, [], "a Google no le pidió nada");
  assert.deepEqual(await tts(["-en", "hello"]), [{ archivo: "\u0001", ptt: true }], "otro idioma, Google");
  assert.deepEqual(pedidas, ["hello"]);
  V._dep.ejecutar = edgeFalso({ falla: enoent() });
  V.olvidarVoz();
  pedidas.length = 0;
  assert.deepEqual(await tts(["hola"]), [{ archivo: "\u0001", ptt: true }], "sin edge-tts, Google");
  assert.deepEqual(pedidas, ["hola"]);
});
