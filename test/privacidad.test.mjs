import { test, before, after } from "node:test";
import assert from "node:assert/strict";
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
// The pattern sendText turns into mentions (parseMention in lib/wa-socket.js).
const menciones = (texto) => [...String(texto).matchAll(/@([0-9]{5,16}|0)/g)].length;

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

test("el saludo de cumpleaños usa solo lo de ese grupo", async () => {
  Cumple.CUMPLE.HORA_SALUDO = 0;
  const hoy = new Date();
  hoy.setHours(10, 0, 0, 0);
  respuestaIA = "@555 ¡Feliz cumple!";
  F.setCumple(AMIGOS, ANA, hoy.getDate(), hoy.getMonth() + 1);
  await Cumple.chequearCumpleanos(hoy);
  assert.match(prompts.at(-1), /^Hoy es el cumpleaños de Ana\. /, "en Amigos no sabe nada de Ana");
  F.borrarCumple(AMIGOS, ANA);
  F.setCumple(FAMILIA, ANA, hoy.getDate(), hoy.getMonth() + 1);
  await Cumple.chequearCumpleanos(hoy);
  assert.match(prompts.at(-1), /charlas anteriores en este grupo: tiene un perro que se llama Toto/);
});

test(".memoria yo muestra lo que sabe de vos en el grupo, y .memoria olvidame lo borra", async () => {
  const pedir = async (accion) => {
    await Memoria.run({ chat: FAMILIA, sender: ANA, isGroup: true }, { client: globalThis.client, text: accion, args: [accion], command: "memoria", isAdmin: false, isOwner: false });
    return ultimoEnviado().msg.text;
  };
  assert.equal(await pedir("yo"), "🧠 Lo que sé de vos en este grupo: tiene un perro que se llama Toto\nPara que me lo olvide: .memoria olvidame");
  assert.equal(await pedir("olvidame"), "🧠 Listo, me olvidé de lo que sabía de vos en este grupo.");
  assert.equal(MP.memoriaDe(ANA, FAMILIA), "");
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
  const correr = async (participants) => {
    await Inactivos.run({ chat: G, sender: "111@lid", isGroup: true }, { client: globalThis.client, participants });
    return ultimoEnviado().msg.mentions;
  };
  const porNumero = [{ id: "59899000111@s.whatsapp.net", lid: "111@lid" }, { id: "59899000222@s.whatsapp.net", lid: "222@lid" }];
  assert.deepEqual(await correr(porNumero), ["59899000222@s.whatsapp.net"], "solo el que no habló, con el id del grupo");
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
