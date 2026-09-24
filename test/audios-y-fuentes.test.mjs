import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso } from "./helpers.mjs";
import strings from "../lib/strings.js";

// Claudia hears an audio only when it's meant for her: a voice note answering one of her messages, or an audio quoted
// while naming her. And when asked whether something is true she can look it up (a second query, with Google Search),
// answering without links unless the sources are asked for. Gemini is swapped for a fake that records each request.

let AutoIA, A, RITMO;
let clasificacion; // what the classifying query answers
let busqueda; // what the search query answers: { texto, fuentes } or null to fail
let pedidos = []; // the bodies Gemini got
const fetchReal = globalThis.fetch;
const logReal = console.log;
const errorReal = console.error;
const tipeoReal = {};

before(async () => {
  await prepararBase("audios");
  globalThis.txt = strings;
  globalThis.geminiApiKey = "clave";
  ({ RITMO } = await import("../lib/ritmo.js"));
  for (const k of ["TIPEO_MIN_MS", "TIPEO_MAX_MS", "TIPEO_POR_LETRA_MS"]) tipeoReal[k] = RITMO[k];
  Object.assign(RITMO, { TIPEO_MIN_MS: 0, TIPEO_MAX_MS: 1, TIPEO_POR_LETRA_MS: 0 });
  console.log = () => {};
  console.error = () => {};
  globalThis.fetch = async (url, opciones = {}) => {
    if (opciones.method === "HEAD") return { headers: { get: () => "https://www.montevideo.com.uy/nota" } };
    const body = JSON.parse(opciones.body);
    pedidos.push(body);
    if (body.tools) {
      if (!busqueda) return { ok: false, status: 500, text: async () => "" };
      const chunks = busqueda.fuentes.map((f) => ({ web: { uri: f.url, title: f.titulo } }));
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: busqueda.texto }] }, groundingMetadata: { groundingChunks: chunks } }] }) };
    }
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(clasificacion) }] } }] }) };
  };
  AutoIA = (await import("../plugins/_auto-ia.js")).default;
  A = await import("../lib/audios.js");
  globalThis.plugins = {};
});
after(() => {
  globalThis.fetch = fetchReal;
  console.log = logReal;
  console.error = errorReal;
  Object.assign(RITMO, tipeoReal);
});

const C = "audios@g.us";
const AUDIO = Buffer.from("OggS audio de prueba");
const audioCitado = (extra = {}) => ({ id: "AUD-1", mtype: "audioMessage", mediaType: "audioMessage", fromMe: false, text: "", seconds: 12, mimetype: "audio/ogg; codecs=opus", download: async () => AUDIO, ...extra });

async function mandar(m) {
  globalThis.autoIaCooldown.delete(C);
  pedidos = [];
  const client = { ...clienteFalso(), sendPresenceUpdate: async () => {} };
  const base = { chat: C, isGroup: true, sender: "555@lid", pushName: "Ana", text: "", mentionedJid: [], quoted: null, key: { id: `IN-${Math.random()}` } };
  await AutoIA.before({ ...base, ...m }, { client, participants: [], isBotAdmin: true, isOwner: false, user: {}, chat: {}, isAdmin: false, isMod: false });
  return globalThis.enviados.map((e) => e.msg?.text || "");
}
const audioDe = (pedido) => pedido.contents[0].parts.find((p) => p.inline_data)?.inline_data;
const textoDe = (pedido) => pedido.contents[0].parts.at(-1).text;

test("nota de voz respondiéndole: la escucha, contesta y la deja en el hilo con lo que decía", async () => {
  clasificacion = { comando: "ninguno", respuesta: "Uh, qué garrón lo del auto", resumenAudio: "cuenta que se le rompió el auto" };
  const textos = await mandar({ mtype: "audioMessage", msg: { seconds: 8, mimetype: "audio/ogg; codecs=opus" }, download: async () => AUDIO, quoted: { id: "CL-1", fromMe: true, text: "¿Cómo andan?" } });
  assert.deepEqual(textos, ["Uh, qué garrón lo del auto"]);
  assert.equal(pedidos.length, 1);
  assert.deepEqual(audioDe(pedidos[0]), { mime_type: "audio/ogg", data: AUDIO.toString("base64") });
  assert.match(textoDe(pedidos[0]), /te responde con un audio a este mensaje tuyo: "¿Cómo andan\?"/);
  const hilo = globalThis.contextoChat.get(C);
  assert.ok(hilo.some((x) => x.texto === "🎤 (audio) cuenta que se le rompió el auto" && x.nombre === "Ana"));
});

test("los demás audios del grupo no los escucha", async () => {
  clasificacion = { comando: "ninguno", respuesta: "no debería salir" };
  assert.deepEqual(await mandar({ mtype: "audioMessage", msg: { seconds: 8 }, download: async () => AUDIO }), [], "una nota de voz suelta");
  assert.deepEqual(await mandar({ text: "jajaja qué bueno", quoted: audioCitado() }), [], "alguien cita un audio sin nombrarla");
  assert.equal(pedidos.length, 0);
});

test("citan un audio y la nombran: lo escucha", async () => {
  clasificacion = { comando: "ninguno", respuesta: "Tiene razón a medias", resumenAudio: "opina que el asado es mejor con leña" };
  const textos = await mandar({ text: "claudia, ¿qué pensás de eso?", quoted: audioCitado() });
  assert.deepEqual(textos, ["Tiene razón a medias"]);
  assert.equal(audioDe(pedidos[0]).mime_type, "audio/ogg");
  assert.match(textoDe(pedidos[0]), /cita un audio que mandó alguien del grupo y te dice: "claudia, ¿qué pensás de eso\?"/);
});

test("un audio demasiado largo no lo baja, y se lo dice a la IA", async () => {
  clasificacion = { comando: "ninguno", respuesta: "Uf, es eterno ese audio, resumímelo" };
  let bajado = false;
  await mandar({ text: "claudia escuchá esto", quoted: audioCitado({ seconds: A.MAX_SEGUNDOS + 1, download: async () => ((bajado = true), AUDIO) }) });
  assert.equal(bajado, false);
  assert.equal(audioDe(pedidos[0]), undefined);
  assert.match(textoDe(pedidos[0]), /no lo pudiste escuchar: es demasiado largo/);
});

test("un tema que mandó ella con .play: ya sabe cuál es y no lo baja", async () => {
  A.recordarAudioEnviado("PLAY-1", "Soda Stereo - De Música Ligera");
  clasificacion = { comando: "ninguno", respuesta: "Soda, de Buenos Aires. Temazo." };
  let bajado = false;
  const textos = await mandar({ text: "claudia de dónde es esta banda?", quoted: audioCitado({ id: "PLAY-1", fromMe: true, download: async () => ((bajado = true), AUDIO) }) });
  assert.deepEqual(textos, ["Soda, de Buenos Aires. Temazo."]);
  assert.equal(bajado, false);
  assert.equal(audioDe(pedidos[0]), undefined);
  assert.match(textoDe(pedidos[0]), /cita el tema "Soda Stereo - De Música Ligera", que mandaste vos/);
});

test("¿es verdad?: busca, contesta sin links, y los pasa solo cuando se los piden", async () => {
  globalThis.fuentesPorChat.delete(C);
  clasificacion = { comando: "ninguno", respuesta: "Ni idea, dejame ver", buscar: "suba del boleto en Montevideo" };
  busqueda = { texto: "Es verdad, sube a 60 pesos desde el lunes [1].", fuentes: [{ titulo: "montevideo.com.uy", url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc" }] };
  const textos = await mandar({ text: "claudia es verdad que sube el boleto?" });
  assert.deepEqual(textos, ["Es verdad, sube a 60 pesos desde el lunes."], "la respuesta buscada, sin referencias ni links");
  assert.equal(pedidos.length, 2);
  assert.equal(pedidos[0].tools, undefined, "la clasificación no busca");
  assert.deepEqual(pedidos[1].tools, [{ google_search: {} }]);
  assert.equal(pedidos[1].generationConfig.responseSchema, undefined, "Gemini no busca si se le pide JSON");
  assert.match(textoDe(pedidos[1]), /Buscá en internet: suba del boleto en Montevideo/);

  clasificacion = { comando: "ninguno", respuesta: "Ahí van", fuentes: true };
  const despues = await mandar({ text: "claudia pasame la fuente" });
  assert.equal(despues[0], "Ahí van");
  assert.equal(despues[1], "Fuentes:\n• montevideo.com.uy: https://www.montevideo.com.uy/nota", "con el link real, no el de Google");
  assert.match(textoDe(pedidos[0]), /buscaste en internet sobre "suba del boleto en Montevideo"/);
});

test("si la búsqueda falla queda la primera respuesta; un bolazo del grupo no se busca", async () => {
  globalThis.fuentesPorChat.delete(C);
  clasificacion = { comando: "ninguno", respuesta: "Mmm, no sé si creerte", buscar: "algo raro" };
  busqueda = null;
  assert.deepEqual(await mandar({ text: "claudia es verdad esto?" }), ["Mmm, no sé si creerte"]);

  clasificacion = { comando: "ninguno", respuesta: "Jaja, sí, Juan es el peor al truco" };
  assert.deepEqual(await mandar({ text: "claudia es verdad que Juan es malísimo al truco?" }), ["Jaja, sí, Juan es el peor al truco"]);
  assert.equal(pedidos.length, 1, "sin segunda consulta");

  clasificacion = { comando: "ninguno", respuesta: "Eso lo dije de memoria", fuentes: true };
  assert.deepEqual(await mandar({ text: "claudia fuente?" }), ["Eso lo dije de memoria"], "sin fuentes guardadas no manda lista");
});

test("audios: formatos que Gemini toma y los que pasan por ffmpeg", async () => {
  assert.equal(A.mimeParaGemini("audio/ogg; codecs=opus"), "audio/ogg");
  assert.equal(A.mimeParaGemini("audio/mpeg"), "audio/mp3");
  assert.equal(A.mimeParaGemini("audio/mp4"), null);

  let convertido = false;
  const r = await A.audioParaIA(
    { seconds: 200, mimetype: "audio/mp4", download: async () => Buffer.from("m4a") },
    {
      convertir: async () => {
        convertido = true;
        return { data: Buffer.from("ogg"), delete: async () => {} };
      },
    },
  );
  assert.ok(convertido);
  assert.deepEqual(r, { ok: true, adjunto: { mimeType: "audio/ogg", datos: Buffer.from("ogg").toString("base64") } });

  assert.deepEqual(await A.audioParaIA({ mimetype: "audio/ogg", download: async () => Buffer.alloc(0) }), { ok: false, motivo: "error" });
  assert.deepEqual(await A.audioParaIA({ mimetype: "audio/ogg", download: async () => { throw new Error("404"); } }), { ok: false, motivo: "error" });
});

test("fuentes: una respuesta citada trae las suyas; las viejas vencen", async () => {
  const F = await import("../lib/fuentes.js");
  const Z = "fuentes@g.us";
  F.guardarFuentes(Z, { idMensaje: "R1", tema: "uno", fuentes: [{ titulo: "a", url: "https://a" }] }, 1000);
  F.guardarFuentes(Z, { idMensaje: "R2", tema: "dos", fuentes: [{ titulo: "b", url: "https://b" }] }, 2000);
  assert.equal(F.fuentesPara(Z, "R1", 3000).tema, "uno");
  assert.equal(F.fuentesPara(Z, null, 3000).tema, "dos");
  assert.equal(F.fuentesPara(Z, null, 2000 + F.VIGENCIA_MS), null);
});

test("si Gemini no contesta, el respaldo sabe que el audio no lo escuchó", async () => {
  const { preguntarIA } = await import("../lib/ia.js");
  const fetchAntes = globalThis.fetch;
  let alRespaldo = null;
  globalThis.groqApiKey = "clave-groq";
  globalThis.fetch = async (url, opciones) => {
    if (String(url).includes("generativelanguage")) return { ok: false, status: 429 };
    alRespaldo = JSON.parse(opciones.body).messages.at(-1).content;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "Escribímelo, que no te escucho" } }] }) };
  };
  try {
    const r = await preguntarIA("claudia escuchá", { adjuntos: [{ mimeType: "audio/ogg", datos: "eA==" }] });
    assert.equal(r.texto, "Escribímelo, que no te escucho");
    assert.match(alRespaldo, /el audio no lo pudiste escuchar esta vez/);
  } finally {
    globalThis.fetch = fetchAntes;
    globalThis.groqApiKey = "";
    globalThis.modeloSinCuotaDesde.clear();
  }
});
