import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, ultimoEnviado } from "./helpers.mjs";
import strings from "../lib/strings.js";

const DIA = 24 * 60 * 60 * 1000;
let F, I, Inactivos, Kick;
let expulsiones = [];

before(async () => {
  ({ F } = await prepararBase("inactivos"));
  globalThis.txt = strings;
  globalThis.client.user.lid = "999@lid";
  globalThis.client.groupParticipantsUpdate = async (chat, ids, accion) => {
    expulsiones.push({ chat, ids, accion });
    return ids.map((jid) => ({ status: "200", jid }));
  };
  I = await import("../lib/inactivos.js");
  I.INACTIVOS.PAUSA_MS = 0;
  Inactivos = (await import("../plugins/grupo-inactivos.js")).default;
  Kick = (await import("../plugins/grupo-kick.js")).default;
});

beforeEach(() => {
  expulsiones = [];
  globalThis.enviados = [];
});

// One group per test, so what one warns doesn't leak into the next. The cast:
// 101 wrote 20 days ago · 102 never wrote · 103 wrote 2 days ago · 104 came in 5 days ago and never wrote ·
// 105 is a WhatsApp admin · 106 a mod of the bot · 107 an owner · 999 the bot ·
// 108 is listed by number and wrote yesterday under their LID · 109 has no row at all.
function armarGrupo(chat, ahora = Date.now()) {
  for (const n of [101, 102, 103, 104, 105, 106, 108]) F.initDataDB({ chat, sender: `${n}@lid`, senderJid: `59899000${n}@s.whatsapp.net`, pushName: `Persona${n}` });
  F.initDataDB({ chat, sender: "107@lid", senderJid: "59899111222@s.whatsapp.net", pushName: "Dueño" });
  F.registrarMensajeGrupo(chat, ["101@lid"], ahora - 20 * DIA);
  F.registrarMensajeGrupo(chat, ["103@lid"], ahora - 2 * DIA);
  F.registrarMensajeGrupo(chat, ["108@lid"], ahora - 1 * DIA);
  F.registrarIngresoGrupo(chat, ["104@lid"], ahora - 5 * DIA);
  F.setRolGrupo(chat, "106@lid", "mod", "105@lid");
  return [
    ...[101, 102, 103, 104, 106, 107, 109].map((n) => ({ id: `${n}@lid`, admin: null })),
    { id: "105@lid", admin: "admin" },
    { id: "999@lid", admin: "admin" },
    { id: "59899000108@s.whatsapp.net", lid: "108@lid", admin: null },
  ];
}

const m = (chat, text, sender = "105@lid") => ({ chat, sender, text, isGroup: true, react: async () => {}, delete: async () => {} });
const textoEnviado = () => ultimoEnviado()?.msg?.text || "";

test(".inactivos etiqueta solo a los callados de verdad: ni admins, ni roles, ni el bot, ni recién llegados", async () => {
  const chat = "inactivos-1@g.us";
  const participants = armarGrupo(chat);
  await Inactivos.run(m(chat, ""), { client: globalThis.client, participants, text: "" });

  const { msg } = ultimoEnviado();
  assert.deepEqual(msg.mentions.sort(), ["101@lid", "102@lid", "109@lid"]);
  assert.match(msg.text, /Inactivos \(3\)/);
  assert.match(msg.text, /@101 — hace 20 días/);
  assert.match(msg.text, /@102 — nunca escribió/);
  assert.match(msg.text, /se salva y se lleva 🪙 10/);
});

test(".inactivos 30 cambia el corte, y un número que no es de días se rechaza", async () => {
  const chat = "inactivos-2@g.us";
  const participants = armarGrupo(chat);
  await Inactivos.run(m(chat, "30"), { client: globalThis.client, participants, text: "30" });
  assert.deepEqual(ultimoEnviado().msg.mentions.sort(), ["102@lid", "109@lid"]); // 101 wrote 20 days ago: not 30 yet

  await Inactivos.run(m(chat, "mucho"), { client: globalThis.client, participants, text: "mucho" });
  assert.match(textoEnviado(), /cuántos días/);
});

test("un segundo .inactivos no reinicia el plazo del primero", () => {
  const chat = "inactivos-3@g.us";
  const ahora = Date.now();
  const participants = armarGrupo(chat, ahora);
  I.avisarInactivos(chat, participants, globalThis.client, { ahora: ahora - 4 * DIA });
  I.avisarInactivos(chat, participants, globalThis.client, { ahora });
  const { listos } = I.paraSacar(chat, participants, globalThis.client, ahora);
  assert.deepEqual(listos.map((e) => e.participante.id).sort(), ["101@lid", "102@lid", "109@lid"]);
});

test("el avisado que vuelve a escribir se salva y cobra una sola vez", async () => {
  const chat = "inactivos-4@g.us";
  const participants = armarGrupo(chat);
  I.avisarInactivos(chat, participants, globalThis.client);
  const antes = F.getSaldoCoins(chat, "101@lid");

  await I.registrarPresencia(globalThis.client, { chat, sender: "101@lid", senderJid: "59899000101@s.whatsapp.net" });
  assert.match(textoEnviado(), /Volvió @101: sale de la lista de inactivos y se lleva 🪙 10/);
  assert.equal(F.getSaldoCoins(chat, "101@lid"), antes + 10);

  globalThis.enviados = [];
  await I.registrarPresencia(globalThis.client, { chat, sender: "101@lid" });
  assert.equal(globalThis.enviados.length, 0);
  assert.equal(F.getSaldoCoins(chat, "101@lid"), antes + 10);
});

test("con la economía apagada el que vuelve se salva igual, sin monedas", async () => {
  const chat = "inactivos-5@g.us";
  const participants = armarGrupo(chat);
  F.updateChat(chat, { monedas: 0 });
  const { texto } = I.avisarInactivos(chat, participants, globalThis.client);
  assert.doesNotMatch(texto, /🪙/);

  await I.registrarPresencia(globalThis.client, { chat, sender: "102@lid" });
  assert.equal(textoEnviado(), "🎉 Volvió @102: sale de la lista de inactivos.");
  assert.equal(F.getSaldoCoins(chat, "102@lid"), 0);
});

test(".k inactivos: solo admins, respeta el plazo y primero muestra quiénes sin etiquetarlos", async () => {
  const chat = "inactivos-6@g.us";
  const participants = armarGrupo(chat);
  const correr = (text, rango) => Kick.run(m(chat, text), { client: globalThis.client, participants, text, command: "k", usedPrefix: ".", groupMetadata: { participants }, isOwner: false, isWaAdmin: true, isAdmin: true, ...rango });

  await correr("inactivos", { isWaAdmin: false, isAdmin: false });
  assert.match(textoEnviado(), /solo para admins/);

  await correr("inactivos");
  assert.match(textoEnviado(), /No hay a quién sacar/);

  I.avisarInactivos(chat, participants, globalThis.client);
  await correr("inactivos");
  assert.match(textoEnviado(), /No hay a quién sacar.*Hay 3 avisados que todavía están en plazo/);

  // The grace period goes by.
  F.quitarAvisoInactivo(chat, ["101@lid", "102@lid", "109@lid"]);
  F.marcarAvisoInactivo(chat, ["101@lid", "102@lid", "109@lid"], Date.now() - 4 * DIA);
  await correr("inactivos");
  const vista = ultimoEnviado().msg;
  assert.match(vista.text, /Saldrían 3/);
  assert.match(vista.text, /• Persona101 — hace 20 días/);
  assert.match(vista.text, /\.k inactivos confirmar/);
  assert.equal(vista.mentions, undefined);
  assert.equal(expulsiones.length, 0);
});

test(".k inactivos confirmar saca a los avisados callados, no al que volvió, y les borra el aviso", async () => {
  const chat = "inactivos-7@g.us";
  const participants = armarGrupo(chat);
  I.avisarInactivos(chat, participants, globalThis.client, { ahora: Date.now() - 4 * DIA });
  await I.registrarPresencia(globalThis.client, { chat, sender: "102@lid" });

  await Kick.run(m(chat, "inactivos confirmar"), { client: globalThis.client, participants, text: "inactivos confirmar", command: "k", usedPrefix: ".", groupMetadata: { participants }, isOwner: false, isWaAdmin: true, isAdmin: true });
  assert.deepEqual(expulsiones.map((e) => e.ids[0]).sort(), ["101@lid", "109@lid"]);
  assert.match(textoEnviado(), /Saqué a 2 inactivos/);
  assert.equal(I.paraSacar(chat, participants, globalThis.client).listos.length, 0);
});

test("saca de a tandas y dice cuántos quedan", async () => {
  const chat = "inactivos-8@g.us";
  const participants = armarGrupo(chat);
  I.avisarInactivos(chat, participants, globalThis.client, { ahora: Date.now() - 4 * DIA });
  const tanda = I.INACTIVOS.POR_TANDA;
  I.INACTIVOS.POR_TANDA = 2;
  try {
    await I.sacarInactivos(globalThis.client, m(chat, ""), participants, { confirmar: true });
  } finally {
    I.INACTIVOS.POR_TANDA = tanda;
  }
  assert.equal(expulsiones.length, 2);
  assert.match(textoEnviado(), /Saqué a 2 inactivos\. Quedan 1: repetí \.k inactivos confirmar\./);
});

test("el que vuelve a entrar arranca de cero: el aviso de antes de irse no cuenta", () => {
  const chat = "inactivos-9@g.us";
  const participants = armarGrupo(chat);
  I.avisarInactivos(chat, participants, globalThis.client, { ahora: Date.now() - 4 * DIA });
  F.registrarIngresoGrupo(chat, ["101@lid"]);
  const { listos } = I.paraSacar(chat, participants, globalThis.client);
  assert.deepEqual(listos.map((e) => e.participante.id).sort(), ["102@lid", "109@lid"]);
  assert.ok(!I.inactivosDe(chat, participants, globalThis.client).some((e) => e.participante.id === "101@lid"));
});

test("cuenta la charla de antes de la tabla nueva (actividad_diaria)", () => {
  const chat = "inactivos-10@g.us";
  const participants = armarGrupo(chat);
  const hace3 = new Date(Date.now() - 3 * DIA);
  const dia = `${hace3.getFullYear()}-${String(hace3.getMonth() + 1).padStart(2, "0")}-${String(hace3.getDate()).padStart(2, "0")}`;
  F.sumarMensajeDiario(chat, "102@lid", dia);
  assert.ok(!I.inactivosDe(chat, participants, globalThis.client).some((e) => e.participante.id === "102@lid"));
});
