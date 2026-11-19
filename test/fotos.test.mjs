// The photos Claudia looks at (lib/fotos.js, plugins/_auto-ia.js). She used to see none: of a photo she knew it was
// there, by its mark, and "claudia, ¿qué es esto?" over one got an answer about nothing. Now she looks at the one
// that's for her, the way she hears the audio that's for her: sent with a caption that names her, or answering a
// message of hers, or quoted by whoever talks to her. One per answer, never a view-once, nobody else's, and kept
// nowhere: what stays is a line with what it showed, inside its mark in her short-term memory.
// Gemini is swapped for canned answers that record each request, and her clock and her timers are the test's.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso } from "./helpers.mjs";
import { configuracion } from "../lib/configuracion.js";
import { estadoDe } from "../lib/estado-de-plugins.js";

let F, IA, AutoIA, CC, H, Adj, Fotos, Turnos, I, Gemini, Ia, RITMO;
const cuerpos = []; // every request Gemini got
let respuesta; // what it answers to her chat
let busqueda; // what it answers to a web search: a text, or null to fail
let geminiCaido; // Gemini answers 429, and a fallback gets the request
const alRespaldo = []; // what the fallback was asked
let delRespaldo; // and what it answers
let bajadas; // the photos that were downloaded, by the name each test gives them
let ahora; // her clock
const relojes = []; // the turns she left for later
const fetchReal = globalThis.fetch;
const logReal = console.log;
const errorReal = console.error;
const ritmoReal = {};
const depReal = {};
const ritmoDeClaudia = estadoDe("ia-ultima-respuesta", () => new Map()); // when she last started to talk, per chat

const BOT = "200000000000009@lid";
const [ANA, BETO, CARO] = ["7600001@lid", "7600002@lid", "7600003@lid"];
const NOMBRES = { [ANA]: "Ana", [BETO]: "Beto", [CARO]: "Caro" };
const FOTO = Buffer.from("JFIF: una foto de prueba");
const AUDIO = Buffer.from("OggS audio de prueba");
const PULGAR = String.fromCodePoint(0x1f44d);

before(async () => {
  ({ F } = await prepararBase("fotos"));
  configuracion.geminiApiKey = "clave";
  ({ RITMO } = await import("../lib/ritmo.js"));
  for (const k of ["TIPEO_MIN_MS", "TIPEO_MAX_MS", "TIPEO_POR_LETRA_MS", "MIN_ENTRE_MENSAJES_MS"]) ritmoReal[k] = RITMO[k];
  Object.assign(RITMO, { TIPEO_MIN_MS: 0, TIPEO_MAX_MS: 1, TIPEO_POR_LETRA_MS: 0, MIN_ENTRE_MENSAJES_MS: 0 });
  console.log = () => {}; // the AI module narrates which model answered
  console.error = () => {}; // and which one failed
  globalThis.fetch = async (url, opciones = {}) => {
    if (opciones.method === "HEAD") return { headers: { get: () => "https://www.montevideo.com.uy/nota" } };
    if (!String(url).includes("generativelanguage")) {
      alRespaldo.push(JSON.parse(opciones.body).messages.at(-1).content);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(delRespaldo) } }] }) };
    }
    if (geminiCaido) return { ok: false, status: 429 };
    const cuerpo = JSON.parse(opciones.body);
    cuerpos.push(cuerpo);
    if (cuerpo.tools) {
      if (!busqueda) return { ok: false, status: 500, text: async () => "" };
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: busqueda }] }, groundingMetadata: { groundingChunks: [{ web: { uri: "https://vertexaisearch.cloud.google.com/x", title: "montevideo.com.uy" } }] } }] }) };
    }
    return { ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(respuesta) }] } }] }) };
  };
  IA = await import("../plugins/_auto-ia.js");
  AutoIA = IA.default;
  CC = await import("../lib/contexto-chat.js");
  H = await import("../lib/hilo.js");
  Adj = await import("../lib/adjuntos.js");
  Fotos = await import("../lib/fotos.js");
  Turnos = await import("../lib/turnos-de-claudia.js");
  I = await import("../lib/iniciativa.js");
  Gemini = await import("../lib/gemini.js");
  Ia = await import("../lib/ia.js");
  Object.assign(depReal, IA._dep);
  IA._dep.ahora = () => ahora;
  IA._dep.programar = (fn, ms) => {
    const reloj = { fn, ms };
    relojes.push(reloj);
    return reloj;
  };
  IA._dep.cancelar = (reloj) => {
    if (relojes.includes(reloj)) relojes.splice(relojes.indexOf(reloj), 1);
  };
});
after(() => {
  globalThis.fetch = fetchReal;
  console.log = logReal;
  console.error = errorReal;
  Object.assign(RITMO, ritmoReal);
  Object.assign(IA._dep, depReal);
});
beforeEach(() => {
  Turnos.reiniciarTurnos();
  ritmoDeClaudia.clear();
  Gemini.geminiEnPausa.clear();
  relojes.length = 0;
  cuerpos.length = 0;
  alRespaldo.length = 0;
  bajadas = [];
  ahora = Date.now();
  geminiCaido = false;
  busqueda = null;
  delRespaldo = { comando: "ninguno", respuesta: "No la pude ver, contame qué es" };
  respuesta = { comando: "ninguno", resumenFoto: "un perro durmiendo en un sillón", respuesta: "¡Qué lindo!" };
});

let grupos = 0;
// A group of the test's own, with the people the bot knows in it.
function grupo() {
  const chat = `fotos-${++grupos}@g.us`;
  for (const [lid, pushName] of Object.entries(NOMBRES)) F.initDataDB({ chat, sender: lid, senderJid: "", pushName });
  return chat;
}
// A socket that writes down what went out.
function cliente() {
  const client = { ...clienteFalso(), user: { lid: BOT, id: "59800000009@s.whatsapp.net", jid: "59800000009@s.whatsapp.net" }, salidas: [], presencias: [] };
  client.sendPresenceUpdate = async (estado) => void client.presencias.push(estado);
  client.sendMessage = async (chat, contenido) => {
    client.salidas.push(contenido);
    return { key: { id: `MSG${client.salidas.length}` } };
  };
  client.sendText = async (chat, text) => client.sendMessage(chat, { text });
  return client;
}
const bajar =
  (cual, buffer = FOTO) =>
  async () => {
    bajadas.push(cual);
    return buffer;
  };
// A photo as lib/wa-socket.js hands it over: what a message that is one carries...
const foto = (extra = {}) => ({ mtype: "imageMessage", msg: { mimetype: "image/jpeg", fileLength: FOTO.length }, download: bajar("propia"), ...extra });
// ...and one that's quoted.
let ids = 0;
const fotoCitada = (extra = {}) => ({ id: `CITADA${++ids}`, mtype: "imageMessage", mediaType: "imageMessage", fromMe: false, sender: BETO, text: "", mimetype: "image/jpeg", fileLength: FOTO.length, download: bajar("citada"), ...extra });
const mensaje = (chat, texto, { sender = ANA, ...extra } = {}) => ({
  chat,
  isGroup: true,
  sender,
  senderJid: "",
  pushName: NOMBRES[sender],
  text: texto,
  mentionedJid: [],
  quoted: null,
  key: { remoteJid: chat, fromMe: false, id: `M${++ids}`, participant: sender },
  ...extra,
});
const arroba = `@${BOT.split("@")[0]}`;
const paraElla = (chat, texto, extra = {}) => mensaje(chat, `${arroba} ${texto}`, { mentionedJid: [BOT], ...extra });
// What plugins/_memoria-corta.js does with each message before her hook runs: it's in her short-term memory, a photo by
// its mark.
const guardar = (chat, m, texto) => CC.recordarMensaje(chat, NOMBRES[m.sender], texto, false, { id: m.key.id, usuario: m.sender });
const guardado = (chat, id) => CC.mensajeEnMemoria(chat, id)?.texto;
// The message comes, with her turn free.
async function llega(client, m, permisos = {}) {
  ritmoDeClaudia.delete(m.chat);
  await AutoIA.before(m, { client, participants: [], isBotAdmin: true, isOwner: false, isAdmin: false, isMod: false, user: {}, chat: {}, ...permisos });
}
const adjuntos = (cuerpo = cuerpos.at(-1)) => cuerpo.contents[0].parts.filter((p) => p.inline_data).map((p) => p.inline_data);
const prompt = (cuerpo = cuerpos.at(-1)) => cuerpo.contents[0].parts.at(-1).text;
const esquema = (cuerpo = cuerpos.at(-1)) => cuerpo.generationConfig.responseSchema;
const textos = (client) => client.salidas.map((s) => s.text).filter((t) => t !== undefined);
const LA_FOTO = { mime_type: "image/jpeg", data: FOTO.toString("base64") };
const NO_INVENTES = "Si hace falta decilo con naturalidad, y no inventes lo que muestra.)";

// ---------- the pieces ----------

test("qué es una foto, y cuál trae un mensaje: la suya, o si no la que cita", () => {
  assert.equal(Fotos.esFoto({ mtype: "imageMessage" }), true);
  assert.equal(Fotos.esFoto({ mtype: "viewOnceMessageV2", mediaType: "imageMessage" }), true, "dentro de un envoltorio");
  for (const otro of [null, undefined, {}, { mtype: "stickerMessage" }, { mtype: "documentMessage", mimetype: "image/jpeg" }, { mtype: "videoMessage" }, { mtype: "conversation", text: "imageMessage" }]) assert.equal(Fotos.esFoto(otro), false, JSON.stringify(otro));

  const propia = Fotos.fotoDe({ ...foto(), key: { id: "P1" }, quoted: fotoCitada() });
  assert.deepEqual({ ...propia, origen: null }, { citada: false, id: "P1", unaVez: false, origen: null }, "la suya antes que la que cita");
  assert.deepEqual([propia.origen.mimetype, propia.origen.fileLength], ["image/jpeg", FOTO.length]);
  assert.equal(Fotos.fotoDe({ ...foto(), id: "P2", key: { id: "otro" } }).id, "P2");

  const citada = Fotos.fotoDe({ mtype: "extendedTextMessage", text: "mirá", quoted: fotoCitada({ id: "C1", sender: BETO }) });
  assert.deepEqual({ ...citada, origen: null }, { citada: true, id: "C1", unaVez: false, suya: false, autor: BETO, origen: null });
  assert.equal(Fotos.fotoDe({ quoted: fotoCitada({ fromMe: true }) }).suya, true);
  for (const sin of [{ mtype: "conversation", text: "hola" }, { text: "mirá", quoted: { mtype: "audioMessage" } }, { text: "mirá", quoted: null }]) assert.equal(Fotos.fotoDe(sin), null);

  // A view-once, told by the key of what arrives, by its wrapper, or by the flag on the photo itself.
  assert.equal(Fotos.fotoDe({ ...foto(), key: { id: "V1", isViewOnce: true } }).unaVez, true);
  assert.equal(Fotos.fotoDe({ ...foto(), key: { id: "V2" }, message: { viewOnceMessageV2: { message: { imageMessage: {} } } } }).unaVez, true);
  assert.equal(Fotos.fotoDe({ msg: { contextInfo: { quotedMessage: { viewOnceMessageV2: { message: { imageMessage: {} } } } } }, quoted: fotoCitada({ mtype: "viewOnceMessageV2" }) }).unaVez, true);
  assert.equal(Fotos.fotoDe({ msg: { contextInfo: { quotedMessage: { imageMessage: { viewOnce: true } } } }, quoted: fotoCitada() }).unaVez, true);
  assert.equal(Fotos.fotoDe({ msg: { contextInfo: { quotedMessage: { imageMessage: { viewOnce: false } } } }, quoted: fotoCitada() }).unaVez, false);

  // In a wrapper that isn't a view-once, its type and its size are the photo's, not the wrapper's.
  const envuelta = Fotos.fotoDe({ quoted: { ...fotoCitada({ mimetype: undefined, fileLength: undefined }), mediaMessage: { imageMessage: { mimetype: "image/png", fileLength: 77 } } } });
  assert.deepEqual([envuelta.origen.mimetype, envuelta.origen.fileLength], ["image/png", 77]);
});

test("la foto lista para la IA: los formatos que Gemini toma, y lo que no llega a bajar", async () => {
  const origen = (extra = {}) => ({ mimetype: "image/jpeg", fileLength: FOTO.length, download: bajar("una"), ...extra });
  assert.deepEqual(await Fotos.fotoParaIA(origen()), { ok: true, adjunto: { mimeType: "image/jpeg", datos: FOTO.toString("base64") } });
  for (const [viene, va] of [["image/jpeg; algo=1", "image/jpeg"], ["IMAGE/JPG", "image/jpeg"], ["image/png ; algo=1", "image/png"], ["image/webp", "image/webp"], ["image/heic", "image/heic"], ["image/heif", "image/heif"]]) {
    assert.equal((await Fotos.fotoParaIA(origen({ mimetype: viene }))).adjunto.mimeType, va, viene);
  }
  assert.equal(bajadas.length, 7);

  // What isn't an image Gemini takes, and what's too heavy by what the message says, aren't downloaded at all.
  bajadas = [];
  for (const mimetype of ["image/gif", "video/mp4", "application/pdf", "", undefined]) assert.deepEqual(await Fotos.fotoParaIA(origen({ mimetype })), { ok: false, motivo: "formato" }, String(mimetype));
  assert.deepEqual(await Fotos.fotoParaIA(origen({ fileLength: Fotos.FOTOS.MAX_BYTES + 1 })), { ok: false, motivo: "pesada" });
  assert.deepEqual(await Fotos.fotoParaIA(origen({ fileLength: String(Fotos.FOTOS.MAX_BYTES + 1) })), { ok: false, motivo: "pesada" }, "el tamaño llega como texto, a veces");
  assert.deepEqual(bajadas, []);
  assert.equal((await Fotos.fotoParaIA(origen({ fileLength: Fotos.FOTOS.MAX_BYTES }))).ok, true, "justo en el tope, entra");
  assert.equal((await Fotos.fotoParaIA(origen({ fileLength: undefined }))).ok, true, "sin el dato, la baja y ve");

  // Heavier than it said, empty, not a file, or it couldn't be downloaded.
  const tope = Fotos.FOTOS.MAX_BYTES;
  Fotos.FOTOS.MAX_BYTES = FOTO.length - 1;
  try {
    assert.deepEqual(await Fotos.fotoParaIA(origen({ fileLength: 1 })), { ok: false, motivo: "pesada" });
  } finally {
    Fotos.FOTOS.MAX_BYTES = tope;
  }
  assert.deepEqual(await Fotos.fotoParaIA(origen({ download: async () => Buffer.alloc(0) })), { ok: false, motivo: "error" });
  assert.deepEqual(await Fotos.fotoParaIA(origen({ download: async () => "no es un archivo" })), { ok: false, motivo: "error" });
  const sinRed = async () => {
    throw new Error("sin red");
  };
  assert.deepEqual(await Fotos.fotoParaIA(origen({ download: sinRed })), { ok: false, motivo: "error" });
});

test("lo que vio en una foto va dentro de su marca, y con eso la foto ya no es muda", () => {
  assert.equal(Adj.conLoVisto("📷 (foto)", "un perro durmiendo en un sillón"), "📷 (foto: un perro durmiendo en un sillón)");
  assert.equal(Adj.conLoVisto("📷 (foto) mirá mi perro", "  un perro\n durmiendo "), "📷 (foto: un perro durmiendo) mirá mi perro", "el pie queda como estaba");
  assert.equal(Adj.conLoVisto("📷 (foto: lo de antes) mirá", "lo de ahora"), "📷 (foto: lo de ahora) mirá", "mirada de nuevo, queda lo último");
  assert.equal(Adj.conLoVisto("📷 (foto)", "un cartel (rojo) que dice :) algo"), "📷 (foto: un cartel rojo que dice : algo)", "sin paréntesis: cerrarían la marca");
  assert.equal(Adj.conLoVisto("📷 (foto)", "x".repeat(500)), `📷 (foto: ${"x".repeat(140)})`);
  // Nothing seen, or not a photo she can have looked at: as it was.
  for (const [texto, visto] of [["📷 (foto)", ""], ["📷 (foto)", "  ( ) "], ["📷 (foto)", null], ["📷 (foto de ver una vez)", "un perro"], ["🎥 (video)", "un perro"], ["💟 (sticker)", "un perro"], ["mirá mi perro", "un perro"], ["", "un perro"]]) {
    assert.equal(Adj.conLoVisto(texto, visto), texto, `${texto} / ${visto}`);
  }

  assert.equal(Adj.vistoEn("📷 (foto: un perro durmiendo) mirá"), "un perro durmiendo");
  for (const texto of ["📷 (foto)", "📷 (foto) mirá", "📷 (foto de ver una vez)", "📎 (archivo: apuntes.pdf)", "📊 (encuesta: ¿qué comemos?)", "🎤 (audio de 0:35)", "hola", "", null]) assert.equal(Adj.vistoEn(texto), "", String(texto));

  // Mute is what she knows is there and can't read: a photo she looked at isn't, a file by its name still is.
  assert.equal(Adj.esAdjuntoMudo("📷 (foto)"), true);
  assert.equal(Adj.esAdjuntoMudo("📷 (foto: un perro durmiendo)"), false);
  assert.equal(Adj.esAdjuntoMudo("📷 (foto de ver una vez)"), true);
  assert.equal(Adj.esAdjuntoMudo("📎 (archivo: apuntes.pdf)"), true);
  assert.equal(Adj.esAdjuntoMudo("📷 (foto) mirá"), false);
  assert.equal(Adj.esAdjuntoMudo("hola"), false);
  // An edited caption keeps what she saw, as it keeps the mark.
  assert.equal(Adj.conLaMarcaDe("📷 (foto: un perro durmiendo) mirá", "miren a Toto"), "📷 (foto: un perro durmiendo) miren a Toto");
});

test("en el hilo, una foto que miró se lee, no se junta con las que no, y trae su aclaración", () => {
  const t = Date.now();
  const de = (texto, hace, extra = {}) => ({ nombre: "Ana", usuario: ANA, texto, fecha: t - hace * 1000, ...extra });
  const mirada = de("📷 (foto: un perro durmiendo en un sillón)", 50);
  assert.equal(H.esLegible(mirada), true);
  assert.equal(H.esLegible(de("📷 (foto)", 40)), false);
  const lineas = H.lineasDelHilo([de("📷 (foto)", 60), mirada, de("📷 (foto)", 40), de("📷 (foto)", 30)], { ahora: t }).map((l) => l.texto);
  assert.deepEqual(lineas, ["Ana (hace 1 min): 📷 (foto)", "Ana (recién): 📷 (foto: un perro durmiendo en un sillón)", "Ana (recién): 📷 (2 fotos)"]);

  assert.equal(H.leyendaDe([mirada]), `${H.LEYENDA_ADJUNTOS} ${H.LEYENDA_VISTAS}`);
  assert.equal(H.leyendaDe([de("📷 (foto)", 1), de("📎 (archivo: apuntes.pdf)", 1)]), H.LEYENDA_ADJUNTOS, "sin ninguna que haya mirado, no hay nada que aclarar");
  assert.equal(H.leyendaDe([mirada, { texto: "🎡 salió el 14", esBot: true, comando: true }]), `${H.LEYENDA_ADJUNTOS} ${H.LEYENDA_VISTAS} ${H.LEYENDA_AUTOMATICOS}`);
});

test("lo que vio queda en el mensaje de la foto, como una edición de quien la mandó", () => {
  const chat = grupo();
  CC.recordarMensaje(chat, "Ana", "📷 (foto) mirá", false, { id: "G1", usuario: ANA });
  CC.recordarMensaje(chat, "Beto", "📷 (foto)", false, { id: "G2", participant: BETO });
  CC.recordarMensaje(chat, "Claudia", "📷 (foto)", true, { id: "G3", comando: true });
  CC.recordarMensaje(chat, "Ana", "hola a todos", false, { id: "G4", usuario: ANA });
  assert.equal(Fotos.recordarLoVisto(chat, "G1", "un perro"), true);
  assert.equal(Fotos.recordarLoVisto(chat, "G2", "un gato"), true, "con el id con que haya llegado");
  assert.deepEqual([guardado(chat, "G1"), guardado(chat, "G2")], ["📷 (foto: un perro) mirá", "📷 (foto: un gato)"]);
  assert.equal(Fotos.recordarLoVisto(chat, "G1", "un perro"), false, "lo mismo no es un cambio");
  assert.equal(Fotos.recordarLoVisto(chat, "G3", "un mapa"), false, "lo que mandó el bot no tiene de quién ser la edición");
  assert.equal(Fotos.recordarLoVisto(chat, "G4", "un perro"), false, "lo que no es una foto queda como está");
  assert.equal(Fotos.recordarLoVisto(chat, "NO-ESTA", "un perro"), false);
  assert.equal(Fotos.recordarLoVisto(chat, null, "un perro"), false);
  assert.deepEqual([guardado(chat, "G3"), guardado(chat, "G4")], ["📷 (foto)", "hola a todos"]);
});

// ---------- when a photo is for her ----------

test("una foto con su nombre en el pie: la mira, contesta y le queda una línea de lo que mostraba", async () => {
  const chat = grupo();
  const client = cliente();
  const m = mensaje(chat, "claudia mirá mi perro", foto());
  guardar(chat, m, "📷 (foto) claudia mirá mi perro");
  respuesta = { comando: "ninguno", resumenFoto: "un perro durmiendo en un sillón", forma: "texto", respuesta: "¡Qué lindo!" };
  await llega(client, m);

  assert.deepEqual([cuerpos.length, bajadas, textos(client), relojes.length], [1, ["propia"], ["¡Qué lindo!"], 0]);
  assert.deepEqual(cuerpos[0].contents[0].parts.map((p) => Object.keys(p)[0]), ["inline_data", "text"], "la foto, y después el pedido");
  assert.deepEqual(adjuntos(), [LA_FOTO]);
  assert.ok(prompt().includes('\n\nMensaje de Ana: "claudia mirá mi perro"\n\nVa adjunta la foto que mandó Ana: esa sí la ves, mirala para contestar.\n\n'), prompt());
  // What to say of it goes after the rest and before how she may answer, and it's the first thing she writes of hers.
  assert.match(prompt(), /\n\n\(También solo para vos: en "resumenFoto" poné en una línea qué muestra la foto adjunta, por ejemplo [^\n]+ No copies ahí datos personales que se lean en ella, como números de documento, direcciones o teléfonos\.\)\n\n\(También solo para vos: en ese mensaje te nombran[^\n]+\)$/);
  assert.deepEqual(Object.keys(esquema().properties), ["comando", "argumento", "resumenFoto", "forma", "emoji", "respuesta", "recordar", "reintentar", "buscar", "fuentes", "resumenAudio"]);
  assert.deepEqual(esquema().required, ["comando", "resumenFoto", "forma", "respuesta"]);
  assert.equal(guardado(chat, m.key.id), "📷 (foto: un perro durmiendo en un sillón) claudia mirá mi perro");

  // Tagged, she's being talked to: words, as always, with the photo and what it shows.
  const arrobada = paraElla(chat, "¿de qué raza es?", foto());
  guardar(chat, arrobada, "📷 (foto) @Claudia ¿de qué raza es?");
  respuesta = { comando: "ninguno", resumenFoto: "un perro marrón de orejas largas", respuesta: "Parece un salchicha" };
  await llega(client, arrobada);
  assert.deepEqual(Object.keys(esquema().properties), ["comando", "argumento", "resumenFoto", "respuesta", "recordar", "reintentar", "buscar", "fuentes", "resumenAudio"]);
  assert.deepEqual(esquema().required, ["comando", "resumenFoto", "respuesta"]);
  assert.match(prompt(), /qué muestra la foto adjunta[^\n]+teléfonos\.\)$/);
  assert.equal(guardado(chat, arrobada.key.id), "📷 (foto: un perro marrón de orejas largas) @Claudia ¿de qué raza es?");
  // And what she kept of the first one is in what she's told now, with what it's doing there.
  assert.ok(prompt().includes("- Ana (recién): 📷 (foto: un perro durmiendo en un sillón) claudia mirá mi perro\n"), prompt());
  assert.ok(prompt().includes(`(${H.LEYENDA_ADJUNTOS} ${H.LEYENDA_VISTAS})`));

  // With no photo, what she's asked and how is what it was.
  await llega(client, paraElla(chat, "¿cómo andás?"));
  assert.deepEqual([adjuntos(), Object.keys(esquema().properties).includes("resumenFoto"), /resumenFoto|Va adjunta/.test(prompt())], [[], false, false]);
  assert.deepEqual(esquema().required, ["comando", "respuesta"]);
});

test("citan una foto y le hablan: mira esa, y sabe de quién es", async () => {
  const chat = grupo();
  const client = cliente();
  CC.recordarMensaje(chat, "Beto", "📷 (foto)", false, { id: "DE-BETO", usuario: BETO });
  respuesta = { comando: "ninguno", resumenFoto: "una captura de un chat sobre el parcial", forma: "texto", respuesta: "Dice que el parcial pasó al viernes" };
  await llega(client, mensaje(chat, "claudia, ¿qué dice acá?", { quoted: fotoCitada({ id: "DE-BETO", sender: BETO }) }));
  assert.deepEqual([bajadas, adjuntos(), textos(client)], [["citada"], [LA_FOTO], ["Dice que el parcial pasó al viernes"]]);
  assert.ok(prompt().includes('\n\nMensaje de Ana: "claudia, ¿qué dice acá?"\n\nVa adjunta la foto que cita Ana, que mandó Beto: esa sí la ves, mirala para contestar.\n\n'), prompt());
  assert.equal(guardado(chat, "DE-BETO"), "📷 (foto: una captura de un chat sobre el parcial)", "queda en el mensaje de la foto, no en el de quien la citó");

  // One of her own (the bot's), one of whoever quotes it, and one of someone the bot doesn't know.
  CC.recordarMensaje(chat, "Claudia", "📷 (foto)", true, { id: "DEL-BOT", comando: true });
  await llega(client, paraElla(chat, "¿qué es esto que mandaste?", { quoted: fotoCitada({ id: "DEL-BOT", fromMe: true, sender: BOT }) }));
  assert.match(prompt(), /\n\nVa adjunta la foto que cita Ana, que mandaste vos: esa sí la ves, mirala para contestar\.\n\n/);
  assert.equal(guardado(chat, "DEL-BOT"), "📷 (foto)");
  await llega(client, paraElla(chat, "¿salí bien acá?", { quoted: fotoCitada({ sender: ANA }) }));
  assert.match(prompt(), /\n\nVa adjunta la foto que cita Ana, que es suya: esa sí la ves, mirala para contestar\.\n\n/);
  await llega(client, paraElla(chat, "¿quién es?", { quoted: fotoCitada({ sender: "7699999@lid" }) }));
  assert.match(prompt(), /\n\nVa adjunta la foto que cita Ana, que mandó alguien: esa sí la ves, mirala para contestar\.\n\n/);
  assert.equal(bajadas.length, 4);
});

test("una foto sin pie que le responde, o que sigue a su nombre solo: es para ella", async () => {
  const chat = grupo();
  const client = cliente();
  // Answering a message of hers: she looks, and it's no bare call waiting for its question. Words or a reaction.
  const respondiendo = mensaje(chat, "", { ...foto(), quoted: { id: "CL-1", fromMe: true, text: "¿Qué comieron hoy?" } });
  guardar(chat, respondiendo, "📷 (foto)");
  respuesta = { comando: "ninguno", resumenFoto: "un plato de milanesas con puré", forma: "reaccion", emoji: PULGAR, respuesta: "" };
  await llega(client, respondiendo);
  assert.deepEqual([cuerpos.length, bajadas, relojes.length], [1, ["propia"], 0]);
  assert.deepEqual(esquema().properties.forma.enum, ["texto", "reaccion"]);
  assert.ok(prompt().includes('\n\nAna responde a este mensaje tuyo: "¿Qué comieron hoy?"\n\nSu mensaje: una foto, sin nada escrito\n\nContestá siguiendo la charla, con tu onda.\n\nVa adjunta la foto que mandó Ana: esa sí la ves, mirala para contestar.\n\n'), prompt());
  assert.deepEqual(client.salidas, [{ react: { text: I.emojiPropio(PULGAR), key: respondiendo.key } }], "le puso una reacción, sin palabras");
  assert.equal(guardado(chat, respondiendo.key.id), "📷 (foto: un plato de milanesas con puré)", "y lo que vio le queda igual");

  // "claudia" alone, and then the photo: it's what she was called for.
  const otro = grupo();
  respuesta = { comando: "ninguno", resumenFoto: "un atardecer en la rambla", respuesta: "Qué lindo cielo" };
  await llega(client, mensaje(otro, "claudia"));
  assert.deepEqual([cuerpos.length, relojes.length], [1, 1], "espera lo que sigue");
  await llega(client, mensaje(otro, "", foto()));
  assert.deepEqual([cuerpos.length, relojes.length, bajadas.length], [2, 0, 2]);
  assert.ok(prompt().includes("\n\nMensaje de Ana: una foto, sin nada escrito\n\nVa adjunta la foto que mandó Ana: esa sí la ves, mirala para contestar.\n\n"), prompt());
  assert.equal(esquema().properties.forma, undefined, "y le contesta con palabras");

  // Her name alone under a photo is no bare call either: she looks at once.
  const tercero = grupo();
  await llega(client, mensaje(tercero, "claudia", foto()));
  assert.deepEqual([cuerpos.length, relojes.length, bajadas.length], [3, 0, 3]);
  assert.ok(prompt().includes('\n\nMensaje de Ana: "claudia"\n\nVa adjunta la foto que mandó Ana: esa sí la ves, mirala para contestar.\n\n'));
});

test("las demás fotos del grupo no las mira ni las baja", async () => {
  const chat = grupo();
  const client = cliente();
  await llega(client, mensaje(chat, "", foto()));
  await llega(client, mensaje(chat, "miren lo que encontré", foto()));
  await llega(client, mensaje(chat, "jajaja qué bueno", { quoted: fotoCitada() }));
  await llega(client, mensaje(chat, "", { ...foto(), quoted: { id: "DE-CARO", fromMe: false, sender: CARO, text: "pasen fotos" } }));
  assert.deepEqual([cuerpos.length, bajadas, client.salidas, relojes.length], [0, [], [], 0]);
});

test("una foto de ver una vez no la abre nunca, la cite quien la cite", async () => {
  const chat = grupo();
  const client = cliente();
  respuesta = { comando: "ninguno", resumenFoto: "no debería quedar", forma: "texto", respuesta: "Esa no la puedo abrir" };
  const NO = "(No pudiste ver la foto que cita Ana, que mandó Beto: es de las que se ven una sola vez, y esas no las abrís. ";
  // In its wrapper, and with the flag on the photo; quoted by anyone, by an admin, by the owner.
  const envuelta = { quoted: fotoCitada({ id: "UNA-VEZ", mtype: "viewOnceMessageV2" }), msg: { contextInfo: { quotedMessage: { viewOnceMessageV2: { message: { imageMessage: { mimetype: "image/jpeg" } } } } } } };
  const marcada = { quoted: fotoCitada({ id: "UNA-VEZ" }), msg: { contextInfo: { quotedMessage: { imageMessage: { mimetype: "image/jpeg", viewOnce: true } } } } };
  CC.recordarMensaje(chat, "Beto", "📷 (foto de ver una vez)", false, { id: "UNA-VEZ", usuario: BETO });
  for (const [extra, permisos] of [[envuelta, {}], [marcada, {}], [envuelta, { isAdmin: true }], [marcada, { isOwner: true }]]) {
    await llega(client, mensaje(chat, "claudia, ¿qué dice acá?", extra), permisos);
    assert.deepEqual([adjuntos(), bajadas], [[], []], JSON.stringify(permisos));
    assert.ok(prompt().includes(`\n\n${NO}${NO_INVENTES}\n\n`), prompt());
    assert.deepEqual([esquema().properties.resumenFoto, /qué muestra la foto adjunta/.test(prompt())], [undefined, false], "no hay nada que resumir");
  }
  assert.equal(cuerpos.length, 4);
  assert.equal(guardado(chat, "UNA-VEZ"), "📷 (foto de ver una vez)");
  // Her own, should WhatsApp ever hand one over with its caption.
  await llega(client, mensaje(chat, "claudia mirá", { ...foto(), key: { remoteJid: chat, fromMe: false, id: "PROPIA-UNA-VEZ", participant: ANA, isViewOnce: true } }));
  assert.ok(prompt().includes(`\n\n(No pudiste ver la foto que mandó Ana: es de las que se ven una sola vez, y esas no las abrís. ${NO_INVENTES}\n\n`), prompt());
  assert.deepEqual([adjuntos(), bajadas], [[], []]);
});

test("la que no pudo ver, lo sabe: muy pesada, en un formato que no toma, o que no bajó", async () => {
  const chat = grupo();
  const client = cliente();
  respuesta = { comando: "ninguno", resumenFoto: "no debería quedar", respuesta: "No la pude abrir" };
  const casos = [
    [{ msg: { mimetype: "image/jpeg", fileLength: Fotos.FOTOS.MAX_BYTES + 1 } }, "es demasiado pesada", []],
    [{ msg: { mimetype: "image/gif", fileLength: 10 } }, "viene en un formato que no podés abrir", []],
    [
      {
        download: async () => {
          bajadas.push("falla");
          throw new Error("sin red");
        },
      },
      "no se pudo bajar",
      ["falla"],
    ],
  ];
  for (const [extra, porque, esperadas] of casos) {
    bajadas = [];
    const m = paraElla(chat, "¿qué te parece?", foto(extra));
    guardar(chat, m, "📷 (foto) @Claudia ¿qué te parece?");
    await llega(client, m);
    assert.ok(prompt().includes(`\n\n(No pudiste ver la foto que mandó Ana: ${porque}. ${NO_INVENTES}\n\n`), prompt());
    assert.deepEqual([adjuntos(), bajadas, esquema().properties.resumenFoto], [[], esperadas, undefined], porque);
    assert.equal(guardado(chat, m.key.id), "📷 (foto) @Claudia ¿qué te parece?", "y no le queda nada de ella");
  }
});

test("una por respuesta: la del mensaje antes que la que cita, y ninguna si hay un audio para escuchar", async () => {
  const chat = grupo();
  const client = cliente();
  await llega(client, paraElla(chat, "¿cuál te gusta más?", { ...foto(), quoted: fotoCitada() }));
  assert.deepEqual([bajadas, adjuntos()], [["propia"], [LA_FOTO]]);

  // A voice note answering a photo of hers: she hears it, and that's what goes.
  bajadas = [];
  respuesta = { comando: "ninguno", respuesta: "Es el satélite de hoy", resumenAudio: "pregunta qué es la imagen" };
  const audio = async () => {
    bajadas.push("audio");
    return AUDIO;
  };
  await llega(client, mensaje(chat, "", { mtype: "audioMessage", msg: { seconds: 5, mimetype: "audio/ogg; codecs=opus" }, download: audio, quoted: fotoCitada({ fromMe: true, sender: BOT }) }));
  assert.deepEqual([bajadas, adjuntos().map((a) => a.mime_type)], [["audio"], ["audio/ogg"]]);
  assert.doesNotMatch(prompt(), /la foto/);
  assert.equal(esquema().properties.resumenFoto, undefined);
  // And an audio quoted while naming her, the same: the photo of an earlier message stays out.
  bajadas = [];
  ritmoDeClaudia.set(chat, ahora);
  await AutoIA.before(mensaje(chat, "", { ...foto(), quoted: { id: "CL-9", fromMe: true, text: "¿Y?" } }), { client, participants: [], isBotAdmin: true, isOwner: false, isAdmin: false, isMod: false, user: {}, chat: {} });
  await AutoIA.before(mensaje(chat, "claudia, ¿qué dice?", { sender: BETO, quoted: { id: "AUD-1", mtype: "audioMessage", mediaType: "audioMessage", fromMe: false, text: "", seconds: 12, mimetype: "audio/ogg; codecs=opus", download: audio } }), { client, participants: [], isBotAdmin: true, isOwner: false, isAdmin: false, isMod: false, user: {}, chat: {} });
  assert.equal(relojes.length, 1);
  ahora += Turnos.TURNOS.PAUSA_MS + 1000;
  await relojes.shift().fn();
  assert.deepEqual([bajadas, adjuntos().map((a) => a.mime_type)], [["audio"], ["audio/ogg"]]);
  assert.match(prompt(), /Ana: "\(una foto\)"/);
});

test("en una tanda mira la foto de quien se la mandó antes, y la nombra entre lo que le escribieron", async () => {
  const chat = grupo();
  const client = cliente();
  const permisos = { client, participants: [], isBotAdmin: true, isOwner: false, isAdmin: false, isMod: false, user: {}, chat: {} };
  // She can't answer yet: Ana answers her with a photo, and then Beto asks her something.
  ritmoDeClaudia.set(chat, ahora);
  const deAna = mensaje(chat, "", { ...foto(), quoted: { id: "CL-2", fromMe: true, text: "¿Quién va al asado?" } });
  guardar(chat, deAna, "📷 (foto)");
  await AutoIA.before(deAna, permisos);
  await AutoIA.before(paraElla(chat, "¿a qué hora es?", { sender: BETO }), permisos);
  assert.deepEqual([cuerpos.length, relojes.length, bajadas], [0, 1, []], "esperan su turno, y la foto no se baja hasta entonces");
  ahora += Turnos.TURNOS.PAUSA_MS + 1000;
  respuesta = { comando: "ninguno", resumenFoto: "una parrilla con chorizos", respuesta: "Beto, a las 13. Ana, ¡qué pinta!" };
  await relojes.shift().fn();
  assert.deepEqual([cuerpos.length, bajadas, adjuntos()], [1, ["propia"], [LA_FOTO]]);
  assert.ok(prompt().includes('Antes de ese mensaje también te escribieron, y todavía no les contestaste: Ana: "(una foto)". Contestales también en esta misma respuesta, a cada uno por su nombre.\n\nVa adjunta la foto que mandó Ana: esa sí la ves, mirala para contestar.\n\n'), prompt());
  assert.equal(guardado(chat, deAna.key.id), "📷 (foto: una parrilla con chorizos)");

  // With two photos waiting, the one she looks at is the latest. A voice note among them is still "un audio", and
  // isn't heard: only the one she's answering is.
  const otro = grupo();
  const suyo = (id) => ({ id, fromMe: true, text: "¿Qué hicieron el finde?" });
  bajadas = [];
  ritmoDeClaudia.set(otro, ahora);
  await AutoIA.before(mensaje(otro, "", { ...foto({ download: bajar("la de Ana") }), quoted: suyo("CL-3") }), permisos);
  const deCaro = mensaje(otro, "", { sender: CARO, ...foto({ download: bajar("la de Caro") }), quoted: suyo("CL-3") });
  guardar(otro, deCaro, "📷 (foto)");
  await AutoIA.before(deCaro, permisos);
  await AutoIA.before(mensaje(otro, "", { sender: CARO, mtype: "audioMessage", msg: { seconds: 5, mimetype: "audio/ogg; codecs=opus" }, download: bajar("el audio", AUDIO), quoted: suyo("CL-3") }), permisos);
  await AutoIA.before(paraElla(otro, "¿y ustedes qué hicieron?", { sender: BETO }), permisos);
  assert.deepEqual([cuerpos.length, relojes.length], [1, 1]);
  ahora += Turnos.TURNOS.PAUSA_MS + 1000;
  respuesta = { comando: "ninguno", resumenFoto: "una playa con sombrillas", respuesta: "¡Qué lindo todo!" };
  await relojes.shift().fn();
  assert.deepEqual([bajadas, adjuntos()], [["la de Caro"], [LA_FOTO]]);
  assert.ok(prompt().includes('todavía no les contestaste: Ana: "(una foto)" · Caro: "(una foto)" · Caro: "(un audio)". Contestales también en esta misma respuesta, a cada uno por su nombre.\n\nVa adjunta la foto que mandó Caro: esa sí la ves, mirala para contestar.\n\n'), prompt());
  assert.equal(guardado(otro, deCaro.key.id), "📷 (foto: una playa con sombrillas)");

  // And if the last one brings a photo too, that's the one: it's the message she's answering.
  const tercero = grupo();
  bajadas = [];
  ritmoDeClaudia.set(tercero, ahora);
  await AutoIA.before(mensaje(tercero, "", { ...foto({ download: bajar("la de Ana") }), quoted: suyo("CL-4") }), permisos);
  await AutoIA.before(paraElla(tercero, "¿y esta qué tal?", { sender: BETO, ...foto({ download: bajar("la de Beto") }) }), permisos);
  ahora += Turnos.TURNOS.PAUSA_MS + 1000;
  await relojes.shift().fn();
  assert.deepEqual(bajadas, ["la de Beto"]);
  assert.match(prompt(), /\n\nVa adjunta la foto que mandó Beto: esa sí la ves, mirala para contestar\.\n\n/);
});

// ---------- what she does with what she saw ----------

test("lo que le queda de la foto: una línea, sin lo que no vino o vino de más", async () => {
  const chat = grupo();
  const client = cliente();
  // What's left of the photo in her memory, having answered whatever came in that field.
  const queda = async (resumenFoto) => {
    const m = paraElla(chat, "¿qué ves?", foto());
    guardar(chat, m, "📷 (foto) @Claudia ¿qué ves?");
    respuesta = { comando: "ninguno", resumenFoto, respuesta: "Algo veo" };
    client.salidas.length = 0;
    await llega(client, m);
    assert.deepEqual(textos(client), ["Algo veo"], JSON.stringify(resumenFoto));
    return guardado(chat, m.key.id);
  };
  const SIN_NADA = "📷 (foto) @Claudia ¿qué ves?";
  assert.equal(await queda("  un cartel (rojo)\n grande "), "📷 (foto: un cartel rojo grande) @Claudia ¿qué ves?");
  assert.equal(await queda("y".repeat(300)), `📷 (foto: ${"y".repeat(140)}) @Claudia ¿qué ves?`);
  for (const nada of ["", "   ", undefined, null, 7, ["un perro"]]) assert.equal(await queda(nada), SIN_NADA, JSON.stringify(nada));
});

test("si le piden que verifique lo de la foto, la búsqueda lleva lo que vio, no la foto", async () => {
  const chat = grupo();
  const client = cliente();
  respuesta = { comando: "ninguno", resumenFoto: "un titular que dice que mañana es feriado", respuesta: "A ver, lo busco", buscar: "mañana es feriado en Uruguay" };
  busqueda = "No, mañana se trabaja normal.";
  await llega(client, paraElla(chat, "¿es verdad esto?", { quoted: fotoCitada() }));
  assert.equal(cuerpos.length, 2);
  assert.deepEqual([adjuntos(cuerpos[0]), adjuntos(cuerpos[1])], [[LA_FOTO], []]);
  assert.ok(prompt(cuerpos[1]).includes("\n\n(Lo que mostraba la foto, que ya viste: un titular que dice que mañana es feriado)\n\n"), prompt(cuerpos[1]));
  assert.doesNotMatch(prompt(cuerpos[1]), /Lo que había en el audio/);
  assert.deepEqual(textos(client), ["No, mañana se trabaja normal."]);
  assert.deepEqual(bajadas, ["citada"]);
});

// ---------- only Gemini sees them ----------

test("si contesta un respaldo, sabe que la foto no la vio, y lo que diga de ella no queda", async () => {
  const chat = grupo();
  const client = cliente();
  configuracion.groqApiKey = "clave-groq";
  geminiCaido = true;
  try {
    const m = paraElla(chat, "¿qué te parece?", foto());
    guardar(chat, m, "📷 (foto) @Claudia ¿qué te parece?");
    delRespaldo = { comando: "ninguno", resumenFoto: "un perro que se inventó", respuesta: "No la pude ver, ¿qué es?" };
    await llega(client, m);
    assert.deepEqual([cuerpos.length, alRespaldo.length, textos(client)], [0, 1, ["No la pude ver, ¿qué es?"]]);
    assert.match(alRespaldo[0], /\n\n\(Aviso para vos: la foto no la pudiste ver esta vez\. Si la charla depende de lo que muestra, decilo con naturalidad y pedí que te cuenten qué es; no inventes lo que se ve\.\)/);
    assert.doesNotMatch(alRespaldo[0], /el audio no lo pudiste escuchar/);
    assert.equal(guardado(chat, m.key.id), "📷 (foto) @Claudia ¿qué te parece?");

    // The same for a voice note: what a model that never heard it says it said used to be kept as what it said.
    const nota = mensaje(chat, "", { mtype: "audioMessage", msg: { seconds: 5, mimetype: "audio/ogg; codecs=opus" }, download: async () => AUDIO, quoted: { id: "CL-3", fromMe: true, text: "¿Cómo andan?" } });
    guardar(chat, nota, "🎤 (audio de 0:05)");
    delRespaldo = { comando: "ninguno", resumenAudio: "cuenta algo que se inventó", respuesta: "No te pude escuchar, escribímelo" };
    await llega(client, nota);
    assert.match(alRespaldo[1], /el audio no lo pudiste escuchar esta vez/);
    assert.doesNotMatch(alRespaldo[1], /la foto no la pudiste ver/);
    assert.equal(guardado(chat, nota.key.id), "🎤 (audio de 0:05)");
    assert.equal(CC.contextoChat.get(chat).some((x) => /se inventó/.test(x.texto)), false);

    // Asked straight (lib/ia.js): each thing left behind is named, and what answers says whether it got them.
    const ADJ = { audio: { mimeType: "audio/ogg", datos: "eA==" }, foto: { mimeType: "image/jpeg", datos: "eA==" } };
    alRespaldo.length = 0;
    delRespaldo = "dale";
    assert.equal((await Ia.preguntarIA("los dos", { adjuntos: [ADJ.audio, ADJ.foto] })).sinAdjuntos, true);
    assert.match(alRespaldo[0], /^los dos\n\n\(Aviso para vos: el audio no lo pudiste escuchar esta vez\.[^\n]+\)\n\n\(Aviso para vos: la foto no la pudiste ver esta vez\.[^\n]+\)$/);
    assert.equal((await Ia.preguntarIA("sin nada", {})).sinAdjuntos, false);
    assert.equal(alRespaldo[1], "sin nada");
    geminiCaido = false;
    Gemini.geminiEnPausa.clear();
    respuesta = "dale";
    assert.equal((await Ia.preguntarIA("a Gemini", { adjuntos: [ADJ.foto] })).sinAdjuntos, undefined, "a Gemini le llegó");
  } finally {
    configuracion.groqApiKey = "";
    geminiCaido = false;
    Gemini.geminiEnPausa.clear();
  }
});
