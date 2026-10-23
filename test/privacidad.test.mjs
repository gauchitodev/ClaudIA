import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { prepararBase, clienteFalso, ultimoEnviado } from "./helpers.mjs";
import strings from "../lib/strings.js";

// What Claudia learns of each person stays in the group it was learned in (lib/memoria-persona.js); what the AI writes
// can't tag anyone (sinMenciones in lib/menciones.js); .encuesta and .inactivos only tag who they should; and the
// stickers and voice notes made from a text don't give away a mention's LID (conNombres).
// Gemini is swapped for canned answers.

let F, MP, AutoIA, IA, Resumen, Memoria, Encuesta, Inactivos, CC, Cumple, M;
let respuestaIA;
const prompts = [];
const fetchReal = globalThis.fetch;
const logReal = console.log;
const tipeoReal = {};
let RITMO;
// How many mentions sendText would make of a text: the bot's own parseMention (lib/wa-socket.js), on a socket that goes
// nowhere (before). A copy of its pattern here let the two drift apart: with parseMention taking four digits,
// sinMenciones left "@1234" in sight and no test failed.
let menciones;

const ANA = "555@lid";
const FAMILIA = "familia@g.us";
const AMIGOS = "amigos@g.us";

before(async () => {
  ({ F } = await prepararBase("privacidad"));
  globalThis.txt = strings;
  globalThis.geminiApiKey = "clave";
  ({ RITMO } = await import("../lib/ritmo.js"));
  for (const k of ["TIPEO_MIN_MS", "TIPEO_MAX_MS", "TIPEO_POR_LETRA_MS"]) tipeoReal[k] = RITMO[k];
  Object.assign(RITMO, { TIPEO_MIN_MS: 0, TIPEO_MAX_MS: 1, TIPEO_POR_LETRA_MS: 0 });
  console.log = () => {};
  globalThis.fetch = async (url, opciones) => {
    prompts.push(JSON.parse(opciones.body).contents?.[0]?.parts?.at(-1)?.text || "");
    const texto = typeof respuestaIA === "string" ? respuestaIA : JSON.stringify(respuestaIA);
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }) };
  };
  const WS = await import("../lib/wa-socket.js");
  const crearReal = WS._dep.crearSocket;
  WS._dep.crearSocket = () => ({ ...clienteFalso(), user: { id: "59800000001:5@s.whatsapp.net", lid: "200000000000001@lid" }, ev: { emit() {}, on() {} }, groupFetchAllParticipating: async () => ({}) });
  try {
    const socket = WS.makeWASocket({});
    menciones = (texto) => socket.parseMention(String(texto)).length;
  } finally {
    WS._dep.crearSocket = crearReal;
  }
  MP = await import("../lib/memoria-persona.js");
  M = await import("../lib/menciones.js");
  CC = await import("../lib/contexto-chat.js");
  Cumple = await import("../lib/cumpleanos.js");
  AutoIA = (await import("../plugins/_auto-ia.js")).default;
  IA = (await import("../plugins/tools-ia.js")).default;
  Resumen = (await import("../plugins/resumen.js")).default;
  Memoria = (await import("../plugins/memoria-grupo.js")).default;
  Encuesta = (await import("../plugins/tools-encuesta.js")).default;
  Inactivos = (await import("../plugins/grupo-inactivos.js")).default;
  for (const chat of [ANA, FAMILIA, AMIGOS]) F.initDataDB({ chat, sender: ANA, senderJid: "59899555555@s.whatsapp.net", pushName: "Ana" });
});
after(() => {
  globalThis.fetch = fetchReal;
  console.log = logReal;
  Object.assign(RITMO, tipeoReal);
});

async function hablar(chat, texto) {
  globalThis.autoIaCooldown.delete(chat);
  const client = { ...clienteFalso(), sendPresenceUpdate: async () => {} };
  const m = { chat, isGroup: chat.endsWith("@g.us"), sender: ANA, pushName: "Ana", text: texto, mentionedJid: [], quoted: null, key: { id: `M${prompts.length}` } };
  await AutoIA.before(m, { client, participants: [], isAdmin: false, isMod: false, isOwner: false, user: F.getUser(ANA), chat: F.getChat(chat) || {} });
  return globalThis.enviados.map((e) => e.msg?.text);
}

test("lo que Claudia aprende de alguien queda en ese grupo: nada del privado ni de otro grupo", async () => {
  respuestaIA = { comando: "ninguno", respuesta: "Tranqui, queda entre nosotras", recordar: "está saliendo con Pedro a escondidas" };
  await hablar(ANA, "claudia no le digas a nadie pero estoy saliendo con Pedro");
  assert.equal(MP.memoriaDe(ANA, ANA), "", "en privado no anota nada");

  respuestaIA = { comando: "ninguno", respuesta: "¡Qué lindo!", recordar: "tiene un perro que se llama Toto" };
  await hablar(FAMILIA, "claudia te presento a mi perro Toto");
  assert.equal(MP.memoriaDe(ANA, FAMILIA), "tiene un perro que se llama Toto");

  respuestaIA = { comando: "ninguno", respuesta: "¡Hola Ana!", recordar: "su contraseña del wifi es toto123" };
  await hablar(AMIGOS, "hola claudia");
  assert.doesNotMatch(prompts.at(-1), /Toto|Pedro/, "en otro grupo no sabe lo de Familia ni lo del privado");
  assert.equal(MP.memoriaDe(ANA, AMIGOS), "", "lo sensible no se guarda");

  respuestaIA = { comando: "ninguno", respuesta: "¡Hola!" };
  await hablar(FAMILIA, "hola claudia");
  assert.match(prompts.at(-1), /Lo que ya sabés de Ana por charlas anteriores en este grupo: tiene un perro que se llama Toto/);
  assert.doesNotMatch(prompts.at(-1), /Pedro/);
});

// The AI gets a mark where the mention goes, not the digits of the person's id (their LID, or their phone number); the
// bot puts the mention in, and whatever "@<digits>" the AI adds tags nobody.
// In groups of its own, with what it knows of Ana in one of them: it used to go by what the first test of this file
// taught Claudia, and in another order, with that forgotten (.memoria olvidame), it failed.
test("el saludo de cumpleaños usa solo lo de ese grupo, y la IA no ve los dígitos del id", async () => {
  const [OTROS, SUYO] = ["cumple-otros@g.us", "cumple-suyo@g.us"];
  F.getUser(ANA, SUYO);
  F.updateUserInGroup(ANA, SUYO, { memoria: "tiene un perro que se llama Toto" });
  Cumple.CUMPLE.HORA_SALUDO = 0;
  const hoy = new Date();
  hoy.setHours(10, 0, 0, 0);
  respuestaIA = "@MENCION ¡Feliz cumple! Te saluda @59899000002";
  F.setCumple(OTROS, ANA, hoy.getDate(), hoy.getMonth() + 1);
  await Cumple.chequearCumpleanos(hoy);
  assert.match(prompts.at(-1), /^Hoy es el cumpleaños de Ana\. /, "en otro grupo no sabe nada de Ana");
  assert.doesNotMatch(prompts.at(-1), /555/, "ni los dígitos de su id");
  assert.match(prompts.at(-1), /con el texto exacto "@MENCION"/);
  assert.deepEqual(ultimoEnviado().msg, { text: "@555 ¡Feliz cumple! Te saluda 59899000002", mentions: [ANA] });
  F.borrarCumple(OTROS, ANA);
  F.setCumple(SUYO, ANA, hoy.getDate(), hoy.getMonth() + 1);
  await Cumple.chequearCumpleanos(hoy);
  assert.match(prompts.at(-1), /charlas anteriores en este grupo: tiene un perro que se llama Toto/);
  F.borrarCumple(SUYO, ANA);
});

// A group of its own as well: it erases what it knows, and other tests read it.
test(".memoria yo muestra lo que sabe de vos en el grupo, y .memoria olvidame lo borra", async () => {
  const SUYO = "memoria-yo@g.us";
  F.getUser(ANA, SUYO);
  F.updateUserInGroup(ANA, SUYO, { memoria: "tiene un perro que se llama Toto" });
  const pedir = async (accion) => {
    await Memoria.run({ chat: SUYO, sender: ANA, isGroup: true }, { client: globalThis.client, text: accion, args: [accion], command: "memoria", isAdmin: false, isOwner: false });
    return ultimoEnviado().msg.text;
  };
  assert.equal(await pedir("yo"), "🧠 Lo que sé de vos en este grupo: tiene un perro que se llama Toto\nPara que me lo olvide: .memoria olvidame");
  // What she noted while chatting may hold the digits of a LID she was told about: sendText tagged that person. Whoever
  // the bot knows goes by name, as in .memoria.
  conBeto();
  MP.anotarDe(ANA, SUYO, "le debe una ronda a @300000000000096 y a @300000000000003");
  assert.equal(await pedir("yo"), "🧠 Lo que sé de vos en este grupo: tiene un perro que se llama Toto · le debe una ronda a 300000000000096 y a @Beto\nPara que me lo olvide: .memoria olvidame");
  assert.equal(menciones(ultimoEnviado().msg.text), 0);
  assert.equal(await pedir("olvidame"), "🧠 Listo, me olvidé de lo que sabía de vos en este grupo.");
  assert.equal(MP.memoriaDe(ANA, SUYO), "");
  assert.equal(await pedir("yo"), "🧠 No tengo nada anotado de vos en este grupo.");
});

// Forgotten by the bot, and gone from the file too. SQLite used to only mark that space as free, and the text stayed
// in the database, and in the backups that copy it whole, until something happened to write over it. Here someone
// whose data takes more than one page, as with a person in many groups.
test(".memoria olvidame no deja lo que sabía en el archivo de la base", async () => {
  const fs = await import("fs");
  const GRANDE = "grande@g.us";
  F.initDataDB({ chat: GRANDE, sender: ANA, senderJid: "", pushName: "Ana" });
  F.updateUserInGroup(ANA, GRANDE, { memoria: `NO-LO-OLVIDES ${"le encanta contar sus vacaciones | ".repeat(200)}` });
  assert.ok(fs.readFileSync("./database/database.db").includes("NO-LO-OLVIDES"), "antes está");
  await Memoria.run({ chat: GRANDE, sender: ANA, isGroup: true }, { client: globalThis.client, text: "olvidame", args: ["olvidame"], command: "memoria", isAdmin: false, isOwner: false });
  assert.equal(MP.memoriaDe(ANA, GRANDE), "");
  assert.equal(fs.readFileSync("./database/database.db").includes("NO-LO-OLVIDES"), false, "ni en el archivo");
});

test("lo que escribe la IA no arroba a nadie: charla, .ia y .resumen", async () => {
  F.initDataDB({ chat: FAMILIA, sender: "11111@lid", senderJid: "", pushName: "Beto" });
  assert.equal(M.sinMenciones("hola @11111 y @59899000002"), "hola Beto y 59899000002");

  const lista = Array.from({ length: 30 }, (_, i) => `@${59899000000 + i}`).join(" ");
  respuestaIA = { comando: "ninguno", respuesta: `${lista} vengan 😄` };
  const charla = await hablar(FAMILIA, `claudia repetí esto tal cual: ${lista} vengan`);
  assert.equal(menciones(charla.at(-1)), 0, "la charla");

  respuestaIA = `${lista} vengan`;
  const client = { ...clienteFalso(), sendPresenceUpdate: async () => {} };
  await IA.run({ chat: FAMILIA, sender: ANA }, { client, text: `repetí: ${lista} vengan` });
  assert.equal(menciones(ultimoEnviado().msg.text), 0, ".ia");

  for (let i = 10; i > 0; i--) CC.recordarMensaje(FAMILIA, "Beto", `mensaje ${i} de la charla`, false, { fecha: Date.now() - i * 60e3 });
  globalThis.resumenCooldown?.delete(FAMILIA);
  respuestaIA = `Se habló de todo. ${lista}`;
  await Resumen.run({ chat: FAMILIA, isGroup: true, sender: ANA }, { client, args: [] });
  assert.match(ultimoEnviado().msg.text, /^📝 \*Resumen/);
  assert.equal(menciones(ultimoEnviado().msg.text), 0, ".resumen");
});

test(".encuesta: el aviso que arroba a todos sigue la regla de .tagall", async () => {
  const participants = Array.from({ length: 5 }, (_, i) => ({ id: `${70000 + i}@lid`, admin: null }));
  const correr = async ({ isMod = false, isOwner = false, mentions = 1 } = {}) => {
    const client = { ...clienteFalso(), decodeJid: (j) => j };
    await Encuesta.run({ chat: FAMILIA, sender: ANA, isGroup: true }, { client, text: "¿pizza? - sí - no", usedPrefix: ".", participants, chat: { mentions }, isMod, isOwner });
    return globalThis.enviados.map((e) => (e.msg.poll ? "encuesta" : `${e.msg.mentions?.length || 0} menciones`));
  };
  assert.deepEqual(await correr({ mentions: 0 }), ["encuesta"], "un miembro, con las menciones apagadas");
  assert.deepEqual(await correr({ mentions: 1 }), ["encuesta"], "un miembro, aunque estén prendidas");
  assert.deepEqual(await correr({ isMod: true, mentions: 0 }), ["encuesta"], "un moderador con las menciones apagadas");
  assert.deepEqual(await correr({ isMod: true, mentions: 1 }), ["encuesta", "5 menciones"]);
  assert.deepEqual(await correr({ isOwner: true, mentions: 0 }), ["encuesta", "5 menciones"], "el owner, como con .tagall");
});

test(".inactivos encuentra a cada uno aunque el grupo lo liste por número", async () => {
  const G = "pn@g.us";
  for (const [lid, jid] of [["111@lid", "59899000111@s.whatsapp.net"], ["222@lid", "59899000222@s.whatsapp.net"]]) F.initDataDB({ chat: G, sender: lid, senderJid: jid, pushName: lid });
  for (let i = 0; i < 30; i++) F.sumarMensajeEnGrupo("111@lid", G);
  F.registrarMensajeGrupo(G, ["333@lid"], Date.now() - 20 * 24 * 60 * 60 * 1000); // the bot keeps track of it since 20 days ago
  F.registrarMensajeGrupo(G, ["111@lid"]); // what counts is when they last wrote, stamped under their LID
  const correr = async (participants) => {
    await Inactivos.run({ chat: G, sender: "111@lid", isGroup: true }, { client: globalThis.client, participants });
    return ultimoEnviado().msg.mentions;
  };
  const porNumero = [{ id: "59899000111@s.whatsapp.net", lid: "111@lid" }, { id: "59899000222@s.whatsapp.net", lid: "222@lid" }];
  assert.deepEqual(await correr(porNumero), ["59899000222@s.whatsapp.net"], "solo el que no habló, con el id del grupo");
  F.quitarAvisoInactivo(G, ["222@lid", "59899000222@s.whatsapp.net"]); // a second .inactivos doesn't tag the warned again
  assert.deepEqual(await correr([{ id: "111@lid" }, { id: "222@lid" }]), ["222@lid"], "y lo mismo en un grupo por LID");
});

// A mention travels in the text as "@" and the person's LID digits, which only the admins see (.id). WhatsApp shows it
// as "@Name" in the chat, but not inside a sticker or a voice note: there conNombres (lib/menciones.js) names it.
const BETO = "300000000000003@lid";
// A message quoted by the command: from someone the bot has no name for, and mentioning Beto.
const CITADO = { text: "hola @300000000000003", sender: "300000000000009@lid", contextInfo: { mentionedJid: [BETO] } };
const pedido = (extra = {}) => ({ chat: FAMILIA, sender: ANA, name: "Ana", react: () => {}, mentionedJid: [BETO], quoted: null, ...extra });
const conBeto = () => F.initDataDB({ chat: FAMILIA, sender: BETO, senderJid: "59899000003@s.whatsapp.net", pushName: "Beto" });

test("conNombres: las menciones como nombres, sin los dígitos de la LID", () => {
  conBeto();
  assert.equal(M.conNombres("@300000000000003 es un capo", [BETO]), "@Beto es un capo");
  assert.equal(M.conNombres("hola @300000000000004", ["300000000000004@lid"]), "hola @alguien", "una mención de alguien sin nombre");
  assert.equal(M.conNombres("hola @300000000000003"), "hola @Beto", "una LID conocida, aunque falte la lista de menciones");
  assert.equal(M.conNombres("hola @59899000003"), "hola @59899000003", "un número escrito a mano no dice de quién es");
  assert.equal(M.conNombres("hola @59899000003", ["59899000003@s.whatsapp.net"]), "hola @Beto", "una mención por número, en un grupo sin LID");
  assert.equal(M.conNombres("hola @300000000000003", [BETO], { arroba: false }), "hola Beto", "para leerlo en voz alta");
});

test(".qc, .wm y .tts no muestran la LID de quien mencionan ni la de quien citan", async () => {
  conBeto();
  const Qc = (await import("../plugins/sticker-qc.js")).default;
  const Wm = (await import("../plugins/sticker-wm.js")).default;
  const Tts = (await import("../plugins/convert-text-to-ptt.js")).default;
  const tts = await import("../lib/tts.js");

  // .qc: what goes to the service that draws the quote.
  const fetchAntes = globalThis.fetch;
  let cita;
  globalThis.fetch = async (url, opciones) => {
    cita = JSON.parse(opciones.body).messages[0];
    return { ok: false, status: 500 };
  };
  await Qc.run(pedido({ quoted: CITADO, mentionedJid: [] }), { client: { ...clienteFalso(), profilePictureUrl: async () => "foto" }, text: "" }).catch(() => {});
  globalThis.fetch = fetchAntes;
  assert.deepEqual([cita.from.name, cita.text], ["Alguien", "hola @Beto"], ".qc");

  // .wm: the pack name written into the sticker, a 1x1 webp.
  const webp = Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");
  await Wm.run(pedido({ quoted: { mimetype: "image/webp", download: async () => webp } }), { client: clienteFalso(), text: "@300000000000003|autor" });
  assert.equal(ultimoEnviado().archivo.toString().match(/"sticker-pack-name":"([^"]*)"/)?.[1], "@Beto", ".wm");

  // .tts: what Google is asked to read out, written and quoted.
  const leido = [];
  const pedirAntes = tts._dep.pedir;
  tts._dep.pedir = async (url) => {
    leido.push(new URL(url).searchParams.get("q"));
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1]).buffer };
  };
  const client = { ...clienteFalso(), sendPresenceUpdate: async () => {} };
  await Tts.run(pedido(), { client, args: ["hola", "@300000000000003"] });
  await Tts.run(pedido({ quoted: CITADO, mentionedJid: [] }), { client, args: [] });
  tts._dep.pedir = pedirAntes;
  assert.deepEqual(leido, ["hola Beto", "hola Beto"], ".tts");
});

test(".ttp y .ttp2 dibujan el nombre de quien mencionan, no su LID", async () => {
  conBeto();
  const Ttp = await import("../plugins/sticker-ttp.js");
  const Ttp2 = await import("../plugins/sticker-ttp2.js");
  const antes = [Ttp._dep.stickerDeTexto, Ttp2._dep.cuadrosArcoiris];
  const errorReal = console.error;
  const dibujado = [];
  // What gets drawn is all this needs: the drawing stops there, and .ttp2 reports it.
  Ttp._dep.stickerDeTexto = Ttp2._dep.cuadrosArcoiris = async (texto) => {
    dibujado.push(texto);
    throw new Error("basta");
  };
  console.error = () => {};
  try {
    for (const P of [Ttp, Ttp2]) {
      await P.default.run(pedido(), { client: clienteFalso(), text: "@300000000000003 es un capo" }).catch(() => {});
      await P.default.run(pedido({ quoted: CITADO, mentionedJid: [] }), { client: clienteFalso(), text: "" }).catch(() => {});
    }
  } finally {
    [Ttp._dep.stickerDeTexto, Ttp2._dep.cuadrosArcoiris] = antes;
    console.error = errorReal;
  }
  assert.deepEqual(dibujado, ["@Beto es un capo", "hola @Beto", "@Beto es un capo", "hola @Beto"]);
});

// A reply as Baileys hands it over (a proto.Message decoded from its bytes), through the bot's own wrapper: pushMessage
// keeps a copy of the quoted message, and then smsg turns the reply into m, as in handle-message. m.quoted has to bring
// the mentions the quoted message came with, for .ttp, .ttp2, .tts and .qc to name them.
test("una cita llega con sus propias menciones: .ttp dibuja el nombre y no la LID", async () => {
  conBeto();
  const { proto } = await import("@whiskeysockets/baileys");
  const WS = await import("../lib/wa-socket.js");
  const Ttp = await import("../plugins/sticker-ttp.js");
  WS.serialize();
  const crearReal = WS._dep.crearSocket;
  WS._dep.crearSocket = () => ({
    ...clienteFalso(),
    user: { id: "59800000001:5@s.whatsapp.net", lid: "200000000000001@lid" },
    ev: { emit() {}, on() {} },
    groupFetchAllParticipating: async () => ({}),
    groupMetadata: async (id) => ({ id, subject: "Familia", participants: [] }),
  });
  let client;
  try {
    client = WS.makeWASocket({});
  } finally {
    WS._dep.crearSocket = crearReal;
  }
  const NADIE = "300000000000009@lid"; // mentioned, and never wrote: not in the database
  let n = 0;
  // ".ttp" replying to Beto's message, which mentions someone; the reply mentions nobody.
  const responde = async (citado) => {
    const msg = {
      key: { remoteJid: FAMILIA, fromMe: false, id: `RESPUESTA${++n}`, participant: ANA },
      message: proto.Message.decode(proto.Message.encode({ extendedTextMessage: { text: ".ttp", contextInfo: { stanzaId: `CITADO${n}`, participant: BETO, quotedMessage: citado } } }).finish()),
    };
    const guardando = client.pushMessage(msg); // not awaited before smsg, as in handle-message
    const m = WS.smsg(client, msg);
    await guardando;
    return m;
  };
  const conMencion = (text, mencionado) => ({ extendedTextMessage: { text, contextInfo: { mentionedJid: [mencionado] } } });

  const m = await responde(conMencion("hola @300000000000009", NADIE));
  assert.deepEqual(m.quoted.contextInfo?.mentionedJid, [NADIE], "m.quoted, con la mención del citado");
  const guardado = client.chats[BETO].messages.CITADO1.message.extendedTextMessage;
  assert.deepEqual([guardado.text, guardado.contextInfo.mentionedJid], ["hola @300000000000009", [NADIE]], "y la copia guardada, también la suya");

  const antes = Ttp._dep.stickerDeTexto;
  const dibujado = [];
  Ttp._dep.stickerDeTexto = async (texto) => {
    dibujado.push(texto);
    throw new Error("basta");
  };
  try {
    await Ttp.default.run(m, { client: clienteFalso(), text: "" }).catch(() => {});
    // In a group that lists people by number, the mention comes with the number, and Beto is known by it.
    await Ttp.default.run(await responde(conMencion("hola @59899000003", "59899000003@s.whatsapp.net")), { client: clienteFalso(), text: "" }).catch(() => {});
  } finally {
    Ttp._dep.stickerDeTexto = antes;
  }
  assert.deepEqual(dibujado, ["hola @alguien", "hola @Beto"]);
  const texto = await responde({ conversation: "un texto sin menciones" });
  assert.equal(texto.quoted.text, "un texto sin menciones", "un texto simple citado se sigue leyendo");
});

// sinMenciones gets what the AI writes and what people type (an alert, a post for sale): a phone number stays as the
// digits, without saying whose it is, as conNombres does. Ana is known by hers.
test("sinMenciones no dice de quién es un número de teléfono", async () => {
  assert.equal(M.sinMenciones("hola @59899555555"), "hola 59899555555");
  const CV = await import("../lib/compraventa.js");
  assert.deepEqual(CV.gestionarAlerta(FAMILIA, "300000000000066@lid", ["quitar", "@59899555555"]), { ok: false, error: 'No tenías una alerta "59899555555".' });
});

// Someone the bot has no name for: the rankings and lists (nombreDe) and what the AI writes (sinMenciones) say
// "alguien", not the digits of their LID.
test("nombreDe y sinMenciones: alguien sin nombre es 'alguien'", () => {
  const SIN_NOMBRE = "300000000000098@lid";
  F.initDataDB({ chat: FAMILIA, sender: SIN_NOMBRE, senderJid: "", pushName: null });
  assert.equal(M.nombreDe(SIN_NOMBRE), "alguien");
  assert.equal(M.nombreDe("300000000000099@lid"), "alguien", "ni en la base");
  assert.equal(M.sinMenciones("hola @300000000000098"), "hola alguien");
  assert.equal(M.sinMenciones("hola @59899000001"), "hola 59899000001", "un número que el bot no conoce queda como lo escribió la IA");
});

// What someone tells her reaches the AI, and her short-term memory, with its mentions as names: a mention travels as the
// digits of a LID, which only the admins see (.id), and she repeated them in the group. Her own mention is "@Claudia",
// and the message of hers they answer comes with names too.
test("lo que le dicen a Claudia llega a la IA y a su memoria con nombres, no con LID", async () => {
  conBeto();
  const YO = "200000000000001@lid"; // Claudia's LID, which has no row in the database
  const NADIE = "300000000000096@lid"; // mentioned, and never wrote
  const MemoriaCorta = (await import("../plugins/_memoria-corta.js")).default;
  const client = { ...clienteFalso(), sendPresenceUpdate: async () => {} };
  const lidReal = globalThis.client.user.lid;
  client.user = { ...client.user, lid: YO };
  globalThis.client.user.lid = YO;
  respuestaIA = { comando: "ninguno", respuesta: "todo bien" };
  globalThis.contextoChat.delete(AMIGOS);
  const habla = async (extra) => {
    globalThis.autoIaCooldown.delete(AMIGOS);
    const m = { chat: AMIGOS, isGroup: true, sender: ANA, pushName: "Ana", quoted: null, ...extra };
    const user = F.getUser(ANA);
    await MemoriaCorta.before(m, { user });
    await AutoIA.before(m, { client, participants: [], isAdmin: false, isMod: false, isOwner: false, user, chat: F.getChat(AMIGOS) });
    return prompts.at(-1);
  };
  try {
    const prompt = await habla({ text: "@200000000000001 decile a @300000000000003 y a @300000000000096 que vengan", mentionedJid: [YO, BETO, NADIE], key: { id: "NOMBRES1" } });
    assert.match(prompt, /Mensaje de Ana: "@Claudia decile a @Beto y a @alguien que vengan"/);
    assert.doesNotMatch(prompt, /300000000000|200000000000001/);
    assert.deepEqual(globalThis.contextoChat.get(AMIGOS).filter((e) => !e.esBot).map((e) => e.texto), ["@Claudia decile a @Beto y a @alguien que vengan"], "y así queda en su memoria");

    const respuesta = await habla({ text: "jaja sí, ¿y @300000000000003?", mentionedJid: [BETO], key: { id: "NOMBRES2" }, quoted: { fromMe: true, id: "DECLAUDIA1", text: "¡Bien ahí @300000000000096!", contextInfo: { mentionedJid: [NADIE] } } });
    assert.match(respuesta, /responde a este mensaje tuyo: "¡Bien ahí @alguien!"\n\nSu mensaje: "jaja sí, ¿y @Beto\?"/);
  } finally {
    globalThis.client.user.lid = lidReal;
  }
});

// A note of .recordá goes into every prompt of her chat and of her glances: with its mentions as names, not the digits
// of a LID she'd repeat to the group, and .ia the same. A note kept before that, with the digits, names whoever the bot
// knows.
test(".recordá y .ia le pasan a la IA las menciones como nombres", async () => {
  conBeto();
  const NADIE = "300000000000094@lid"; // mentioned, and never wrote
  const texto = "que @300000000000003 y @300000000000094 siempre llegan tarde";
  await Memoria.run({ chat: FAMILIA, sender: ANA, isGroup: true, mentionedJid: [BETO, NADIE] }, { client: globalThis.client, text: texto, args: texto.split(" "), command: "recordá", isAdmin: false, isOwner: false });
  assert.match(ultimoEnviado().msg.text, /Anotado \(#\d+\): @Beto y @alguien siempre llegan tarde$/);
  F.agregarMemoriaGrupo(FAMILIA, "@300000000000003 trae el mate", ANA); // one kept before, as it came
  const { textoParaPrompt } = await import("../lib/memoria-grupo.js");
  const enElPrompt = textoParaPrompt(FAMILIA);
  assert.doesNotMatch(enElPrompt, /300000000000/);
  assert.match(enElPrompt, /"@Beto y @alguien siempre llegan tarde" · "@Beto trae el mate"/);

  globalThis.esperaIa?.delete(FAMILIA);
  respuestaIA = "No sé quién es";
  await IA.run({ chat: FAMILIA, sender: ANA, mentionedJid: [NADIE] }, { client: { ...clienteFalso(), sendPresenceUpdate: async () => {} }, text: "¿quién es @300000000000094?" });
  assert.match(prompts.at(-1), /¿quién es @alguien\?/);
  assert.doesNotMatch(prompts.at(-1), /300000000000094/);
});

// A WhatsApp name is whatever the person typed: an "@" with digits in it became a mention wherever nombreDe names them
// (the blacklist's notice, the rankings and lists), tagging whoever those digits are.
test("nombreDe: un nombre con @ y dígitos no arroba a nadie, y Claudia es Claudia", () => {
  F.initDataDB({ chat: FAMILIA, sender: "300000000000095@lid", senderJid: "", pushName: "@300000000000003 y @0" });
  assert.equal(M.nombreDe("300000000000095@lid"), "300000000000003 y 0");
  assert.equal(menciones(M.nombreDe("300000000000095@lid")), 0);
  // Two in a row too: taking out one left the other, also where the AI's text names someone (sinMenciones).
  F.initDataDB({ chat: FAMILIA, sender: "300000000000092@lid", senderJid: "", pushName: "@@300000000000003" });
  assert.equal(M.nombreDe("300000000000092@lid"), "300000000000003");
  assert.equal(menciones(M.sinMenciones("Gracias @300000000000092")), 0);
  // And conNombres puts an "@" in front of the name: one made of digits was a mention again (.recordá answers with it).
  conBeto();
  assert.equal(M.conNombres("che @300000000000092", ["300000000000092@lid"]), "che 300000000000003");
  assert.equal(M.conNombres("che @300000000000095 y @300000000000003", []), "che 300000000000003 y 0 y @Beto", "con letras, con su @");
  assert.equal(M.nombreDe(globalThis.client.user.lid), "Claudia");
  assert.equal(M.nombreDe(globalThis.client.user.jid), "Claudia");
});

// sinMenciones took out one "@": asked to repeat "@@<digits>", Claudia answered with "@<digits>", a mention again, in a
// group with mentions off. And conNombres took the "@" off any name starting with a digit, "2Pac" too, when only five
// digits or a 0 make a mention (parseMention, lib/wa-socket.js).
test("sinMenciones con dos @ seguidas, y conNombres solo le saca la @ a un nombre que arrobaría", () => {
  assert.equal(M.sinMenciones("Listo: @@300000000000081 @@300000000000082"), "Listo: 300000000000081 300000000000082");
  conBeto();
  assert.equal(M.sinMenciones("Gracias @@300000000000003"), "Gracias Beto");
  F.initDataDB({ chat: FAMILIA, sender: "300000000000071@lid", senderJid: "", pushName: "2Pac" });
  F.initDataDB({ chat: FAMILIA, sender: "300000000000072@lid", senderJid: "", pushName: "0800 Pizza" });
  assert.equal(M.conNombres("¿venís @300000000000071?", ["300000000000071@lid"]), "¿venís @2Pac?");
  assert.equal(M.conNombres("che @300000000000072", ["300000000000072@lid"]), "che 0800 Pizza");
  assert.equal(menciones(M.conNombres("che @300000000000072", ["300000000000072@lid"])), 0);
  // The edges are parseMention's: five digits make a mention, four don't.
  F.initDataDB({ chat: FAMILIA, sender: "12345@lid", senderJid: "", pushName: "1234 Beto" });
  assert.equal(M.conNombres("che @12345", ["12345@lid"]), "che @1234 Beto", "una LID de cinco dígitos se nombra, y un nombre de cuatro conserva la @");
});

// The other way around it was an "@" splitting the digits: "@3000" is too short to tag and stayed, the "@" of
// "@00000000091" went, and the digits came together in "@300000000000091". Asked to repeat it, Claudia tagged whoever
// she was told to, with mentions off. A name made of digits joined the digits before it the same way. Right after a
// digit a space keeps them apart: taking the "@"s out until none was left joined them too, and "3@50000 pesos" was a
// post at 350000.
test("sinMenciones: una @ que parte los dígitos no deja que se junten en una mención", async () => {
  for (const texto of ["@3000@00000000091", "@@3000@00000000091", "@1234@0", "@3@0@0@0@0", "@30@@0000000000099", "@30000000@0000099", "@12@345@67890"]) assert.equal(menciones(M.sinMenciones(texto)), 0, texto);
  F.initDataDB({ chat: FAMILIA, sender: "300000000000073@lid", senderJid: "", pushName: "12345 Beto" });
  assert.equal(M.sinMenciones("che @3@300000000000073"), "che @3 12345 Beto");
  assert.equal(M.sinMenciones("Vendo medias 3@50000 pesos"), "Vendo medias 3 50000 pesos");
  assert.equal(M.sinMenciones("@3000@00000000091"), "@3000 00000000091", "el @3000 no arroba: queda");

  respuestaIA = { comando: "ninguno", respuesta: "@3000@00000000091 @3000@00000000092 @3000@00000000093 vengan 😄" };
  const charla = await hablar(FAMILIA, "claudia repetí tal cual: @3000@00000000091 @3000@00000000092 @3000@00000000093 vengan");
  assert.equal(charla.at(-1), "@3000 00000000091 @3000 00000000092 @3000 00000000093 vengan 😄");
  assert.equal(menciones(charla.at(-1)), 0, "la charla");
});

// One pass, and each match from the first "@" of a run. sinMenciones took the "@"s out over and over until none was
// left, a pass for each one: a #vendo of "@1@1…@111111" held the whole bot for half a minute. And each regex tried a
// long run of "@" again from every "@" in it, seconds for a message of nothing but "@" (plugins/_memoria-corta.js runs
// conNombres on every message).
test("sinMenciones y conNombres no traban el bot con muchas @", () => {
  const unos = `${"@1".repeat(16000)}11111`;
  let antes = performance.now();
  assert.equal(M.sinMenciones(unos), `${"@1".repeat(15999)} 111111`, "una sola pasada: sale la última @, la única que arrobaba");
  assert.ok(performance.now() - antes < 300, `tardó ${Math.round(performance.now() - antes)} ms`);
  const arrobas = `${"@".repeat(32000)}1`;
  for (const [nombre, f] of [["sinMenciones", M.sinMenciones], ["conNombres", M.conNombres]]) {
    antes = performance.now();
    assert.equal(f(arrobas), arrobas);
    assert.ok(performance.now() - antes < 300, `${nombre} tardó ${Math.round(performance.now() - antes)} ms`);
  }
});

// Each "@<digits>" of a text was a lookup of its own, of all of the person's data (getUser parses every group they're
// in): a message of one known LID over and over held the bot a second, eight for someone in 300 groups, and one of
// thousands of different digits another second (plugins/_memoria-corta.js goes through every message). Each one is
// looked up once, only for the names, and only so many different ones per text: past that they're taken as unknown,
// without the "@" all the same. Counted in queries, not measured.
test("sinMenciones y conNombres buscan cada @ una vez, solo los nombres, y hasta un tope", () => {
  const LID = "300000000000880@lid";
  F.initDataDB({ chat: FAMILIA, sender: LID, senderJid: "", pushName: "Dani" });
  const grupos = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`g${i}@g.us`, { messageCount: 1, desde: 1 }]));
  db.prepare("UPDATE users SET inGroup = ? WHERE lid = ?").run(JSON.stringify(grupos), LID);
  const otros = Array.from({ length: 250 }, (_, i) => `${300000000001000 + i}@lid`);
  for (const [i, lid] of otros.entries()) F.initDataDB({ chat: FAMILIA, sender: lid, senderJid: "", pushName: `P${i}` });
  const prepare = db.prepare;
  const parse = JSON.parse;
  const contar = (f) => {
    let consultas = 0;
    let lecturas = 0;
    db.prepare = function (...args) {
      consultas++;
      return prepare.apply(this, args);
    };
    JSON.parse = (...args) => (lecturas++, parse(...args));
    try {
      return { texto: f(), consultas, lecturas };
    } finally {
      delete db.prepare;
      JSON.parse = parse;
    }
  };
  const repetida = `@${LID.split("@")[0]} `.repeat(3000);
  assert.deepEqual(contar(() => M.nombreDe(LID)), { texto: "Dani", consultas: 1, lecturas: 0 }, "los rankings y las listas, igual");
  assert.deepEqual(contar(() => M.sinMenciones(repetida)), { texto: "Dani ".repeat(3000), consultas: 1, lecturas: 0 });
  assert.deepEqual(contar(() => M.conNombres(repetida, [LID])), { texto: "@Dani ".repeat(3000), consultas: 1, lecturas: 0 });
  assert.equal(contar(() => M.sinMenciones("@0".repeat(30000))).consultas, 1);
  const r = contar(() => M.sinMenciones(otros.map((l) => `@${l.split("@")[0]}`).join(" ")));
  assert.equal(r.consultas, 200);
  assert.equal(menciones(r.texto), 0);
  assert.equal(r.texto.split(" ").slice(198, 202).join(" "), "P198 P199 300000000001200 300000000001201", "pasado el tope, sin la @");
});

// Only what sendText would take as a mention loses its "@": every "@" before a digit went, and "pepe@163.com" or
// "@50cent" changed in what Claudia said. Random texts of "@", every digit and a bit more, with a fixed seed: none is
// left, and one that had none comes out as it went in. Looking only at the first, the "@" before a 2, a 4 or an 8 could
// go too, and "4@300 pesos" was a post at 4300 again.
test("sinMenciones no toca lo que no es una mención, y no deja ninguna", () => {
  for (const texto of ["escribime a pepe@163.com", "info@123seguro.com", "seguilo: @50cent", "la cuenta @9gag", "Vendo medias 3@500 pesos", "2@1500 c/u", "nos vemos 10@12"]) assert.equal(M.sinMenciones(texto), texto);
  let semilla = 12345;
  const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
  const letras = ["@", "@", "@", "@", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", " "];
  for (let k = 0; k < 3000; k++) {
    const texto = Array.from({ length: 1 + Math.floor(azar() * 32) }, () => letras[Math.floor(azar() * letras.length)]).join("");
    const limpio = M.sinMenciones(texto);
    assert.equal(menciones(limpio), 0, texto);
    if (!menciones(texto)) assert.equal(limpio, texto, `no tenía menciones: ${texto}`);
  }
});

// A note kept before .recordá turned mentions into names has the digits of a LID: the prompt already named it, and
// .memoria listed it as it was, tagging that person every time someone looked at the notes.
test(".memoria nombra las notas viejas y no arroba a nadie al listarlas o borrarlas", async () => {
  conBeto();
  const Mem = await import("../lib/memoria-grupo.js");
  const G = "notas-viejas@g.us";
  F.agregarMemoriaGrupo(G, "@300000000000003 trae el mate", ANA);
  const id = F.agregarMemoriaGrupo(G, "@300000000000096 debe una ronda", ANA); // someone the bot doesn't know
  const lista = Mem.textoMemoria(G);
  assert.match(lista, /· @Beto trae el mate/);
  assert.equal(menciones(lista), 0);
  assert.equal(menciones(Mem.borrar(G, ANA, id, false).mensaje), 0);
});

// .recordá answers with the note: a LID typed by hand that the bot doesn't know (no name to put instead), or digits split
// by another "@", went back to the group as they came, and sendText made them a mention. .memoria already read them
// right.
// In a group of its own: the note it leaves went into the prompt of the next test about Familia.
test(".recordá no arroba en la respuesta a quien el bot no conoce", async () => {
  const texto = "que @300000000000096 debe una ronda, y @3000@00000000091 también";
  await Memoria.run({ chat: "recorda-eco@g.us", sender: ANA, isGroup: true, mentionedJid: [] }, { client: globalThis.client, text: texto, args: texto.split(" "), command: "recordá", isAdmin: false, isOwner: false });
  assert.match(ultimoEnviado().msg.text, /^🧠 Anotado \(#\d+\): 300000000000096 debe una ronda, y @3000 00000000091 también$/);
  assert.equal(menciones(ultimoEnviado().msg.text), 0);
});

// A message without a name: Claudia calls its author "alguien" in her prompt and in her short memory (which .resumen
// and the initiative read), not the digits of their LID.
test("Claudia no llama a nadie por los dígitos de su LID", async () => {
  const SIN_NOMBRE = "300000000000097@lid";
  F.initDataDB({ chat: AMIGOS, sender: SIN_NOMBRE, senderJid: "", pushName: null });
  const MemoriaCorta = (await import("../plugins/_memoria-corta.js")).default;
  globalThis.autoIaCooldown.delete(AMIGOS);
  globalThis.contextoChat.delete(AMIGOS);
  respuestaIA = { comando: "ninguno", respuesta: "todo bien" };
  const m = { chat: AMIGOS, isGroup: true, sender: SIN_NOMBRE, text: "claudia, ¿qué onda?", mentionedJid: [], quoted: null, key: { id: "SINNOMBRE1" } };
  const user = F.getUser(SIN_NOMBRE);
  await MemoriaCorta.before(m, { user });
  await AutoIA.before(m, { client: { ...clienteFalso(), sendPresenceUpdate: async () => {} }, participants: [], isAdmin: false, isMod: false, isOwner: false, user, chat: F.getChat(AMIGOS) });
  assert.match(prompts.at(-1), /Mensaje de alguien: "claudia, ¿qué onda\?"/);
  assert.doesNotMatch(prompts.at(-1), /300000000000097/);
  assert.deepEqual(globalThis.contextoChat.get(AMIGOS).filter((e) => e.usuario === SIN_NOMBRE).map((e) => e.nombre), ["alguien"]);
});

// What the AI answers carries what she was going to remember of the person and what a voice note said, and the log
// (~/claudia.log) keeps whatever goes into it: the chat's line for a broken JSON wrote the answer whole. Gemini and the
// fallbacks throw a broken one away before it gets there (lib/gemini.js, lib/respaldo-ia.js), so the code is checked.
test("consistencia: los logs de la charla no llevan lo que contestó la IA", () => {
  const fuente = fs.readFileSync(new URL("../plugins/_auto-ia.js", import.meta.url), "utf8");
  const logs = fuente.split("\n").filter((l) => /console\.(log|error|warn)\(/.test(l));
  assert.ok(logs.some((l) => l.includes("no devolvió JSON válido")));
  for (const l of logs) assert.doesNotMatch(l, /resultado\.texto|datos\b/, l.trim());
});
