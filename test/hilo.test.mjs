// What Claudia perceives when she's talked to: what isn't text, as a mark (lib/adjuntos.js, lib/memoria-corta.js), the
// thread her prompt gets, each line with how long ago it was and whom it answers (lib/hilo.js), the day and the time,
// and who's writing to her (lib/quien-escribe.js). She used to get "Ana: yo" and nothing else: no clock, no photos, no
// replies, and nothing of what the bot itself had just sent.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { prepararBase, clienteFalso } from "./helpers.mjs";
import { configuracion } from "../lib/configuracion.js";
import { estadoDe } from "../lib/estado-de-plugins.js";
import { cargados } from "../lib/plugins-cargados.js";

let F, CC, H, Adj, MC, J, Q, T, S, E, RITMO, AutoIA, IA, MemoriaCorta;
const prompts = []; // what Claudia asked the AI
let respuesta = { comando: "ninguno", respuesta: "Dale." };
const descripciones = new Map(); // sha -> what the AI saw in that sticker
const fetchReal = globalThis.fetch;
const logReal = console.log;
const ritmoReal = {};
const ritmoDeClaudia = estadoDe("ia-ultima-respuesta", () => new Map()); // her pace in each chat (plugins/_auto-ia.js)

const MIN = 60 * 1000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const [ANA, BETO, CARO] = ["7100001@lid", "7100002@lid", "7100003@lid"];
const NUMERO_DE_ANA = "59899000711@s.whatsapp.net";
const SHA = (n) => createHash("sha256").update(`sticker ${n}`).digest("hex");
const VS16 = String.fromCodePoint(0xfe0f);
const TIPOS = ["foto", "video", "gif", "audio", "sticker", "archivo", "ubicacion", "contacto", "encuesta"];

before(async () => {
  ({ F } = await prepararBase("hilo"));
  configuracion.geminiApiKey = "clave";
  ({ RITMO } = await import("../lib/ritmo.js"));
  for (const k of ["TIPEO_MIN_MS", "TIPEO_MAX_MS", "TIPEO_POR_LETRA_MS", "MIN_ENTRE_MENSAJES_MS"]) ritmoReal[k] = RITMO[k];
  Object.assign(RITMO, { TIPEO_MIN_MS: 0, TIPEO_MAX_MS: 1, TIPEO_POR_LETRA_MS: 0, MIN_ENTRE_MENSAJES_MS: 0 });
  console.log = () => {}; // the AI module narrates which model answered
  globalThis.fetch = async (url, opciones) => {
    prompts.push(JSON.parse(opciones.body).contents[0].parts.at(-1).text);
    return { ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(respuesta) }] } }] }) };
  };
  CC = await import("../lib/contexto-chat.js");
  H = await import("../lib/hilo.js");
  Adj = await import("../lib/adjuntos.js");
  MC = await import("../lib/memoria-corta.js");
  J = await import("../lib/mensajes-de-juego.js");
  Q = await import("../lib/quien-escribe.js");
  T = await import("../lib/tiempo.js");
  S = await import("../lib/stickers-grupo.js");
  E = await import("../lib/envios.js");
  IA = await import("../plugins/_auto-ia.js");
  AutoIA = IA.default;
  MemoriaCorta = (await import("../plugins/_memoria-corta.js")).default;
  H._dep.descripcion = (sha) => descripciones.get(sha) || null;
  for (const [lid, pushName] of [[ANA, "Ana"], [BETO, "Beto"]]) F.initDataDB({ chat: "hilo-gente@g.us", sender: lid, senderJid: lid === ANA ? NUMERO_DE_ANA : "", pushName });
});
after(() => {
  globalThis.fetch = fetchReal;
  console.log = logReal;
  Object.assign(RITMO, ritmoReal);
});

let grupos = 0;
const chatNuevo = () => `hilo-${++grupos}@g.us`;
let ids = 0;
// A message as the memory keeps it, so many minutes ago.
const guardar = (chat, nombre, texto, haceMin, extra = {}, ahora = Date.now()) => {
  const id = extra.id ?? `H${++ids}`;
  CC.recordarMensaje(chat, nombre, texto, false, { usuario: `${nombre}@lid`, comando: false, ...extra, id, fecha: ahora - haceMin * MIN });
  return id;
};
// A message as it reaches the hook that writes the memory (plugins/_memoria-corta.js). Stamped a second ahead, which
// the memory takes as now: WhatsApp's stamp is in whole seconds, and with everything here in the same one, a message
// would land before what the bot had sent a moment earlier.
const mensaje = (chat, extra = {}) => ({ chat, isGroup: true, sender: ANA, senderJid: "", pushName: "Ana", text: "", mentionedJid: [], quoted: null, key: { id: `M${++ids}`, participant: ANA }, messageTimestamp: Math.floor(Date.now() / 1000) + 1, ...extra });
const guardada = (chat, id) => CC.contextoChat.get(chat).find((e) => e.id === id);
const lineas = (chat, ahora, idActual = null) => H.textoDelHilo(chat, idActual, ahora).split("\n");

// ---------- the marks ----------

test("adjuntos: la marca de cada cosa, y lo que se lee de vuelta de un texto guardado", () => {
  assert.equal(Adj.marca("foto"), "📷 (foto)");
  assert.equal(Adj.conMarca("foto", "  mirá esto "), "📷 (foto) mirá esto");
  assert.equal(Adj.conMarca("foto"), "📷 (foto)");
  assert.equal(Adj.conMarca("audio", "cuenta que se le rompió el auto"), "🎤 (audio) cuenta que se le rompió el auto", "como la charla guarda lo que escuchó");
  assert.equal(Adj.variasDe("foto", 4), "📷 (4 fotos)");
  assert.equal(Adj.variasDe("ubicacion", 2), "📍 (2 ubicaciones)");

  assert.deepEqual(Adj.adjuntoDe("📷 (foto) mirá esto"), { tipo: "foto", detalle: "", resto: "mirá esto" });
  assert.deepEqual(Adj.adjuntoDe("📎 (archivo: apuntes.pdf)"), { tipo: "archivo", detalle: ": apuntes.pdf", resto: "" });
  assert.deepEqual(Adj.adjuntoDe("🎤 (audio de 0:35)"), { tipo: "audio", detalle: " de 0:35", resto: "" });
  assert.deepEqual(Adj.adjuntoDe("📷 (foto) dos\nlíneas"), { tipo: "foto", detalle: "", resto: "dos\nlíneas" });
  for (const texto of ["hola", "(foto) sin el emoji", "📷 foto", "mirá 📷 (foto)", "📷 (fotografía)", "", null, undefined]) assert.equal(Adj.adjuntoDe(texto), null, String(texto));

  // Every kind is read back from its own mark, and none of them hides a variation selector: the mark is matched as text.
  for (const tipo of TIPOS) {
    assert.deepEqual(Adj.adjuntoDe(Adj.marca(tipo)), { tipo, detalle: "", resto: "" }, tipo);
    assert.equal(Adj.adjuntoDe(Adj.conMarca(tipo, "algo"))?.resto, "algo", tipo);
    assert.equal(Adj.marca(tipo).includes(VS16), false, tipo);
    assert.equal(Adj.variasDe(tipo, 3).includes("(3 "), true, tipo);
  }

  assert.equal(Adj.esAdjuntoMudo("💟 (sticker)"), true);
  assert.equal(Adj.esAdjuntoMudo("🎤 (audio de 0:35)"), true);
  assert.equal(Adj.esAdjuntoMudo("📷 (foto) algo"), false);
  assert.equal(Adj.esAdjuntoMudo("hola"), false);

  // A new text for a stored message keeps the mark it had.
  assert.equal(Adj.conLaMarcaDe("📷 (foto) mirá", "mirá bien"), "📷 (foto) mirá bien");
  assert.equal(Adj.conLaMarcaDe("📎 (archivo: a.pdf) leé", ""), "📎 (archivo: a.pdf)");
  assert.equal(Adj.conLaMarcaDe("hola", "chau"), "chau");
  assert.equal(Adj.conLaMarcaDe("📷 (foto)", "🎥 (video) otro"), "🎥 (video) otro", "si ya trae la suya, es esa");
});

test("adjuntos: qué es lo que llegó, por adentro de los envoltorios y nunca por lo que cita", () => {
  const de = (contenido) => {
    const a = Adj.adjuntoEn(contenido);
    return a && [a.tipo, Adj.marcaDeAdjunto(a)];
  };
  assert.deepEqual(de({ imageMessage: { caption: "x" } }), ["foto", "📷 (foto)"]);
  assert.deepEqual(de({ videoMessage: {} }), ["video", "🎥 (video)"]);
  assert.deepEqual(de({ videoMessage: { gifPlayback: true } }), ["gif", "🎬 (gif)"]);
  assert.deepEqual(de({ ptvMessage: {} }), ["video", "🎥 (video)"]);
  assert.deepEqual(de({ audioMessage: { seconds: 95, ptt: true } }), ["audio", "🎤 (audio de 1:35)"]);
  assert.deepEqual(de({ audioMessage: {} }), ["audio", "🎤 (audio)"]);
  assert.deepEqual(de({ stickerMessage: {} }), ["sticker", "💟 (sticker)"]);
  assert.deepEqual(de({ documentMessage: { fileName: "apuntes (final).pdf" } }), ["archivo", "📎 (archivo: apuntes final .pdf)"], "un nombre no cierra el paréntesis de la marca");
  assert.deepEqual(de({ documentMessage: { fileName: "x".repeat(200) } })[1].length, "📎 (archivo: )".length + 60, "ni la alarga sin fin");
  assert.deepEqual(de({ documentWithCaptionMessage: { message: { documentMessage: { fileName: "a.pdf", caption: "leé esto" } } } }), ["archivo", "📎 (archivo: a.pdf)"]);
  assert.deepEqual(de({ locationMessage: { degreesLatitude: -34.9 } }), ["ubicacion", "📍 (ubicación)"]);
  assert.deepEqual(de({ contactMessage: { displayName: "El plomero" } }), ["contacto", "👤 (contacto)"], "sin el nombre, que es de un tercero");
  assert.deepEqual(de({ pollCreationMessageV3: { name: "¿Asado el sábado?" } }), ["encuesta", "📊 (encuesta: ¿Asado el sábado?)"]);
  assert.deepEqual(de({ messageContextInfo: {}, imageMessage: {} }), ["foto", "📷 (foto)"]);
  assert.deepEqual(de({ ephemeralMessage: { message: { stickerMessage: {} } } }), ["sticker", "💟 (sticker)"]);
  // A view-once says so and nothing else, by its wrapper or by its own flag.
  assert.deepEqual(de({ viewOnceMessageV2: { message: { imageMessage: { caption: "solo para vos" } } } }), ["foto", "📷 (foto de ver una vez)"]);
  assert.deepEqual(de({ audioMessage: { viewOnce: true, seconds: 5 } }), ["audio", "🎤 (audio de ver una vez)"]);
  assert.equal(Adj.adjuntoEn({ viewOnceMessageV2Extension: { message: { audioMessage: {} } } }).unaVez, true);

  for (const contenido of [null, undefined, {}, "hola", { conversation: "hola" }, { extendedTextMessage: { text: "jaja", contextInfo: { quotedMessage: { imageMessage: {} } } } }, { protocolMessage: { type: 0 } }, { pollUpdateMessage: {} }, { reactionMessage: { text: "😂" } }]) {
    assert.equal(Adj.adjuntoEn(contenido), null, JSON.stringify(contenido));
  }

  // A sticker's file, off the message: the same name lib/stickers-grupo.js gives it once downloaded.
  const archivo = Buffer.from("RIFF....WEBPun sticker");
  const hash = createHash("sha256").update(archivo).digest();
  assert.equal(Adj.shaDelArchivo({ fileSha256: hash }), S.shaDe(archivo));
  assert.equal(Adj.shaDelArchivo({ fileSha256: new Uint8Array(hash) }), S.shaDe(archivo));
  assert.equal(Adj.shaDelArchivo({ fileSha256: hash.toString("base64") }), S.shaDe(archivo), "como queda al pasar por JSON");
  for (const sin of [undefined, {}, { fileSha256: "" }, { fileSha256: Buffer.alloc(5) }]) assert.equal(Adj.shaDelArchivo(sin), null);

  // And what the bot sends, from the content it hands to sendMessage.
  assert.equal(Adj.marcaDeEnvio({ text: "hola" }), null);
  assert.equal(Adj.marcaDeEnvio(undefined), null);
  assert.equal(Adj.marcaDeEnvio({ image: { url: "x.jpg" }, caption: "c" }), "📷 (foto)");
  assert.equal(Adj.marcaDeEnvio({ video: Buffer.alloc(1), gifPlayback: true }), "🎬 (gif)");
  assert.equal(Adj.marcaDeEnvio({ audio: { url: "x.mp3" }, ptt: true }), "🎤 (audio)");
  assert.equal(Adj.marcaDeEnvio({ sticker: Buffer.alloc(1) }), "💟 (sticker)");
  assert.equal(Adj.marcaDeEnvio({ document: { url: "x" }, fileName: "backup.db" }), "📎 (archivo: backup.db)");
  assert.equal(Adj.marcaDeEnvio({ poll: { name: "¿Sale asado?", values: ["sí", "no"] } }), "📊 (encuesta: ¿Sale asado?)");
});

// ---------- what a message leaves in her memory ----------

test("memoria corta: una foto, un sticker, un audio o un archivo quedan por su marca, con lo que decían", async () => {
  const chat = chatNuevo();
  const llega = async (extra) => {
    const m = mensaje(chat, extra);
    await MemoriaCorta.before(m, { user: {} });
    return guardada(chat, m.key.id);
  };
  const digitos = BETO.split("@")[0];

  const foto = await llega({ message: { imageMessage: { caption: `mirá @${digitos}`, contextInfo: { mentionedJid: [BETO] } } }, text: `mirá @${digitos}`, mentionedJid: [BETO], mtype: "imageMessage" });
  assert.deepEqual([foto.texto, foto.comando, foto.esAudio, foto.sha], ["📷 (foto) mirá @Beto", false, undefined, undefined], "con la mención como nombre, igual que un texto");

  const hash = createHash("sha256").update("un sticker").digest();
  const sticker = await llega({ message: { stickerMessage: { fileSha256: hash } }, mtype: "stickerMessage" });
  assert.deepEqual([sticker.texto, sticker.sha, sticker.comando], ["💟 (sticker)", hash.toString("hex"), false], "con el nombre de su archivo, sin bajarlo");

  const audio = await llega({ message: { audioMessage: { seconds: 35, ptt: true } }, mtype: "audioMessage" });
  assert.deepEqual([audio.texto, audio.esAudio], ["🎤 (audio de 0:35)", true], "un audio de otro: sabe que está, no qué dice");

  const archivo = await llega({ message: { documentWithCaptionMessage: { message: { documentMessage: { fileName: "apuntes.pdf", caption: "para el parcial" } } } }, mtype: "documentWithCaptionMessage" });
  assert.equal(archivo.texto, "📎 (archivo: apuntes.pdf) para el parcial", "el pie viene adentro del envoltorio");

  const unaVez = await llega({ message: { viewOnceMessageV2: { message: { imageMessage: { caption: "esto es solo para vos" } } } }, mtype: "viewOnceMessageV2" });
  assert.equal(unaVez.texto, "📷 (foto de ver una vez)", "lo que decía era para quien la abre");

  const encuesta = await llega({ message: { pollCreationMessageV3: { name: "¿Asado el sábado?" } }, mtype: "pollCreationMessageV3" });
  assert.equal(encuesta.texto, "📊 (encuesta: ¿Asado el sábado?)");

  // A command typed as a photo's caption is a command, by what was typed and not by the mark in front of it.
  const reales = cargados.plugins;
  cargados.plugins = { "sticker.js": { cmd: ["s"] } };
  try {
    const comando = await llega({ message: { imageMessage: { caption: ".s" } }, text: ".s", mtype: "imageMessage" });
    assert.deepEqual([comando.texto, comando.comando], ["📷 (foto) .s", true]);
    assert.equal(CC.fueComando(comando), true);
  } finally {
    cargados.plugins = reales;
  }

  // What nobody said leaves nothing: a vote in a poll, a reaction, a message with nothing in it.
  const antes = CC.contextoChat.get(chat).length;
  for (const extra of [{ message: { pollUpdateMessage: {} }, mtype: "pollUpdateMessage" }, { message: { reactionMessage: { text: "😂" } }, text: "😂", mtype: "reactionMessage" }, { message: {} }, {}]) {
    await MemoriaCorta.before(mensaje(chat, extra), { user: {} });
  }
  assert.equal(CC.contextoChat.get(chat).length, antes);
  // Nor what the moderation deleted, a photo included.
  await MemoriaCorta.before(mensaje(chat, { message: { imageMessage: { caption: "spam" } }, text: "spam", moderado: true }), { user: {} });
  assert.equal(CC.contextoChat.get(chat).length, antes);
});

test("memoria corta: guarda a qué mensaje responde cada uno y de quién era, sin copiar lo que decía", async () => {
  const chat = chatNuevo();
  const llega = async (extra) => {
    const m = mensaje(chat, extra);
    await MemoriaCorta.before(m, { user: {} });
    return guardada(chat, m.key.id);
  };
  const aBeto = await llega({ text: "yo voy", quoted: { id: "Q1", fromMe: false, sender: BETO, text: "¿quién va al asado?" } });
  assert.deepEqual([aBeto.citaId, aBeto.citaA], ["Q1", "Beto"]);
  assert.equal(JSON.stringify(aBeto).includes("asado"), false, "lo citado no se copia: borrado, tiene que irse también de acá");

  const aClaudia = await llega({ text: "jaja tal cual", quoted: { id: "Q2", fromMe: true, sender: "bot@lid", text: "pasenla lindo" } });
  assert.deepEqual([aClaudia.citaId, aClaudia.citaA], ["Q2", "un mensaje tuyo"]);

  const aNadieConocido = await llega({ text: "¿y vos quién sos?", quoted: { id: "Q3", fromMe: false, sender: "7199999@lid" } });
  assert.deepEqual([aNadieConocido.citaId, aNadieConocido.citaA], ["Q3", undefined], "sin nombre no se inventa uno");

  const conFoto = await llega({ message: { imageMessage: { caption: "así quedó" } }, text: "así quedó", quoted: { id: "Q1", fromMe: false, sender: BETO } });
  assert.deepEqual([conFoto.texto, conFoto.citaId], ["📷 (foto) así quedó", "Q1"]);

  const suelto = await llega({ text: "hola" });
  assert.deepEqual([suelto.citaId, suelto.citaA], [undefined, undefined]);
  // A quote that can't be read costs the reply nothing.
  const rota = mensaje(chat, { text: "igual queda" });
  Object.defineProperty(rota, "quoted", {
    get() {
      throw new Error("cita rota");
    },
  });
  await MemoriaCorta.before(rota, { user: {} });
  assert.equal(guardada(chat, rota.key.id).texto, "igual queda");
});

test("memoria corta: el pie de una foto, editado, sigue siendo de una foto; y lo que llegó tarde entra con su marca", async () => {
  const chat = chatNuevo();
  const correr = (extra) => MemoriaCorta.before(mensaje(chat, extra), { user: {} });
  const edicion = (id, editedMessage) => ({ protocolMessage: { type: 14, key: { id }, editedMessage } });
  const texto = () => guardada(chat, "F1")?.texto;

  await correr({ message: { imageMessage: { caption: "mi nuevo auto" } }, text: "mi nuevo auto", key: { id: "F1", participant: ANA } });
  await correr({ message: edicion("F1", { imageMessage: { caption: "mi auto nuevo" } }) });
  assert.equal(texto(), "📷 (foto) mi auto nuevo");
  await correr({ message: edicion("F1", { conversation: "el auto" }) });
  assert.equal(texto(), "📷 (foto) el auto", "venga como venga la edición");
  await correr({ sender: BETO, message: edicion("F1", { imageMessage: { caption: "una chatarra" } }), key: { id: "F2", participant: BETO } });
  assert.equal(texto(), "📷 (foto) el auto", "nadie más la cambia");
  await correr({ message: edicion("F1", { imageMessage: { caption: "  " } }) });
  assert.equal(texto(), "📷 (foto)", "sin pie sigue estando la foto");
  await correr({ message: { protocolMessage: { type: 0, key: { id: "F1" } } } });
  assert.equal(guardada(chat, "F1"), undefined, "y borrada, se va");

  // Sent while the bot was down (handle-message.js): a photo is part of what was said, too. Not in private, as before.
  const tarde = mensaje(chat, { message: { imageMessage: {} }, key: { id: "T1", participant: ANA } });
  assert.equal(MC.guardarAtrasado(tarde), "guardado");
  assert.equal(guardada(chat, "T1").texto, "📷 (foto)");
  assert.equal(MC.guardarAtrasado(mensaje("7100001@s.whatsapp.net", { isGroup: false, message: { imageMessage: {} } })), null);
  assert.equal(MC.guardarAtrasado(mensaje(chat, { message: { pollUpdateMessage: {} } })), null);
});

test("memoria: lo nuevo de cada mensaje pasa a la copia, y una copia de antes se queda con la marca", () => {
  const chat = chatNuevo();
  const copia = CC.crearMemoria();
  CC.alCambiarMemoria((cambio) => assert.equal(copia.aplicarCambio(JSON.parse(JSON.stringify(cambio))), true, cambio.op));
  try {
    const ahora = Date.now();
    CC.recordarMensaje(chat, "Ana", "💟 (sticker)", false, { id: "K1", usuario: ANA, fecha: ahora - 3000, comando: false, sha: SHA(1), citaId: "K0", citaA: "Beto" });
    CC.recordarMensaje(chat, "Claudia", "🎡 Salió el 14", true, { id: "K2", fecha: ahora - 2000, comando: true, citaId: "K1" });
    CC.recordarMensaje(chat, "Ana", "📷 (foto) mirá", false, { id: "K3", usuario: ANA, fecha: ahora - 1000, comando: false });
    assert.deepEqual(copia.chats.get(chat), CC.contextoChat.get(chat));
    assert.deepEqual(
      CC.contextoChat.get(chat).map((e) => [e.id, e.sha, e.citaId, e.citaA, e.comando]),
      [
        ["K1", SHA(1), "K0", "Beto", false],
        ["K2", undefined, "K1", undefined, true],
        ["K3", undefined, undefined, undefined, false],
      ],
    );
  } finally {
    CC.alCambiarMemoria(null);
  }
  assert.equal(CC.mensajeEnMemoria(chat, "K2").texto, "🎡 Salió el 14");
  assert.equal(CC.mensajeEnMemoria(chat, "NO"), null);
  assert.equal(CC.mensajeEnMemoria(chat, null), null);

  // What doesn't fit isn't kept: a sha that isn't one, a reply to nothing.
  const otro = chatNuevo();
  CC.recordarMensaje(otro, "Ana", "💟 (sticker)", false, { id: "K4", sha: "no-es-un-sha", citaId: "", citaA: "" });
  assert.deepEqual(Object.keys(CC.mensajeEnMemoria(otro, "K4")).sort(), ["esBot", "fecha", "id", "nombre", "participant", "texto", "usuario"]);

  // The supervisor may still be the one from before this (lib/relevo-memoria.js): it keeps the fields it knew. Back
  // from it, a photo is still told by its mark, and what the bot sent is still the bot's machinery.
  const deAntes = { v: 1, desde: Date.now() - HORA, ingresos: [], chats: [[chatNuevo(), { recorte: null, mensajes: [
    { nombre: "Ana", texto: "📷 (foto)", esBot: false, fecha: Date.now() - 2000, id: "V1", usuario: ANA, participant: null, comando: false },
    { nombre: "Claudia", texto: "🎡 Salió el 14", esBot: true, fecha: Date.now() - 1000, id: "V2", usuario: null, participant: null, comando: true },
  ] }]] };
  assert.equal(CC.restaurarMemoria(deAntes), true);
  const [foto, salida] = CC.contextoChat.get(deAntes.chats[0][0]);
  assert.equal(H.esLegible(foto), false);
  assert.equal(H.seCita(foto), false);
  assert.equal(CC.fueComando(salida), true);
});

// ---------- how it's written ----------

test("hilo: cada línea dice hace cuánto fue, y de Claudia cuál es su charla y cuál lo que mandó el bot", () => {
  const chat = chatNuevo();
  const ahora = Date.now();
  guardar(chat, "Ana", "¿alguien para un fútbol?", 5 * 60 + 30, {}, ahora);
  guardar(chat, "Beto", "yo", 3, {}, ahora);
  CC.recordarMensaje(chat, "Claudia", "yo miro desde el banco", true, { id: "B1", fecha: ahora - 2 * MIN, comando: false });
  CC.recordarMensaje(chat, "Beto", ".ruleta 100 rojo", false, { id: "B2", usuario: "Beto@lid", fecha: ahora - MIN, comando: true });
  CC.recordarMensaje(chat, "Claudia", "🎡 *Ruleta* · salió el 14 rojo, @Beto gana 200", true, { id: "B3", fecha: ahora - 30 * 1000, comando: true, citaId: "B2" });
  assert.deepEqual(lineas(chat, ahora), [
    "- Ana (hace 5 h 30 min): ¿alguien para un fútbol?",
    "- Beto (hace 3 min): yo",
    "- Claudia (vos, hace 2 min): yo miro desde el banco",
    "- Beto (hace 1 min): .ruleta 100 rojo",
    "- Claudia (vos, automático, recién, respondiendo a Beto): 🎡 *Ruleta* · salió el 14 rojo, @Beto gana 200",
  ]);
  assert.equal(H.hace(0), "recién");
  assert.equal(H.hace(59 * 1000), "recién");
  assert.equal(H.hace(-5000), "recién", "un reloj corrido no da un tiempo negativo");
  assert.equal(H.hace(2 * DIA + 3 * HORA), "hace 2 d 3 h");
  // One of hers kept by a version from before the marks is her chat, unless it reads as a command.
  CC.recordarMensaje(chat, "Claudia", "de antes de las marcas", true, { id: "B4", fecha: ahora });
  assert.equal(lineas(chat, ahora).at(-1), "- Claudia (vos, recién): de antes de las marcas");
  assert.equal(H.textoDelHilo("hilo-sin-nada@g.us"), "");
});

test("hilo: una respuesta dice a quién y a qué, leído de la memoria como está ahora", () => {
  const chat = chatNuevo();
  const ahora = Date.now();
  const larga = "¿quién trae el hielo para el sábado, que somos como veinte y la vez pasada no alcanzó ni para arrancar la noche?";
  const pregunta = guardar(chat, "Ana", larga, 30, { usuario: ANA }, ahora);
  guardar(chat, "Beto", "che, ¿y el fútbol?", 20, {}, ahora);
  const respuestaDeCaro = guardar(chat, "Caro", "yo llevo", 10, { citaId: pregunta, citaA: "Ana" }, ahora);
  guardar(chat, "Beto", "genia", 9, { citaId: respuestaDeCaro, citaA: "Caro" }, ahora);
  const deClaudia = "CL1";
  CC.recordarMensaje(chat, "Claudia", "yo llevo las ganas", true, { id: deClaudia, fecha: ahora - 8 * MIN, comando: false });
  guardar(chat, "Ana", "jajaja", 7, { citaId: deClaudia, citaA: "un mensaje tuyo" }, ahora);
  guardar(chat, "Beto", "¿cómo era?", 6, { citaId: "YA-NO-ESTA", citaA: "Dani" }, ahora);
  guardar(chat, "Beto", "a esto no sé quién lo dijo", 5, { citaId: "TAMPOCO" }, ahora);
  guardar(chat, "Caro", "qué viva", 4, { citaId: deClaudia, citaA: "un mensaje tuyo" }, ahora);

  const texto = lineas(chat, ahora);
  assert.equal(texto[2], `- Caro (hace 10 min, respondiendo a Ana: «${larga.slice(0, H.HILO.MAX_CITA).trim()}…»): yo llevo`, "lo citado, recortado");
  assert.ok(larga.length > H.HILO.MAX_CITA && texto[2].includes("la vez pasada") && !texto[2].includes("arrancar"));
  assert.equal(texto[3], "- Beto (hace 9 min, respondiendo a Caro): genia", "al de arriba no hace falta repetirlo");
  assert.equal(texto[5], "- Ana (hace 7 min, respondiendo a un mensaje tuyo): jajaja");
  assert.equal(texto[6], "- Beto (hace 6 min, respondiendo a Dani): ¿cómo era?", "de lo que ya no está en la memoria queda de quién era");
  assert.equal(texto[7], "- Beto (hace 5 min): a esto no sé quién lo dijo");
  assert.equal(texto[8], "- Caro (hace 4 min, respondiendo a un mensaje tuyo: «yo llevo las ganas»): qué viva");

  // Edited, it shows as it was left; deleted, what it said is gone from the reply too.
  CC.editarMensaje(chat, pregunta, "¿quién trae el hielo?", [ANA]);
  assert.equal(lineas(chat, ahora)[2], "- Caro (hace 10 min, respondiendo a Ana: «¿quién trae el hielo?»): yo llevo");
  CC.olvidarMensaje(chat, pregunta);
  assert.equal(lineas(chat, ahora)[1], "- Caro (hace 10 min, respondiendo a Ana): yo llevo");
  assert.equal(lineas(chat, ahora).some((l) => l.includes("hielo")), false);
});

test("hilo: un sticker se lee por lo que la IA vio en él, y una tanda de fotos es una línea", () => {
  const chat = chatNuevo();
  const ahora = Date.now();
  descripciones.set(SHA(1), "gato llorando, para tristeza exagerada");
  guardar(chat, "Ana", "💟 (sticker)", 30, { sha: SHA(1), id: "ST1" }, ahora);
  guardar(chat, "Beto", "💟 (sticker)", 29, { sha: SHA(2), id: "ST2" }, ahora);
  guardar(chat, "Beto", "💟 (sticker)", 28.5, { sha: SHA(3), id: "ST3" }, ahora);
  guardar(chat, "Caro", "💟 (sticker)", 28, { id: "ST4" }, ahora);
  for (const haceMin of [20, 19.9, 19.8, 19.7]) guardar(chat, "Ana", "📷 (foto)", haceMin, {}, ahora);
  guardar(chat, "Ana", "📷 (foto) y esta es la mejor", 19.6, { id: "FOTO-CON-PIE" }, ahora);
  guardar(chat, "Ana", "📷 (foto)", 19.5, {}, ahora);
  guardar(chat, "Beto", "📷 (foto)", 19.4, {}, ahora);
  guardar(chat, "Beto", "🎥 (video)", 19.3, {}, ahora);
  guardar(chat, "Beto", "📷 (foto)", 10, {}, ahora);
  guardar(chat, "Beto", "📷 (foto)", 9.9, { citaId: "ST1", citaA: "Ana" }, ahora);
  assert.deepEqual(lineas(chat, ahora), [
    "- Ana (hace 30 min): 💟 (sticker: gato llorando, para tristeza exagerada)",
    "- Beto (hace 29 min): 💟 (2 stickers)",
    "- Caro (hace 28 min): 💟 (sticker)",
    "- Ana (hace 20 min): 📷 (4 fotos)",
    "- Ana (hace 19 min): 📷 (foto) y esta es la mejor",
    "- Ana (hace 19 min): 📷 (foto)",
    "- Beto (hace 19 min): 📷 (foto)",
    "- Beto (hace 19 min): 🎥 (video)",
    "- Beto (hace 10 min): 📷 (foto)",
    "- Beto (hace 9 min, respondiendo a Ana: «💟 (sticker: gato llorando, para tristeza exagerada)»): 📷 (foto)",
  ]);
  // What she can read, and what a glance can quote.
  const de = (id) => guardada(chat, id);
  assert.deepEqual(["ST1", "ST2", "ST4", "FOTO-CON-PIE"].map((id) => H.esLegible(de(id))), [true, false, false, true]);
  assert.deepEqual(["ST1", "FOTO-CON-PIE"].map((id) => H.seCita(de(id))), [false, false], "de un adjunto está guardada la marca, no lo que es");
  assert.equal(H.esLegible({ texto: "hola" }), true);
  assert.equal(H.seCita({ texto: "hola" }), true);
  assert.equal(H.seCita({ texto: "🎤 (audio) cuenta algo", esAudio: true }), false);
  // A description that can't be read costs nothing: the sticker stays a sticker.
  const real = H._dep.descripcion;
  H._dep.descripcion = () => {
    throw new Error("base caída");
  };
  try {
    assert.equal(H.textoDe(de("ST1")), "💟 (sticker)");
    assert.equal(H.esLegible(de("ST1")), false);
  } finally {
    H._dep.descripcion = real;
  }
});

test("hilo: lo que la IA vio en un sticker sale de la base, por el archivo", () => {
  const real = H._dep.descripcion;
  H._dep.descripcion = (sha) => S.descripcionDe(sha);
  try {
    db.prepare("INSERT INTO stickers_descripcion (sha, descripcion, intentos, ultimo_intento) VALUES (?, ?, 1, 0)").run(SHA(9), "perro con anteojos, para hacerse el canchero");
    assert.equal(H.textoDe({ texto: "💟 (sticker)", sha: SHA(9) }), "💟 (sticker: perro con anteojos, para hacerse el canchero)");
    assert.equal(H.textoDe({ texto: "💟 (sticker)", sha: SHA(8) }), "💟 (sticker)", "uno que todavía no miró");
    assert.equal(H.textoDe({ texto: "hola", sha: SHA(9) }), "hola", "y solo de un sticker");
  } finally {
    H._dep.descripcion = real;
  }
});

// ---------- what of it she gets ----------

test("hilo: catorce líneas de charla y, entre ellas, los últimos comandos con lo que contestó el bot", () => {
  const chat = chatNuevo();
  const ahora = Date.now();
  const comando = (n, haceMin) => {
    CC.recordarMensaje(chat, "Beto", `.bal ${n}`, false, { id: `CMD${n}`, usuario: BETO, fecha: ahora - haceMin * MIN, comando: true });
    CC.recordarMensaje(chat, "Claudia", `🪙 saldo ${n}`, true, { id: `SAL${n}`, fecha: ahora - haceMin * MIN + 1000, comando: true, citaId: `CMD${n}` });
  };
  comando(0, 200); // from before the conversation she gets: out
  for (let i = 0; i < 20; i++) guardar(chat, "Ana", `charla ${i}`, 100 - i, {}, ahora);
  for (let n = 1; n <= 5; n++) comando(n, 50 - n);
  guardar(chat, "Ana", "y ahora qué", 2, {}, ahora);

  const entradas = H.entradasDelHilo(chat);
  const charla = entradas.filter((e) => !CC.fueComando(e)).map((e) => e.texto);
  assert.equal(charla.length, CC.MEMORIA_CORTA.EN_CONTEXTO);
  assert.deepEqual([charla[0], charla.at(-1)], ["charla 7", "y ahora qué"], "los comandos ya no le sacan líneas a la charla");
  assert.deepEqual(entradas.filter((e) => CC.fueComando(e)).map((e) => e.id), ["CMD3", "SAL3", "CMD4", "SAL4", "CMD5", "SAL5"], "los últimos seis, en su lugar");
  assert.deepEqual(entradas.map((e) => e.fecha), [...entradas.map((e) => e.fecha)].sort((a, b) => a - b), "todo en el orden en que pasó");

  // Up to the message being answered, which goes apart.
  const hasta = H.entradasDelHilo(chat, "SAL4");
  assert.equal(hasta.at(-1).id, "CMD4");
  // A chat where only commands were typed still gets the latest of them.
  const soloComandos = chatNuevo();
  for (let n = 0; n < 9; n++) CC.recordarMensaje(soloComandos, "Beto", `.bal ${n}`, false, { id: `SOLO${n}`, fecha: ahora - (20 - n) * MIN, comando: true });
  assert.deepEqual(H.entradasDelHilo(soloComandos).map((e) => e.id), ["SOLO3", "SOLO4", "SOLO5", "SOLO6", "SOLO7", "SOLO8"]);
});

test("hilo: una tanda de fotos ocupa una sola de las catorce líneas", () => {
  const chat = chatNuevo();
  const ahora = Date.now();
  for (let i = 0; i < 20; i++) guardar(chat, "Beto", `charla ${i}`, 100 - i, {}, ahora);
  for (let i = 0; i < 12; i++) guardar(chat, "Ana", "📷 (foto)", 10 - i / 100, {}, ahora);
  guardar(chat, "Ana", "esas son las del viaje", 9, {}, ahora);
  const texto = lineas(chat, ahora);
  assert.equal(texto.length, CC.MEMORIA_CORTA.EN_CONTEXTO);
  assert.deepEqual(texto.slice(-2), ["- Ana (hace 10 min): 📷 (12 fotos)", "- Ana (hace 9 min): esas son las del viaje"]);
  assert.equal(texto[0], "- Beto (hace 1 h 32 min): charla 8", "un álbum no empuja la charla afuera");

  // A run that falls on the oldest of the fourteen lines comes whole: not cut where the count ends.
  const alBorde = chatNuevo();
  guardar(alBorde, "Beto", "esto ya no entra", 60, {}, ahora);
  for (let i = 0; i < 5; i++) guardar(alBorde, "Ana", "📷 (foto)", 50 - i / 100, {}, ahora);
  for (let i = 0; i < 13; i++) guardar(alBorde, "Beto", `charla ${i}`, 40 - i, {}, ahora);
  assert.deepEqual(lineas(alBorde, ahora).slice(0, 2), ["- Ana (hace 50 min): 📷 (5 fotos)", "- Beto (hace 40 min): charla 0"]);
  assert.equal(lineas(alBorde, ahora).length, CC.MEMORIA_CORTA.EN_CONTEXTO);
});

test("hilo: la pregunta de un juego no le llega, ni por lo que mandó el bot ni por quien la contesta", () => {
  const chat = chatNuevo();
  const ahora = Date.now();
  guardar(chat, "Ana", "dale, una trivia", 5, {}, ahora);
  CC.recordarMensaje(chat, "Ana", ".trivia", false, { id: "TR0", usuario: ANA, fecha: ahora - 4 * MIN, comando: true });
  CC.recordarMensaje(chat, "Claudia", "🧠 *Trivia* ¿Cuál es la capital de Mongolia? a) Ulán Bator b) Astaná", true, { id: "TR1", fecha: ahora - 4 * MIN + 1000, comando: true, citaId: "TR0" });
  J.marcarMensajeDeJuego("TR1", chat, { juego: "trivia" });
  guardar(chat, "Beto", "b", 3, { citaId: "TR1", citaA: "un mensaje tuyo" }, ahora);
  const texto = H.textoDelHilo(chat, null, ahora);
  assert.doesNotMatch(texto, /Mongolia|Ulán/, "con la pregunta delante, la contestaba");
  assert.deepEqual(texto.split("\n"), ["- Ana (hace 5 min): dale, una trivia", "- Ana (hace 4 min): .trivia", "- Beto (hace 3 min, respondiendo a un juego del bot): b"]);
});

test("hilo: la leyenda va solo cuando hay algo que explicar", () => {
  assert.equal(H.leyendaDe([{ texto: "hola" }, { texto: "dale", esBot: true, comando: false }]), "");
  assert.equal(H.leyendaDe([{ texto: "📷 (foto)" }]), H.LEYENDA_ADJUNTOS);
  assert.equal(H.leyendaDe([{ texto: "🎡 salió el 14", esBot: true, comando: true }]), H.LEYENDA_AUTOMATICOS);
  assert.equal(H.leyendaDe([{ texto: "💟 (sticker)" }, { texto: "🎡 salió el 14", esBot: true, comando: true }]), `${H.LEYENDA_ADJUNTOS} ${H.LEYENDA_AUTOMATICOS}`);
  assert.equal(H.leyendaDe([{ texto: ".bal", comando: true }]), "", "un comando que tipeó alguien se entiende solo");
});

// ---------- the moment, and who's writing ----------

test("el día y la hora, en palabras", () => {
  assert.equal(T.diaYHora(new Date(2026, 10, 18, 19, 5).getTime()), "miércoles 18 de noviembre de 2026, 19:05");
  assert.equal(T.diaYHora(new Date(2026, 8, 1, 0, 0).getTime()), "martes 1 de setiembre de 2026, 00:00");
  assert.equal(T.diaYHora(new Date(2027, 0, 3, 9, 30).getTime()), "domingo 3 de enero de 2027, 09:30");
});

test("quién le escribe: su rol, hace cuánto escribe en el grupo y con qué rango, y un cumpleaños cercano", () => {
  const chat = chatNuevo();
  const AHORA = new Date(2026, 10, 18, 15, 0).getTime();
  const con = (extra) => Q.quienEscribe({ chat, usuario: CARO, nombre: "Caro", ahora: AHORA, ...extra });
  const DE_FONDO = "Sobre Caro, para que sepas con quién hablás (es de fondo: no lo saques si no viene al caso): ";
  const enElGrupo = (dias, messageCount) => ({ inGroup: { [chat]: { desde: AHORA - dias * DIA - HORA, messageCount } } });

  assert.equal(con({}), "", "de quien no hay nada que contar, nada");
  assert.equal(con({ isOwner: true, isAdmin: true, isMod: true }), `${DE_FONDO}es owner del bot: de la gente que te programa y te mantiene, y le tenés confianza.`);
  assert.equal(con({ isAdmin: true, isMod: true }), `${DE_FONDO}es admin del grupo.`);
  assert.equal(con({ isMod: true }), `${DE_FONDO}tiene el rol de moderador del bot en este grupo.`);

  assert.equal(con({ user: enElGrupo(0, 3) }), `${DE_FONDO}empezó a escribir en este grupo hoy (su rango acá: Nuevo).`);
  assert.equal(con({ user: enElGrupo(1, 3) }), `${DE_FONDO}hace 1 día que escribe en este grupo (su rango acá: Nuevo).`);
  assert.equal(con({ user: enElGrupo(45, 600) }), `${DE_FONDO}hace 45 días que escribe en este grupo (su rango acá: De la casa).`);
  assert.equal(con({ user: enElGrupo(100, 600) }), `${DE_FONDO}hace 3 meses que escribe en este grupo (su rango acá: De la casa).`);
  assert.equal(con({ user: enElGrupo(365, 50) }), `${DE_FONDO}hace 1 año que escribe en este grupo (su rango acá: Nuevo).`, "el rango pide días y mensajes");
  assert.equal(con({ user: enElGrupo(800, 20000), isAdmin: true }), `${DE_FONDO}es admin del grupo; hace 2 años y 2 meses que escribe en este grupo (su rango acá: Leyenda).`);
  // The rank in her gender (.genero), and nothing of a group she has no row of.
  F.updateUser(ANA, { genero: "mujer" });
  try {
    assert.match(Q.quienEscribe({ chat, usuario: ANA, nombre: "Ana", ahora: AHORA, user: enElGrupo(100, 2500) }), /\(su rango acá: Veterana\)\.$/);
  } finally {
    F.updateUser(ANA, { genero: "" });
  }
  assert.equal(con({ user: { inGroup: { "otro@g.us": { desde: AHORA - 100 * DIA, messageCount: 9000 } } } }), "");

  // The birthday is the group's own note (.cumple), under either of their ids.
  const cumple = (dia, mes, anio = null, usuario = CARO) => {
    F.borrarCumple(chat, CARO);
    F.borrarCumple(chat, NUMERO_DE_ANA);
    F.setCumple(chat, usuario, dia, mes, anio);
  };
  cumple(18, 11, 1998);
  assert.equal(con({}), `${DE_FONDO}hoy es su cumpleaños (cumple 28), y todavía no le dijiste nada.`);
  F.marcarPeriodoCerrado(chat, `cumple:${CARO}`, "2026-11-18");
  assert.equal(con({}), `${DE_FONDO}hoy es su cumpleaños (cumple 28), y el saludo ya se lo mandaste al grupo esta mañana.`, "el del bot ya salió: no hace falta otro");
  cumple(18, 11);
  assert.match(con({}), /hoy es su cumpleaños, y el saludo/, "anotado sin el año, sin la edad");
  cumple(19, 11, 1998);
  assert.equal(con({ isMod: true }), `${DE_FONDO}tiene el rol de moderador del bot en este grupo; mañana es su cumpleaños.`);
  cumple(25, 11, 1998);
  assert.equal(con({}), `${DE_FONDO}su cumpleaños es en 7 días.`);
  cumple(26, 11, 1998);
  assert.equal(con({}), "", "a más de una semana no viene al caso");
  cumple(17, 11, 1998);
  assert.equal(con({}), `${DE_FONDO}ayer fue su cumpleaños.`);
  cumple(16, 11, 1998);
  assert.equal(con({}), "");
  cumple(19, 11, 1990, NUMERO_DE_ANA);
  assert.equal(Q.quienEscribe({ chat, usuario: ANA, numero: NUMERO_DE_ANA, nombre: "Ana", ahora: AHORA }), "Sobre Ana, para que sepas con quién hablás (es de fondo: no lo saques si no viene al caso): mañana es su cumpleaños.");
  assert.equal(Q.quienEscribe({ chat: "otro-grupo@g.us", usuario: ANA, numero: NUMERO_DE_ANA, nombre: "Ana", ahora: AHORA }), "", "lo anotado en un grupo es de ese grupo");

  // In private, only who they are to the bot.
  cumple(18, 11, 1998);
  assert.equal(con({ esGrupo: false, user: enElGrupo(100, 600) }), "");
  assert.equal(con({ esGrupo: false, isOwner: true }), `${DE_FONDO}es owner del bot: de la gente que te programa y te mantiene, y le tenés confianza.`);
});

// ---------- all of it, in what she's asked ----------

// A client whose sends go through the bot's own wrapper (lib/envios.js), as the real one's do.
function clienteReal() {
  const client = { ...clienteFalso(), user: { lid: "bot@lid", id: "bot@s.whatsapp.net", jid: "bot@s.whatsapp.net" }, sendPresenceUpdate: async () => {} };
  E.envolverEnvios(client);
  // sendText as lib/wa-socket.js has it: on top of sendMessage.
  client.sendText = (jid, text, quoted, opciones = {}) => client.sendMessage(jid, { ...opciones, text }, quoted ? { quoted } : {});
  return client;
}

test("charlando: le llega la hora, el hilo con sus tiempos y sus respuestas, lo que mandó el bot y quién le escribe", async () => {
  const chat = chatNuevo();
  const client = clienteReal();
  const permisos = { client, participants: [], isBotAdmin: true, isOwner: false, isAdmin: true, isMod: true, chat: { mentions: 1 } };
  const ahora = Date.now();
  IA._dep.ahora = () => ahora;
  const user = { inGroup: { [chat]: { desde: ahora - 100 * DIA, messageCount: 600 } } };
  const llega = async (extra) => {
    const m = mensaje(chat, extra);
    await MemoriaCorta.before(m, { ...permisos, user });
    return m;
  };
  try {
    guardar(chat, "Caro", "¿alguien se prende a un asado el sábado?", 5 * 60, { id: "ASADO" }, ahora);
    const foto = await llega({ sender: BETO, pushName: "Beto", key: { id: "FOTO", participant: BETO }, message: { imageMessage: { caption: "así quedó la parrilla" } }, text: "así quedó la parrilla", quoted: { id: "ASADO", fromMe: false, sender: CARO } });
    const ruleta = await llega({ text: ".ruleta 100 rojo", key: { id: "RULETA", participant: ANA } });
    // What the command answered, through the same sendMessage everything goes out by.
    await client.sendMessage(chat, { text: `🎡 *Ruleta* · salió el 14 rojo, @${ANA.split("@")[0]} gana 200`, mentions: [ANA] }, { quoted: ruleta });
    assert.equal(foto.key.id, "FOTO");

    ritmoDeClaudia.delete(chat);
    prompts.length = 0;
    respuesta = { comando: "ninguno", respuesta: "Nada de robar, ganaste 200" };
    const pregunta = await llega({ text: "claudia, ¿me robaste en la ruleta?", key: { id: "PREGUNTA", participant: ANA } });
    await AutoIA.before(pregunta, { ...permisos, user });

    assert.equal(prompts.length, 1);
    const [prompt] = prompts;
    assert.ok(prompt.includes(`\n\nAhora es ${T.diaYHora(ahora)}.\n\n`), prompt);
    const hilo = prompt.match(/Últimos mensajes del grupo, del más viejo al más nuevo, con hace cuánto se mandó cada uno[^\n]*:\n([\s\S]*?)\n\n/)?.[1];
    assert.deepEqual(hilo?.split("\n"), [
      "- Caro (hace 5 h 0 min): ¿alguien se prende a un asado el sábado?",
      "- Beto (recién, respondiendo a Caro): 📷 (foto) así quedó la parrilla",
      "- Ana (recién): .ruleta 100 rojo",
      "- Claudia (vos, automático, recién, respondiendo a Ana): 🎡 *Ruleta* · salió el 14 rojo, @Ana gana 200",
    ]);
    assert.ok(prompt.includes(`\n\n(${H.LEYENDA_ADJUNTOS} ${H.LEYENDA_AUTOMATICOS})\n\n`), "con qué es cada marca y qué es lo automático");
    assert.ok(prompt.includes("\n\nSobre Ana, para que sepas con quién hablás (es de fondo: no lo saques si no viene al caso): es admin del grupo; hace 3 meses que escribe en este grupo (su rango acá: De la casa).\n\n"), prompt);
    assert.match(prompt, /Mensaje de Ana: "claudia, ¿me robaste en la ruleta\?"/);

    // What she answers stays as her chat, once, and what the bot sent as the bot's.
    const suyas = CC.contextoChat.get(chat).filter((e) => e.esBot);
    assert.deepEqual(suyas.map((e) => [e.texto, e.comando]), [
      ["🎡 *Ruleta* · salió el 14 rojo, @Ana gana 200", true],
      ["Nada de robar, ganaste 200", false],
    ]);
    assert.equal(H.textoDelHilo(chat, null, ahora).split("\n").at(-1), "- Claudia (vos, recién): Nada de robar, ganaste 200");
  } finally {
    IA._dep.ahora = () => Date.now();
  }
});

test("charlando: en privado el hilo es de ese chat, y sin nada antes no hay hilo", async () => {
  const privado = "7100009@s.whatsapp.net";
  const client = clienteReal();
  const permisos = { client, participants: [], isBotAdmin: true, isOwner: true, isAdmin: true, isMod: true, chat: {}, user: {} };
  const hablar = async (texto) => {
    ritmoDeClaudia.delete(privado);
    prompts.length = 0;
    const m = mensaje(privado, { isGroup: false, text: texto, key: { id: `PRIV${++ids}` } });
    await MemoriaCorta.before(m, permisos);
    await AutoIA.before(m, permisos);
    return prompts[0];
  };
  respuesta = { comando: "ninguno", respuesta: "Acá andamos" };
  const primero = await hablar("claudia, ¿cómo va?");
  assert.doesNotMatch(primero, /Últimos mensajes/);
  assert.match(primero, /Ahora es [a-záé]+ \d+ de [a-z]+ de \d{4}, \d\d:\d\d\./);
  assert.match(primero, /Sobre Ana, para que sepas con quién hablás \(es de fondo: no lo saques si no viene al caso\): es owner del bot/);
  const segundo = await hablar("claudia, ¿y el servidor?");
  assert.match(segundo, /Últimos mensajes de este chat, del más viejo al más nuevo[^\n]*:\n- Ana \(recién\): claudia, ¿cómo va\?\n- Claudia \(vos, recién\): Acá andamos\n\n/);
});

test("charlando: una nota de voz para ella es su marca hasta que la escucha, y después lo que decía", async () => {
  const chat = chatNuevo();
  const client = clienteReal();
  const permisos = { client, participants: [], isBotAdmin: true, isOwner: false, isAdmin: false, isMod: false, chat: {}, user: {} };
  ritmoDeClaudia.delete(chat);
  respuesta = { comando: "ninguno", respuesta: "Uh, qué garrón", resumenAudio: "cuenta que se le rompió el auto" };
  const nota = mensaje(chat, { mtype: "audioMessage", message: { audioMessage: { seconds: 8, ptt: true } }, msg: { seconds: 8, mimetype: "audio/ogg; codecs=opus" }, download: async () => Buffer.from("OggS-audio"), quoted: { id: "CL-1", fromMe: true, text: "¿Cómo andan?" }, key: { id: "NOTA", participant: ANA } });
  await MemoriaCorta.before(nota, permisos);
  assert.deepEqual([guardada(chat, "NOTA").texto, guardada(chat, "NOTA").esAudio], ["🎤 (audio de 0:08)", true]);
  const version = CC.versionDe(chat);
  await AutoIA.before(nota, permisos);
  const hilo = CC.contextoChat.get(chat);
  assert.deepEqual(hilo.map((e) => [e.nombre, e.texto]), [
    ["Ana", "🎤 (audio) cuenta que se le rompió el auto"],
    ["Claudia", "Uh, qué garrón"],
  ], "en su lugar, una sola vez");
  assert.deepEqual([hilo[0].esAudio, hilo[0].citaId, hilo[0].citaA], [true, "CL-1", "un mensaje tuyo"]);
  assert.equal(CC.versionDe(chat), version + 1, "un resumen hecho antes de escucharla ya no es el mismo");
});
