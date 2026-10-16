import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, ultimoEnviado } from "./helpers.mjs";
import strings from "../lib/strings.js";

// What Claudia learns of each person stays in the group it was learned in (lib/memoria-persona.js); what the AI writes
// can't tag anyone (sinMenciones in lib/menciones.js); and .encuesta and .inactivos only tag who they should.
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
