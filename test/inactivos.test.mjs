import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { EventEmitter } from "node:events";
import { prepararBase, ultimoEnviado } from "./helpers.mjs";
import strings from "../lib/strings.js";
import { numeroReciclado, unNumero, unaLid } from "./identidad-escenarios.mjs";

const DIA = 24 * 60 * 60 * 1000;
let F, I, CG, Inactivos, Kick;
let expulsiones = [];
let alExpulsar = null; // runs inside a removal: something that happens while the batch goes on
const miembros = new Map(); // chat -> participants, what the fake groupMetadata answers
const cerrados = new Set(); // chats whose fake metadata says only the admins write (announce)

before(async () => {
  ({ F } = await prepararBase("inactivos"));
  globalThis.txt = strings;
  globalThis.client.user.lid = "999@lid";
  globalThis.client.groupParticipantsUpdate = async (chat, ids, accion) => {
    expulsiones.push({ chat, ids, accion });
    await alExpulsar?.(ids[0]);
    return ids.map((jid) => ({ status: "200", jid }));
  };
  globalThis.client.groupMetadata = async (chat) => ({ id: chat, subject: "Los Pibes", announce: cerrados.has(chat), participants: miembros.get(chat) || [] });
  I = await import("../lib/inactivos.js");
  I.INACTIVOS.PAUSA_MS = 0;
  CG = await import("../lib/cache-grupos.js");
  Inactivos = (await import("../plugins/grupo-inactivos.js")).default;
  Kick = (await import("../plugins/grupo-kick.js")).default;
});

beforeEach(() => {
  expulsiones = [];
  alExpulsar = null;
  globalThis.enviados = [];
});

// One group per test, so what one warns doesn't leak into the next. The bot keeps track of it since 20 days ago (the
// first message it noted there, 101's). The cast:
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
  const participants = [
    ...[101, 102, 103, 104, 106, 107, 109].map((n) => ({ id: `${n}@lid`, admin: null })),
    { id: "105@lid", admin: "admin" },
    { id: "999@lid", admin: "admin" },
    { id: "59899000108@s.whatsapp.net", lid: "108@lid", admin: null },
  ];
  miembros.set(chat, participants);
  return participants;
}

const m = (chat, text, sender = "105@lid") => ({ chat, sender, text, isGroup: true, react: async () => {}, delete: async () => {} });
const textoEnviado = () => ultimoEnviado()?.msg?.text || "";
const kick = (chat, participants, text, rango = {}) => Kick.run(m(chat, text), { client: globalThis.client, participants, text, command: "k", usedPrefix: ".", groupMetadata: { participants }, isOwner: false, isWaAdmin: true, isAdmin: true, ...rango });
const avisar = (chat, ...ids) => {
  for (const id of ids) F.marcarAvisoInactivo(chat, [id], Date.now() - 4 * DIA); // warned 4 days ago: the grace period went by
};

test(".inactivos etiqueta solo a los callados de verdad: ni admins, ni roles, ni el bot, ni recién llegados", async () => {
  const chat = "inactivos-1@g.us";
  const participants = armarGrupo(chat);
  await Inactivos.run(m(chat, ""), { client: globalThis.client, participants, text: "" });

  const { msg } = ultimoEnviado();
  assert.deepEqual(msg.mentions.sort(), ["101@lid", "102@lid", "109@lid"]);
  assert.match(msg.text, /Inactivos \(3\)/);
  assert.match(msg.text, /@101 — hace 20 días/);
  assert.match(msg.text, /@102 — no le vi ningún mensaje/);
  assert.match(msg.text, /se salva y se lleva 🪙 10/);
});

test(".inactivos 30 cambia el corte, y un número que no es de días se rechaza", async () => {
  const chat = "inactivos-2@g.us";
  F.registrarMensajeGrupo(chat, ["105@lid"], Date.now() - 40 * DIA); // here the bot keeps track since 40 days ago
  const participants = armarGrupo(chat);
  await Inactivos.run(m(chat, "30"), { client: globalThis.client, participants, text: "30" });
  assert.deepEqual(ultimoEnviado().msg.mentions.sort(), ["102@lid", "109@lid"]); // 101 wrote 20 days ago: not 30 yet

  await Inactivos.run(m(chat, "mucho"), { client: globalThis.client, participants, text: "mucho" });
  assert.match(textoEnviado(), /cuántos días/);
});

test("un segundo .inactivos no reinicia el plazo del primero", async () => {
  const chat = "inactivos-3@g.us";
  const ahora = Date.now();
  const participants = armarGrupo(chat, ahora);
  await I.avisarInactivos(globalThis.client, m(chat, ""), participants, { ahora: ahora - 4 * DIA });
  await I.avisarInactivos(globalThis.client, m(chat, ""), participants, { ahora });
  const { listos } = I.paraSacar(chat, participants, globalThis.client, ahora);
  assert.deepEqual(listos.map((e) => e.participante.id).sort(), ["101@lid", "102@lid", "109@lid"]);
});

test("el avisado que vuelve a escribir se salva y cobra una sola vez", async () => {
  const chat = "inactivos-4@g.us";
  const participants = armarGrupo(chat);
  await I.avisarInactivos(globalThis.client, m(chat, ""), participants);
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
  const { texto } = await I.avisarInactivos(globalThis.client, m(chat, ""), participants);
  assert.doesNotMatch(texto, /🪙/);

  await I.registrarPresencia(globalThis.client, { chat, sender: "102@lid" });
  assert.equal(textoEnviado(), "🎉 Volvió @102: sale de la lista de inactivos.");
  assert.equal(F.getSaldoCoins(chat, "102@lid"), 0);
});

// The preview goes to the admin in private, mentioned: there their WhatsApp names each one, and a mention only notifies
// whoever is in the chat. In the group the bot named them, and whoever it knew no name for was "alguien".
test(".k inactivos: solo admins, respeta el plazo y primero le dice al admin por privado quiénes saldrían", async () => {
  const chat = "inactivos-6@g.us";
  const participants = armarGrupo(chat);

  await kick(chat, participants, "inactivos", { isWaAdmin: false, isAdmin: false });
  assert.match(textoEnviado(), /solo para admins/);

  await kick(chat, participants, "inactivos");
  assert.match(textoEnviado(), /No hay a quién sacar/);

  for (const id of ["101@lid", "102@lid", "109@lid"]) F.marcarAvisoInactivo(chat, [id], Date.now()); // warned just now
  await kick(chat, participants, "inactivos");
  assert.match(textoEnviado(), /No hay a quién sacar.*Hay 3 personas avisadas que todavía están en plazo/);

  // The grace period goes by.
  F.quitarAvisoInactivo(chat, ["101@lid", "102@lid", "109@lid"]);
  avisar(chat, "101@lid", "102@lid", "109@lid");
  globalThis.enviados = [];
  await kick(chat, participants, "inactivos");
  const privado = globalThis.enviados.find((e) => e.chat === "105@lid")?.msg;
  assert.match(privado?.text || "", /^☠️ \*En Los Pibes saldrían 3\*/);
  assert.match(privado.text, /• @101 — hace 20 días/);
  assert.match(privado.text, /\.k inactivos confirmar/);
  assert.deepEqual(privado.mentions.sort(), ["101@lid", "102@lid", "109@lid"]);
  const enElGrupo = ultimoEnviado();
  assert.equal(enElGrupo.chat, chat);
  assert.equal(enElGrupo.msg.text, "☠️ Saldrían 3: te mandé por privado quiénes son. Para sacarlos: *.k inactivos confirmar*");
  assert.equal(enElGrupo.msg.mentions, undefined);
  assert.equal(expulsiones.length, 0);
});

test(".k inactivos confirmar saca a los avisados callados, no al que volvió, y les borra el aviso", async () => {
  const chat = "inactivos-7@g.us";
  const participants = armarGrupo(chat);
  await I.avisarInactivos(globalThis.client, m(chat, ""), participants, { ahora: Date.now() - 4 * DIA });
  await I.registrarPresencia(globalThis.client, { chat, sender: "102@lid" });

  await kick(chat, participants, "inactivos");
  await kick(chat, participants, "inactivos confirmar");
  assert.deepEqual(expulsiones.map((e) => e.ids[0]).sort(), ["101@lid", "109@lid"]);
  assert.equal(textoEnviado(), "🧹 Saqué a 2 personas.");
  assert.equal(I.paraSacar(chat, participants, globalThis.client).listos.length, 0);
});

test("saca de a tandas y dice cuántos quedan", async () => {
  const chat = "inactivos-8@g.us";
  const participants = armarGrupo(chat);
  await I.avisarInactivos(globalThis.client, m(chat, ""), participants, { ahora: Date.now() - 4 * DIA });
  const tanda = I.INACTIVOS.POR_TANDA;
  I.INACTIVOS.POR_TANDA = 2;
  try {
    await I.sacarInactivos(globalThis.client, m(chat, ""), participants);
    await I.sacarInactivos(globalThis.client, m(chat, ""), participants, { confirmar: true });
  } finally {
    I.INACTIVOS.POR_TANDA = tanda;
  }
  assert.equal(expulsiones.length, 2);
  assert.equal(textoEnviado(), "🧹 Saqué a 2 personas. Queda 1: repetí .k inactivos confirmar.");
});

test("el que vuelve a entrar arranca de cero: el aviso de antes de irse no cuenta", async () => {
  const chat = "inactivos-9@g.us";
  const participants = armarGrupo(chat);
  await I.avisarInactivos(globalThis.client, m(chat, ""), participants, { ahora: Date.now() - 4 * DIA });
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

// Before the bot kept track of a group, nobody can be told apart from someone silent. It used to go by the first time
// it had seen each one write: right after the update, whoever sent only stickers, audios or one-word messages (counted,
// but not when) came out "hace 120 días", tagged, and three days later removable.
test("sin datos de antes de que el bot anote un grupo, nadie cuenta como callado", async () => {
  const deAntes = (chat, ...ns) => {
    for (const n of ns) {
      F.initDataDB({ chat, sender: `${n}@lid`, senderJid: "", pushName: `Persona${n}` });
      F.getUser(`${n}@lid`, chat);
      for (let i = 0; i < 50; i++) F.sumarMensajeEnGrupo(`${n}@lid`, chat);
      F.updateUserInGroup(`${n}@lid`, chat, { desde: Date.now() - 120 * DIA }); // first seen writing, 4 months ago
    }
    const participants = ns.map((n) => ({ id: `${n}@lid`, admin: null }));
    miembros.set(chat, participants);
    return participants;
  };

  // It keeps track since yesterday: nobody yet, and it says when it can tell.
  const ayer = "inactivos-11@g.us";
  let participants = deAntes(ayer, 101, 102);
  F.registrarMensajeGrupo(ayer, ["105@lid"], Date.now() - DIA);
  await Inactivos.run(m(ayer, ""), { client: globalThis.client, participants, text: "" });
  assert.equal(textoEnviado(), "Todavía no sé quién no escribe hace 15 días: empecé a anotar quién escribe en este grupo hace 1 día. Probá en 14 días.");
  assert.equal(ultimoEnviado().msg.mentions, undefined);

  // Since 16 days ago: who sent a sticker 5 days ago stays, and who sent nothing counts from then,
  // not from 4 months back.
  const antes = "inactivos-12@g.us";
  participants = deAntes(antes, 101, 102);
  F.registrarMensajeGrupo(antes, ["105@lid"], Date.now() - 16 * DIA);
  F.registrarMensajeGrupo(antes, ["101@lid"], Date.now() - 5 * DIA);
  await Inactivos.run(m(antes, ""), { client: globalThis.client, participants, text: "" });
  assert.deepEqual(ultimoEnviado().msg.mentions, ["102@lid"]);
  assert.match(textoEnviado(), /@102 — hace 16 días o más/);
});

// The bot coming back to a group after a while: what it noted before doesn't cover the time it wasn't there, and
// everyone would have looked silent for that long.
test("cuando el bot entra o sale de un grupo, la cuenta de .inactivos empieza de nuevo", () => {
  const chat = "inactivos-13@g.us";
  const participants = armarGrupo(chat);
  assert.ok(I.inactivosDe(chat, participants, globalThis.client).length > 0);
  assert.equal(I.reiniciarSiEsElBot(globalThis.client, chat, [{ id: "101@lid" }]), false, "si no es el bot, nada");
  assert.equal(I.reiniciarSiEsElBot(globalThis.client, chat, [{ id: "999@lid", admin: null }]), true);
  assert.deepEqual(I.inactivosDe(chat, participants, globalThis.client), []);
  F.registrarMensajeGrupo(chat, ["103@lid"]);
  assert.ok(Math.abs(F.inicioPresencia(chat) - Date.now()) < 5000, "el próximo mensaje la arranca");
  assert.match(fs.readFileSync(new URL("../main.js", import.meta.url), "utf8"), /action === "add" \|\| action === "remove"\) reiniciarSiEsElBot\(client, id, participants\)/);
});

// It used to take the list once and go through it: someone who wrote while the removals went on was told "Volvió" and
// removed all the same. Each one is looked at again right before.
test(".k inactivos confirmar vuelve a mirar a cada uno justo antes de sacarlo", async () => {
  const chat = "inactivos-14@g.us";
  const participants = armarGrupo(chat);
  avisar(chat, "101@lid", "102@lid", "109@lid");
  await kick(chat, participants, "inactivos");
  // While the first one goes: 102 writes, and 109 is made admin (main.js refreshes the group on a promotion).
  alExpulsar = async (id) => {
    if (id !== "101@lid") return;
    await I.registrarPresencia(globalThis.client, { chat, sender: "102@lid" });
    miembros.set(chat, participants.map((p) => (p.id === "109@lid" ? { ...p, admin: "admin" } : p)));
    await CG.metadataDe(globalThis.client, chat, { fresca: true });
  };
  await kick(chat, participants, "inactivos confirmar");
  assert.deepEqual(expulsiones.map((e) => e.ids[0]), ["101@lid"]);
  assert.equal(textoEnviado(), "🧹 Saqué a 1 persona. 2 se salvaron a último momento: escribieron, o las hicieron admins o les dieron un rol.");
});

// They counted as warned before the message went out: if it didn't, their 3 days ran without them knowing.
test("si el aviso de .inactivos no sale, nadie queda avisado", async () => {
  const chat = "inactivos-15@g.us";
  const participants = armarGrupo(chat);
  const client = {
    ...globalThis.client,
    sendMessage: async () => {
      throw new Error("Connection Closed");
    },
  };
  await assert.rejects(Inactivos.run(m(chat, ""), { client, participants, text: "" }), /Connection Closed/);
  assert.deepEqual(F.presenciaDelGrupo(chat).filter((r) => r.avisado), []);
});

// A second .inactivos tagged the warned again with "Tienen 3 días", while their days ran from the first notice: they
// could be removed that same minute.
test("un segundo .inactivos no vuelve a etiquetar a los ya avisados, que siguen con su plazo", async () => {
  const chat = "inactivos-16@g.us";
  const participants = armarGrupo(chat);
  F.initDataDB({ chat, sender: "110@lid", senderJid: "", pushName: "Persona110" });
  F.registrarMensajeGrupo(chat, ["110@lid"], Date.now() - 17 * DIA);
  participants.push({ id: "110@lid", admin: null });
  avisar(chat, "101@lid", "102@lid", "109@lid");
  await Inactivos.run(m(chat, ""), { client: globalThis.client, participants, text: "" });
  const { msg } = ultimoEnviado();
  assert.deepEqual(msg.mentions, ["110@lid"]);
  assert.match(msg.text, /Inactivos \(1\)/);
  assert.match(msg.text, /A 3 personas avisadas antes ya se las puede sacar con \.k inactivos\./);

  // And who was warned a moment ago is still within their days.
  for (const id of ["101@lid", "102@lid", "109@lid"]) F.quitarAvisoInactivo(chat, [id]);
  for (const id of ["101@lid", "102@lid", "109@lid", "110@lid"]) F.marcarAvisoInactivo(chat, [id], Date.now());
  await Inactivos.run(m(chat, ""), { client: globalThis.client, participants, text: "" });
  assert.equal(textoEnviado(), "No hay inactivos nuevos. 4 personas ya estaban avisadas y siguen en su plazo.");
});

test("quien avisó con .afk que no está no entra en .inactivos", async () => {
  const chat = "inactivos-17@g.us";
  const participants = armarGrupo(chat);
  F.getUser("101@lid", chat);
  F.updateUserInGroup("101@lid", chat, { afk: Date.now() - 16 * DIA, afkReason: "me voy de viaje un mes" });
  await Inactivos.run(m(chat, ""), { client: globalThis.client, participants, text: "" });
  assert.deepEqual(ultimoEnviado().msg.mentions.sort(), ["102@lid", "109@lid"]);
});

// A number may have an old row keyed by itself besides the one with the LID. In a group listed by number whose list
// doesn't bring the LID, looking the person up by number found the old row, and what they wrote under their LID wasn't
// seen: they were tagged every time.
test("en un grupo por número sin la LID en la lista, quien tiene una fila vieja por número no queda como callado", async () => {
  const chat = "inactivos-18@g.us";
  const PN = "59899000222@s.whatsapp.net";
  F.initDataDB({ chat, sender: PN, senderJid: PN, pushName: "Beto" }); // the old row, keyed by the number
  F.initDataDB({ chat, sender: "222@lid", senderJid: PN, pushName: "Beto" });
  F.registrarMensajeGrupo(chat, ["105@lid"], Date.now() - 20 * DIA);
  F.registrarMensajeGrupo(chat, ["222@lid", PN], Date.now() - DIA); // yesterday, a message that brought the LID
  const participants = [{ id: PN, admin: null }];
  miembros.set(chat, participants);
  await Inactivos.run(m(chat, ""), { client: globalThis.client, participants, text: "" });
  assert.match(textoEnviado(), /^No hay inactivos/);
});

// The "Volvió" waits its turn to go out (lib/envios.js), and the hooks after this one, a trivia's answer among them,
// used to wait with it: 1.5 s or more, and the prize went to whoever answered after.
test("el «Volvió» no hace esperar a los hooks que vienen después", async () => {
  const chat = "inactivos-30@g.us";
  armarGrupo(chat);
  avisar(chat, "101@lid");
  const client = { ...globalThis.client, sendText: () => new Promise(() => {}) }; // its turn never comes
  const llego = await Promise.race([I.registrarPresencia(client, { chat, sender: "101@lid" }).then(() => "siguió"), new Promise((r) => setTimeout(() => r("esperando"), 200))]);
  assert.equal(llego, "siguió");
  assert.equal(F.presenciaDelGrupo(chat).find((r) => r.usuario === "101@lid").avisado, null, "y lo salvó igual");
});

// A warning kept under the LID and the number, lifted by a message that brought only the LID, stayed under the number,
// and a later message with it paid again.
test("un aviso guardado bajo la LID y el número se levanta entero: el regreso se paga una vez", async () => {
  const chat = "inactivos-31@g.us";
  armarGrupo(chat);
  F.marcarAvisoInactivo(chat, ["101@lid", "59899000101@s.whatsapp.net"], Date.now() - DIA);
  await I.registrarPresencia(globalThis.client, { chat, sender: "101@lid", senderJid: "" });
  await I.registrarPresencia(globalThis.client, { chat, sender: "101@lid", senderJid: "59899000101@s.whatsapp.net" });
  assert.equal(F.getSaldoCoins(chat, "101@lid"), 10);
});

// A warning kept under the number alone, from a group that listed people by number, lifted by a message that brings
// only the LID: by the number the database knows for that LID. Otherwise it stayed, and .k inactivos took them for
// silent though they wrote.
test("un aviso guardado solo bajo el número lo levanta un mensaje que trae solo la LID", async () => {
  const chat = "inactivos-aviso-por-numero@g.us";
  armarGrupo(chat);
  F.marcarAvisoInactivo(chat, ["59899000101@s.whatsapp.net"], Date.now() - DIA);
  await I.registrarPresencia(globalThis.client, { chat, sender: "101@lid", senderJid: "" });
  assert.equal(F.presenciaDelGrupo(chat).find((r) => r.usuario === "59899000101@s.whatsapp.net")?.avisado ?? null, null);
});

// A moderator's number that another LID has a newer row with: the group lists the number alone, and it may be the
// moderator. Protected, as the roles are read by both identities: without the number of the moderator's LID, the newer
// row took them for someone else, and .inactivos tagged them.
test("un moderador listado por un número que otra LID también tiene no entra en .inactivos", async () => {
  const chat = "inactivos-mod-por-numero@g.us";
  const [MOD, OTRA, X] = ["300000000000781@lid", "300000000000782@lid", "59899000781@s.whatsapp.net"];
  F.initDataDB({ chat, sender: MOD, senderJid: X, pushName: "Mod" });
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, 'Otra', ?)").run(OTRA, X, Date.now() + 60_000);
  F.setRolGrupo(chat, MOD, "mod", "105@lid");
  F.registrarMensajeGrupo(chat, ["105@lid"], Date.now() - 20 * DIA);
  const participants = [{ id: X, admin: null }, { id: "105@lid", admin: "admin" }, { id: "999@lid", admin: "admin" }];
  miembros.set(chat, participants);
  await Inactivos.run(m(chat, ""), { client: globalThis.client, participants, text: "" });
  assert.ok(!(ultimoEnviado()?.msg?.mentions || []).includes(X), textoEnviado());
});

// With ".inactivos 1" a moderator could warn the same people every other day, and coming back paid each time.
test("el premio por volver va una vez cada 30 días, y .inactivos pide 7 días como mínimo", async () => {
  const chat = "inactivos-32@g.us";
  const participants = armarGrupo(chat);
  for (let vez = 0; vez < 2; vez++) {
    avisar(chat, "101@lid");
    await I.registrarPresencia(globalThis.client, { chat, sender: "101@lid" });
    // They came back 10 days ago: the next warning, 4 days ago, is after that (one from before isn't a warning).
    db.prepare("UPDATE presencia_grupo SET ultimo_mensaje = ? WHERE chat = ? AND usuario = ?").run(Date.now() - 10 * DIA, chat, "101@lid");
  }
  assert.equal(F.getSaldoCoins(chat, "101@lid"), 10);
  assert.equal(textoEnviado(), "🎉 Volvió @101: sale de la lista de inactivos.", "la segunda vez, sin premio");
  await Inactivos.run(m(chat, "1"), { client: globalThis.client, participants, text: "1" });
  assert.match(textoEnviado(), /de 7 a 365/);
});

// An owner who never wrote anywhere the bot is, or a mod given the role by number, has no row: in a group listed by LID
// nothing tied their LID to them, and they were tagged. WhatsApp's own map (Baileys' lidMapping) does.
test("reconoce al owner y a quien tiene rol aunque la base no los conozca, con el mapa de WhatsApp", async () => {
  const chat = "inactivos-33@g.us";
  F.registrarMensajeGrupo(chat, ["105@lid"], Date.now() - 20 * DIA);
  F.setRolGrupo(chat, "59899000555@s.whatsapp.net", "mod", "105@lid");
  F.setRolGrupo(chat, "556@lid", "mod", "105@lid"); // listed by number, which the map brings with the device
  const participants = [{ id: "4444@lid", admin: null }, { id: "555@lid", admin: null }, { id: "666@lid", admin: null }, { id: "59899000556@s.whatsapp.net", admin: null }];
  miembros.set(chat, participants);
  const mapa = { "59899777777@s.whatsapp.net": "4444@lid", "59899000555@s.whatsapp.net": "555@lid", "556@lid": "59899000556:0@s.whatsapp.net" };
  const ownersReales = globalThis.owners;
  globalThis.owners = [...ownersReales, "59899777777"];
  // Like Baileys' (Signal/lid-mapping.js, in node_modules): pairs of { pn, lid } for many at once, and one at a time
  // through those.
  const lidMapping = { getLIDsForPNs: async (pns) => pns.filter((pn) => mapa[pn]).map((pn) => ({ pn, lid: mapa[pn] })), getPNsForLIDs: async (lids) => lids.filter((lid) => mapa[lid]).map((lid) => ({ lid, pn: mapa[lid] })) };
  lidMapping.getLIDForPN = async (pn) => (await lidMapping.getLIDsForPNs([pn]))?.[0]?.lid || null;
  lidMapping.getPNForLID = async (lid) => (await lidMapping.getPNsForLIDs([lid]))?.[0]?.pn || null;
  globalThis.client.signalRepository = { lidMapping };
  try {
    await Inactivos.run(m(chat, ""), { client: globalThis.client, participants, text: "" });
  } finally {
    delete globalThis.client.signalRepository;
    globalThis.owners = ownersReales;
  }
  assert.deepEqual(ultimoEnviado().msg.mentions, ["666@lid"]);
});

// It asked WhatsApp's map one person at a time, each with CONSULTA_MS of its own: with WhatsApp slow, every .inactivos
// and .k inactivos waited that long times the people the database didn't know. All of them go in one question each
// way, within one CONSULTA_MS, and a question left unanswered doesn't take the other's answer with it.
// With its own time limit: if the code stopped putting one on the question WhatsApp doesn't answer, this would wait
// for it, and hang until npm test's 120 s instead of failing.
test("al mapa de WhatsApp le pregunta por todos de una vez, con un solo tope de espera", { timeout: 10_000 }, async (t) => {
  const chat = "inactivos-48@g.us";
  F.registrarMensajeGrupo(chat, ["105@lid"], Date.now() - 20 * DIA);
  for (const n of [1, 2, 3, 4]) F.setRolGrupo(chat, `880${n}@lid`, "mod", "105@lid"); // mods with no number on record
  const participants = [1, 2, 3, 9].map((n) => ({ id: `770${n}@lid`, admin: null }));
  miembros.set(chat, participants);
  const nuevos = ["59899777701", "59899777702", "59899777703"]; // owners who never wrote: no row
  const preguntas = [];
  const mapa = {
    getLIDsForPNs: async (pns) => (preguntas.push(["pn", pns]), pns.map((pn) => ({ pn, lid: `770${pn.split("@")[0].at(-1)}@lid` }))),
    getPNsForLIDs: (lids) => (preguntas.push(["lid", lids]), new Promise(() => {})), // WhatsApp doesn't answer
  };
  // One at a time, as Baileys' own do it (Signal/lid-mapping.js).
  mapa.getLIDForPN = async (pn) => (await mapa.getLIDsForPNs([pn]))?.[0]?.lid || null;
  mapa.getPNForLID = async (lid) => (await mapa.getPNsForLIDs([lid]))?.[0]?.pn || null;
  const ID = await import("../lib/identidad.js");
  const [ownersReales, consultaReal, esperarReal] = [globalThis.owners, I.INACTIVOS.CONSULTA_MS, ID._dep.esperar];
  // Put back by t.after, which runs also when the test runs out of its time: a finally after the hang never came, and
  // the next test ran with all of this still in place.
  t.after(() => {
    delete globalThis.client.signalRepository;
    [globalThis.owners, I.INACTIVOS.CONSULTA_MS, ID._dep.esperar] = [ownersReales, consultaReal, esperarReal];
  });
  globalThis.owners = [...ownersReales, ...nuevos];
  globalThis.client.signalRepository = { lidMapping: mapa };
  I.INACTIVOS.CONSULTA_MS = 100;
  // The time limit, without the clock: it goes by once what's already answered is in. Measured, it failed under load.
  // The wait is lib/identidad.js's, which asks the map (conElMapaDeWhatsApp), for as long as .inactivos says.
  const topes = [];
  ID._dep.esperar = (ms, valor) => (topes.push(ms), new Promise((r) => setImmediate(() => r(valor))));
  await Inactivos.run(m(chat, ""), { client: globalThis.client, participants, text: "" });
  assert.deepEqual(ultimoEnviado().msg.mentions, ["7709@lid"], "los owners, aunque la otra pregunta no tuvo respuesta");
  assert.deepEqual(preguntas.map(([lado]) => lado).sort(), ["lid", "pn"], "una pregunta para cada lado");
  assert.ok(nuevos.every((n) => preguntas.find(([lado]) => lado === "pn")[1].includes(`${n}@s.whatsapp.net`)));
  assert.deepEqual(topes, [100], "un solo tope para las dos");
});

test("en un grupo cerrado, donde solo escriben los admins, no etiqueta ni saca a nadie", async () => {
  const chat = "inactivos-34@g.us";
  const participants = armarGrupo(chat);
  cerrados.add(chat);
  avisar(chat, "101@lid");
  await Inactivos.run(m(chat, ""), { client: globalThis.client, participants, text: "" });
  assert.match(textoEnviado(), /^Este grupo está cerrado: solo escriben los admins/);
  await kick(chat, participants, "inactivos");
  assert.match(textoEnviado(), /^El grupo está cerrado: los avisados no pueden escribir para salvarse/);
  assert.equal(expulsiones.length, 0);
});

// ".k inactivos sí" removed without anyone having seen who, and "confirmar" took whoever was removable at that moment.
test(".k inactivos confirmar saca solo a quienes mostró la vista previa, y sin vista previa no saca", async () => {
  const chat = "inactivos-35@g.us";
  const participants = armarGrupo(chat);
  avisar(chat, "101@lid", "102@lid");
  await kick(chat, participants, "inactivos sí");
  assert.equal(textoEnviado(), "Primero mirá quiénes saldrían con .k inactivos (te lo mando por privado), y después confirmá.");
  assert.equal(expulsiones.length, 0);
  await kick(chat, participants, "inactivos"); // the preview: 101 and 102
  avisar(chat, "109@lid"); // removable too, but after the preview
  await kick(chat, participants, "inactivos confirmar");
  assert.deepEqual(expulsiones.map((e) => e.ids[0]).sort(), ["101@lid", "102@lid"]);
});

// It used to ask the database for each participant and each of their ids, some eleven queries a person: a second for
// a group of a thousand listed by number, with the whole bot waiting.
test("con muchos miembros, .inactivos le pregunta poco a la base", () => {
  const chat = "inactivos-36@g.us";
  F.registrarMensajeGrupo(chat, ["105@lid"], Date.now() - 20 * DIA);
  const participants = [];
  for (let n = 7000; n < 7200; n++) {
    F.initDataDB({ chat, sender: `${n}@lid`, senderJid: `5989900${n}@s.whatsapp.net`, pushName: `P${n}` });
    participants.push({ id: `5989900${n}@s.whatsapp.net`, lid: `${n}@lid`, admin: null });
  }
  const prepareReal = db.prepare;
  let consultas = 0;
  db.prepare = function (sql) {
    consultas++;
    return prepareReal.call(this, sql);
  };
  try {
    I.inactivosDe(chat, participants, globalThis.client);
  } finally {
    delete db.prepare;
  }
  assert.ok(consultas / participants.length < 4, `${consultas} consultas para ${participants.length} personas`);
});

test("el bot no entra en la lista aunque no sea admin del grupo", async () => {
  const chat = "inactivos-37@g.us";
  const participants = armarGrupo(chat).map((p) => (p.id === "999@lid" ? { ...p, admin: null } : p));
  miembros.set(chat, participants);
  await Inactivos.run(m(chat, ""), { client: globalThis.client, participants, text: "" });
  assert.deepEqual(ultimoEnviado().msg.mentions.sort(), ["101@lid", "102@lid", "109@lid"]);
});

// The second confirmation goes once: without the lock it removed 101 again, which ran it again, and the test hung
// instead of failing. The timeout is for anything else that hangs.
test("una segunda confirmación mientras saca no saca de nuevo", { timeout: 10000 }, async () => {
  const chat = "inactivos-38@g.us";
  const participants = armarGrupo(chat);
  avisar(chat, "101@lid", "102@lid");
  await kick(chat, participants, "inactivos");
  let segunda = null;
  alExpulsar = async (id) => {
    if (id !== "101@lid" || segunda !== null) return;
    segunda = "";
    await kick(chat, participants, "inactivos confirmar");
    segunda = textoEnviado();
  };
  await kick(chat, participants, "inactivos confirmar");
  assert.equal(segunda, "Ya los estoy sacando, esperá a que termine.");
  assert.deepEqual(expulsiones.map((e) => e.ids[0]).sort(), ["101@lid", "102@lid"]);
});

// Writing lifts the warning, but only under the ids the message brought: someone warned under their number who wrote
// under their LID still has it, and the silence since the warning is what keeps them.
test("no saca a quien escribió después del aviso con una identidad que el aviso no tiene", () => {
  const chat = "inactivos-39@g.us";
  const participants = armarGrupo(chat); // 108 wrote yesterday, under their LID
  F.marcarAvisoInactivo(chat, ["59899000108@s.whatsapp.net"], Date.now() - 4 * DIA);
  assert.ok(!I.paraSacar(chat, participants, globalThis.client).listos.some((e) => e.participante.id === "59899000108@s.whatsapp.net"));
});

test("entre una expulsión y la siguiente espera la pausa", async () => {
  const chat = "inactivos-40@g.us";
  const participants = armarGrupo(chat);
  avisar(chat, "101@lid", "102@lid", "109@lid");
  await kick(chat, participants, "inactivos");
  const esperas = [];
  const [esperarReal, pausaReal] = [I._dep.esperar, I.INACTIVOS.PAUSA_MS];
  I._dep.esperar = async (ms) => esperas.push(ms);
  I.INACTIVOS.PAUSA_MS = 3000; // the other tests go without it; with 0, waiting 0 passed for the pause
  try {
    await kick(chat, participants, "inactivos confirmar");
  } finally {
    [I._dep.esperar, I.INACTIVOS.PAUSA_MS] = [esperarReal, pausaReal];
  }
  assert.equal(expulsiones.length, 3);
  assert.deepEqual(esperas, [3000, 3000]);
});

// What .inactivos needs of each one (afk, messages) is read by SQLite out of inGroup, instead of parsing all of it: a
// row whose inGroup isn't valid JSON counts as having nothing there, as getUser takes it, and doesn't stop the rest.
test("una fila con inGroup roto no rompe .inactivos", () => {
  const chat = "inactivos-41@g.us";
  const participants = armarGrupo(chat);
  F.initDataDB({ chat, sender: "8001@lid", senderJid: "", pushName: "Roto" });
  db.prepare("UPDATE users SET inGroup = ? WHERE lid = ?").run("{roto", "8001@lid");
  participants.push({ id: "8001@lid", admin: null });
  assert.ok(I.inactivosDe(chat, participants, globalThis.client).some((e) => e.participante.id === "8001@lid"));
});

// The bot leaving the group and coming back starts the count over, and its warnings from before don't stand. Whoever it
// had warned wasn't tagged again, .inactivos said they could be removed and .k inactivos that there was nobody to
// remove; and writing, weeks later, paid the prize for coming back.
test("los avisos de antes de que el bot vuelva al grupo no dejan a nadie afuera, ni pagan el regreso", async () => {
  const ahora = Date.now();
  const volver = (chat) => {
    const participants = armarGrupo(chat, ahora); // 101 wrote 20 days ago
    F.marcarAvisoInactivo(chat, ["101@lid"], ahora - 19 * DIA);
    I.reiniciarSiEsElBot(globalThis.client, chat, [{ id: "999@lid", admin: null }]); // it left the group…
    F.registrarIngresoGrupo(chat, ["999@lid"], ahora - 16 * DIA); // …and came back 16 days ago
    return participants;
  };

  const chat = "inactivos-42@g.us";
  const participants = volver(chat);
  await Inactivos.run(m(chat, ""), { client: globalThis.client, participants, text: "" });
  assert.deepEqual(ultimoEnviado().msg.mentions.sort(), ["101@lid", "102@lid", "109@lid"]);
  await kick(chat, participants, "inactivos");
  assert.equal(textoEnviado(), "No hay a quién sacar: nadie fue avisado con .inactivos hace 3 días o más y siguió callado. Hay 3 personas avisadas que todavía están en plazo.");

  const otro = "inactivos-43@g.us";
  volver(otro);
  globalThis.enviados = [];
  await I.registrarPresencia(globalThis.client, { chat: otro, sender: "101@lid" });
  assert.deepEqual(globalThis.enviados, [], "sin «Volvió»");
  assert.equal(F.getSaldoCoins(otro, "101@lid"), 0);
});

// Someone on the list who writes while the notice waits its turn to go out (lib/envios.js): the warning was marked
// afterwards, with the time of the command, from before their message. Writing didn't lift it, .k inactivos never took
// it, and it kept them out of the next .inactivos: "ya se la puede sacar", and "No hay a quién sacar".
test("quien escribe mientras sale el aviso no queda afuera de los .inactivos que siguen", async () => {
  const avisarMientras = async (chat, antes) => {
    const participants = armarGrupo(chat, antes);
    const client = {
      ...globalThis.client,
      sendMessage: async (...args) => {
        if (args[1]?.mentions?.length) F.registrarMensajeGrupo(chat, ["101@lid"], antes + 2000); // 101 writes meanwhile
        return globalThis.client.sendMessage(...args);
      },
    };
    await I.avisarInactivos(client, m(chat, ""), participants, { ahora: antes });
    return participants;
  };

  // 25 days later, 101 silent since: tagged again, with the ones who went silent meanwhile, and warned with the whole
  // grace period ahead. 102 and 109, warned then, can be removed.
  const chat = "inactivos-44@g.us";
  const participants = await avisarMientras(chat, Date.now() - 25 * DIA);
  await Inactivos.run(m(chat, ""), { client: globalThis.client, participants, text: "" });
  assert.ok(ultimoEnviado().msg.mentions.includes("101@lid"), JSON.stringify(ultimoEnviado().msg.mentions));
  assert.match(textoEnviado(), /A 2 personas avisadas antes ya se las puede sacar/);
  assert.ok(I.paraSacar(chat, participants, globalThis.client).enPlazo.some((e) => e.participante.id === "101@lid"));

  // And writing again isn't coming back: they had written already.
  const otro = "inactivos-47@g.us";
  await avisarMientras(otro, Date.now() - DIA);
  globalThis.enviados = [];
  await I.registrarPresencia(globalThis.client, { chat: otro, sender: "101@lid" });
  assert.deepEqual(globalThis.enviados, [], "sin «Volvió»");
  assert.equal(F.getSaldoCoins(otro, "101@lid"), 0);
});

// The nights .horariogrupo closes the group don't count: nobody can write to save themselves then. The warned's 3 days
// take longer, and nobody is removed for the hours they couldn't write. .g notes it the same.
test("las noches que .horariogrupo cierra el grupo no cuentan para el plazo de los avisados", async () => {
  const HG = await import("../lib/horario-grupo.js");
  const chat = "inactivos-45@g.us";
  const participants = armarGrupo(chat);
  const ahora = Date.now();
  const avisada = ahora - 3.5 * DIA;
  F.marcarAvisoInactivo(chat, ["101@lid"], avisada);
  assert.ok(HG.fijarHorarioGrupo(chat, "8:00-22:00").ok);
  const client = { ...globalThis.client, groupSettingUpdate: async () => {} };
  try {
    for (let t = avisada; t <= ahora; t += 15 * 60 * 1000) await HG.chequearHorariosGrupo(new Date(t), client); // as tareas-programadas runs it
  } finally {
    await HG.quitarHorarioGrupo(chat, client);
  }
  const { listos, enPlazo } = I.paraSacar(chat, participants, globalThis.client, ahora);
  assert.deepEqual([listos, enPlazo.map((e) => e.participante.id)], [[], ["101@lid"]], "con tres noches cerradas, sigue en plazo");

  const G = (await import("../plugins/grupo-abrir-cerrar.js")).default;
  const otro = "inactivos-46@g.us";
  const g = () => G.run(m(otro, ".g"), { client, groupMetadata: { participants: [] } });
  await g();
  assert.deepEqual(F.cierresGrupo(otro).map((c) => c.hasta), [null], "lo cerró");
  cerrados.add(otro);
  CG.invalidar(client, otro);
  await g();
  assert.ok(F.cierresGrupo(otro)[0].hasta >= F.cierresGrupo(otro)[0].desde, "y lo abrió");
});

// The bot tells itself apart by client.user, whose ids lib/wa-socket.js cleans when it makes the socket. On connecting,
// Baileys writes the LID the server sends, with the device ("…:5@lid"), into its own creds (Socket/socket.js); the
// bot's client.user is a copy taken when the socket was made (each layer of Baileys spreads the one below it), and it
// keeps the clean one. If that changed, in a group listed by LID the bot wouldn't know itself: .inactivos would tag it,
// and its coming back to a group wouldn't start the count over. With Baileys' real socket, over a fake connection.
test("la LID del bot sigue limpia después de que Baileys la cambia al conectar", async () => {
  const { WebSocketClient } = await import("@whiskeysockets/baileys/lib/Socket/Client/websocket.js");
  const { initAuthCreds } = await import("@whiskeysockets/baileys");
  const pino = (await import("pino")).default;
  const WS = await import("../lib/wa-socket.js");
  const conectar = WebSocketClient.prototype.connect;
  WebSocketClient.prototype.connect = function () {
    const falso = new EventEmitter();
    falso.readyState = 1;
    falso.send = (datos, cb) => setImmediate(() => cb?.());
    falso.close = () => ((falso.readyState = 3), falso.emit("close", 1000, Buffer.alloc(0)));
    this.socket = falso;
  };
  try {
    const creds = initAuthCreds();
    creds.me = { id: "59800000001:5@s.whatsapp.net", lid: "200000000000001:5@lid", name: "Claudia" };
    const sock = WS.makeWASocket({ logger: pino({ level: "silent" }), version: [2, 3000, 1], auth: { creds, keys: { get: async () => ({}), set: async () => {} } }, markOnlineOnConnect: false, fireInitQueries: false });
    // What Baileys does once the connection opens (Socket/socket.js, on "success").
    sock.ev.emit("creds.update", { me: { ...sock.authState.creds.me, lid: "200000000000001:5@lid" } });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(sock.authState.creds.me.lid, "200000000000001:5@lid", "Baileys guarda la que mandó el servidor");
    assert.deepEqual([sock.user.lid, sock.user.jid], ["200000000000001@lid", "59800000001@s.whatsapp.net"]);
    sock.end(undefined);
  } finally {
    WebSocketClient.prototype.connect = conectar;
  }
});

// The preview goes to one admin, in private, and any admin could confirm it: one who hadn't seen who would go removed
// them. Only the one it was sent to confirms, under either of their ids.
test(".k inactivos confirmar es del admin que recibió la lista", async () => {
  const chat = "inactivos-49@g.us";
  const participants = [...armarGrupo(chat), { id: "112@lid", admin: "admin" }];
  miembros.set(chat, participants);
  F.initDataDB({ chat, sender: "112@lid", senderJid: "59899000112@s.whatsapp.net", pushName: "Persona112" });
  avisar(chat, "101@lid", "102@lid");
  const kickDe = (sender, text) => Kick.run(m(chat, text, sender), { client: globalThis.client, participants, text, command: "k", usedPrefix: ".", groupMetadata: { participants }, isOwner: false, isWaAdmin: true, isAdmin: true });
  await kickDe("105@lid", "inactivos"); // the list goes to 105
  await kickDe("112@lid", "inactivos confirmar");
  assert.equal(textoEnviado(), "La lista de quiénes saldrían se la mandé a otro admin. Pedí la tuya con .k inactivos (te la mando por privado), y después confirmá.");
  assert.equal(expulsiones.length, 0);
  avisar(chat, "109@lid");
  await kickDe("105@lid", "inactivos"); // a newer one of 105's, with 109
  await kickDe("59899000105@s.whatsapp.net", "inactivos confirmar"); // 105, from a message that brought only the number
  assert.deepEqual(expulsiones.map((e) => e.ids[0]).sort(), ["101@lid", "102@lid", "109@lid"]);
});

// Between the preview and the confirmation, or halfway through, the group went from listing people by number to listing
// them by LID: the confirmation found nobody from the list, or took whoever was still there for gone. And whoever left
// meanwhile came out as "🧹 Saqué a 0 personas", without a word on why.
const admins50 = [{ id: "105@lid", admin: "admin" }, { id: "999@lid", admin: "admin" }];
const porNumero50 = (ns) => ns.map((n) => ({ id: `59899000${n}@s.whatsapp.net`, lid: `${n}@lid`, admin: null })).concat(admins50);
const porLid50 = (ns) => ns.map((n) => ({ id: `${n}@lid`, phoneNumber: `59899000${n}@s.whatsapp.net`, admin: null })).concat(admins50);
function avisadosPorNumero(chat, ns) {
  F.registrarMensajeGrupo(chat, ["105@lid"], Date.now() - 20 * DIA);
  for (const n of ns) F.marcarAvisoInactivo(chat, [`59899000${n}@s.whatsapp.net`, `${n}@lid`], Date.now() - 4 * DIA);
  miembros.set(chat, porNumero50(ns));
  return porNumero50(ns);
}

test(".k inactivos confirmar encuentra a cada uno por cualquiera de sus ids", async () => {
  const casos = [
    // Shown while the group listed them by number, with the LID alongside; listed by the LID alone when confirming.
    { chat: "inactivos-50@g.us", ns: [201, 202], antes: (n) => ({ id: `59899000${n}@s.whatsapp.net`, lid: `${n}@lid` }), despues: (n) => ({ id: `${n}@lid` }) },
    // Shown by the number alone; listed by LID, with the number alongside, when confirming.
    { chat: "inactivos-52@g.us", ns: [211, 212], antes: (n) => ({ id: `59899000${n}@s.whatsapp.net` }), despues: (n) => ({ id: `${n}@lid`, phoneNumber: `59899000${n}@s.whatsapp.net` }) },
  ];
  for (const { chat, ns, antes, despues } of casos) {
    expulsiones = [];
    const lista = (forma) => ns.map((n) => ({ ...forma(n), admin: null })).concat(admins50);
    avisadosPorNumero(chat, ns);
    miembros.set(chat, lista(antes));
    await kick(chat, lista(antes), "inactivos");
    miembros.set(chat, lista(despues));
    CG.invalidar(globalThis.client, chat);
    await kick(chat, lista(despues), "inactivos confirmar");
    assert.deepEqual(expulsiones.map((e) => e.ids[0]), ns.map((n) => `${n}@lid`), chat);
    assert.equal(textoEnviado(), "🧹 Saqué a 2 personas.");
  }
});

test(".k inactivos confirmar dice cuántos ya no estaban, y al que el grupo lista ahora con otro id lo saca con ese", async () => {
  const chat = "inactivos-51@g.us";
  const participants = avisadosPorNumero(chat, [301, 302, 303]);
  await kick(chat, participants, "inactivos");
  alExpulsar = async (id) => {
    if (id !== "59899000301@s.whatsapp.net") return;
    miembros.set(chat, porLid50([301, 302])); // while the first one goes: the group is listed by LID now, and 303 left
    await CG.metadataDe(globalThis.client, chat, { fresca: true });
  };
  await kick(chat, participants, "inactivos confirmar");
  assert.deepEqual(expulsiones.map((e) => e.ids[0]), ["59899000301@s.whatsapp.net", "302@lid"], "con el id con que lo lista el grupo");
  assert.equal(textoEnviado(), "🧹 Saqué a 2 personas. Una ya no estaba en el grupo.");
});

// A notice of the group closing or opening that says nothing new changes nothing: the same one again, or one from
// before the last change on record. An old opening repeated during a later closing ended it as it began, and an old
// closing repeated after the group opened started one that ran until someone looked. One that came late but fits moves
// the change back to when it happened: the copy of the group the bot asked for may have told it first.
test("los avisos de cierre repetidos o fuera de orden no cambian lo que se sabe, y uno atrasado que encaja corrige la hora", () => {
  const chat = "inactivos-53@g.us";
  const H = 60 * 60 * 1000;
  const ahora = Date.now();
  const aviso = (cerrado, horas) => F.anotarCierreGrupo(chat, cerrado, ahora - horas * H);
  const tramos = () => F.cierresGrupo(chat).map((c) => [Math.round((ahora - c.desde) / H), c.hasta === null ? null : Math.round((ahora - c.hasta) / H)]);
  aviso(true, 240);
  aviso(false, 216);
  aviso(true, 120);
  aviso(false, 216); // the old opening, again
  aviso(true, 240); // and the old closing
  assert.deepEqual(tramos(), [[240, 216], [120, null]]);
  aviso(false, 48);
  aviso(true, 120);
  aviso(true, 60); // a closing from while it was closed
  assert.deepEqual(tramos(), [[240, 216], [120, 48]]);
  aviso(true, 24); // what the copy said when the bot asked
  aviso(true, 36); // the notice, late
  aviso(false, 6);
  aviso(false, 12);
  aviso(false, 40); // an opening from before this closing
  assert.deepEqual(tramos(), [[240, 216], [120, 48], [36, 12]]);
});

// The bot coming into a closed group, or back to one, never got the notice of its closing: it found out when it opened,
// and every day before then looked like silence. main.js asks for the group's copy right after starting the count over,
// and every copy says whether it's closed, as of when it was asked for; on reconnecting it gets all of them at once.
test("si el bot vuelve a un grupo cerrado, el cierre cuenta desde que volvió", async () => {
  const chat = "inactivos-54@g.us";
  const ahora = Date.now();
  const participants = [{ id: "101@lid", admin: null }, { id: "102@lid", admin: null }, { id: "105@lid", admin: "admin" }, { id: "999@lid", admin: "admin" }];
  miembros.set(chat, participants);
  F.registrarMensajeGrupo(chat, ["105@lid"], ahora - 40 * DIA);
  F.registrarMensajeGrupo(chat, ["101@lid", "102@lid"], ahora - 25 * DIA);
  cerrados.add(chat);
  // Removed and added back 18 days ago, with the group closed (main.js, group-participants.update).
  I.reiniciarSiEsElBot(globalThis.client, chat, [{ id: "999@lid", admin: null }]);
  await CG.metadataDe(globalThis.client, chat, { fresca: true, ahora: ahora - 18 * DIA });
  F.registrarIngresoGrupo(chat, ["999@lid"], ahora - 18 * DIA);
  // It opened a minute ago.
  cerrados.delete(chat);
  F.anotarCierreGrupo(chat, false, ahora - 60 * 1000);
  CG.invalidar(globalThis.client, chat);
  await Inactivos.run(m(chat, ""), { client: globalThis.client, participants, text: "" });
  assert.match(textoEnviado(), /^Todavía no sé quién no escribe hace 15 días: empecé a anotar quién escribe en este grupo hace 18 días, y el tiempo que estuvo cerrado no cuenta\./);

  const otro = "inactivos-57@g.us";
  CG.guardarVarios(globalThis.client, { [otro]: { id: otro, subject: "Otro", announce: true, participants } }, ahora - 2 * DIA);
  assert.deepEqual(F.cierresGrupo(otro).map((c) => [Math.round((ahora - c.desde) / DIA), c.hasta]), [[2, null]], "al reconectar, de todos los grupos");
});

test("consistencia: cuando el bot entra a un grupo, main.js pide la copia del grupo después de empezar la cuenta de nuevo", () => {
  const main = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
  const evento = main.slice(main.indexOf('"group-participants.update"'));
  const [reinicia, pide] = [evento.indexOf("reiniciarSiEsElBot("), evento.indexOf("metadataDe(client, id, { fresca: true })")];
  assert.ok(reinicia > 0 && pide > reinicia, "la copia pedida antes quedaba borrada con la cuenta");
});

// The copy of the group may be a few minutes older than the group's notice: closed after the copy was taken, .inactivos
// tagged people who couldn't answer, and ended the closing right there, as of the moment it looked.
test("un grupo que se cerró después de la copia que tiene el bot cuenta como cerrado", async () => {
  const chat = "inactivos-55@g.us";
  const participants = armarGrupo(chat);
  await CG.metadataDe(globalThis.client, chat, { fresca: true }); // the copy: open
  F.anotarCierreGrupo(chat, true, Date.now()); // the notice, right after: closed
  await Inactivos.run(m(chat, ""), { client: globalThis.client, participants, text: "" });
  assert.match(textoEnviado(), /^Este grupo está cerrado/);
  await kick(chat, participants, "inactivos");
  assert.match(textoEnviado(), /^El grupo está cerrado/);
  assert.deepEqual(F.cierresGrupo(chat).map((c) => c.hasta), [null], "y sigue cerrado");
});

// How long the group was open, against a plain count over whole hours: each hour open or closed, the stretches drawn at
// random, some overlapping and one possibly going on. Overlapping ones used to count twice.
test("abiertoHasta dice lo mismo que contar a mano, aunque los tramos se superpongan", () => {
  let semilla = 4242;
  const azar = (n) => Math.floor(((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648) * n);
  for (let vuelta = 0; vuelta < 300; vuelta++) {
    const ahora = 100;
    const cierres = Array.from({ length: azar(6) }, () => {
      const desde = azar(110);
      return { desde, hasta: azar(5) === 0 ? null : desde + azar(30) };
    });
    const abiertoDesde = I.abiertoHasta(cierres, ahora);
    for (let desde = 0; desde <= ahora; desde += 1 + azar(7)) {
      let aMano = 0;
      for (let t = desde; t < ahora; t++) if (!cierres.some((c) => c.desde <= t && t + 1 <= (c.hasta ?? ahora))) aMano++;
      assert.equal(abiertoDesde(desde), aMano, JSON.stringify({ cierres, desde }));
    }
  }
});

// Whoever changed numbers: their messages bring the LID and the new number, and the database still had the old one. In
// a group listed by number without the LID they looked silent, and could be tagged and removed. Each message is stamped
// on both ids, a late one too (it reaches .inactivos before the bot notes anything), and the new number goes on their
// row.
test("quien cambió de número no queda como callado en un grupo que lo lista por el nuevo", () => {
  const chat = "inactivos-56@g.us";
  const [L, VIEJO, NUEVO] = ["300000000000441@lid", "59899000441@s.whatsapp.net", "59899000442@s.whatsapp.net"];
  F.initDataDB({ chat, sender: L, senderJid: VIEJO, pushName: "Carla" });
  F.syncUserInfo({ chat, sender: L, senderJid: VIEJO, pushName: "Carla" });
  F.registrarMensajeGrupo(chat, ["105@lid"], Date.now() - 40 * DIA);
  const participants = [{ id: NUEVO, admin: null }, { id: "105@lid", admin: "admin" }, { id: "999@lid", admin: "admin" }];
  // As handle-message hands over a late one, ahead of syncUserInfo.
  I.anotarPresencia({ chat, isGroup: true, sender: L, senderJid: NUEVO, message: { conversation: "hola" }, mtype: "conversation", messageTimestamp: Math.floor(Date.now() / 1000) - 90 }, { antesDelNumero: true });
  assert.deepEqual(I.inactivosDe(chat, participants, globalThis.client), [], "con el mensaje atrasado");
  F.syncUserInfo({ chat, sender: L, senderJid: NUEVO, pushName: "Carla" });
  assert.deepEqual([F.jidDeLid(L), F.lidDeNumero(NUEVO), F.lidDeNumero(VIEJO)], [NUEVO, L, null]);
});

// The prize for coming back goes once in PREMIO_CADA_DIAS under any of the person's ids: a return that came with the
// LID and the next one with only the number were paid twice, to two balances. To whoever wrote as the message names
// them, which is where .saldo reads it.
test("el premio por volver va una vez cada 30 días aunque un regreso llegue con la LID y el otro con el número", async () => {
  const chat = "inactivos-58@g.us";
  const [L, N] = ["300000000000558@lid", "59899000558@s.whatsapp.net"];
  F.initDataDB({ chat, sender: L, senderJid: N, pushName: "Carla" });
  F.registrarMensajeGrupo(chat, ["105@lid"], Date.now() - 60 * DIA);
  F.marcarAvisoInactivo(chat, [L, N], Date.now() - DIA);
  await I.registrarPresencia(globalThis.client, { chat, sender: L, senderJid: N });
  db.prepare("UPDATE presencia_grupo SET ultimo_mensaje = ? WHERE chat = ?").run(Date.now() - 17 * DIA, chat); // silent since
  db.prepare("UPDATE urucoins_log SET fecha = ? WHERE chat = ?").run(Date.now() - 16 * DIA, chat); // paid 16 days ago
  F.marcarAvisoInactivo(chat, [L, N], Date.now() - DIA);
  await I.registrarPresencia(globalThis.client, { chat, sender: N, senderJid: N }); // back again, with only the number
  assert.deepEqual([F.getSaldoCoins(chat, L), F.getSaldoCoins(chat, N)], [10, 0]);
  // In a group whose messages come with only the number, the person's coins are under it, and .saldo reads it: paid to
  // the LID, the prize never showed up there. And with a recycled number the bot hadn't seen with its new LID yet, it
  // went to whoever had it before.
  const [L2, N2] = ["300000000000559@lid", "59899000559@s.whatsapp.net"];
  F.initDataDB({ chat, sender: L2, senderJid: N2, pushName: "Dani" });
  F.marcarAvisoInactivo(chat, [L2, N2], Date.now() - DIA);
  await I.registrarPresencia(globalThis.client, { chat, sender: N2, senderJid: N2 });
  assert.deepEqual([F.getSaldoCoins(chat, L2), F.getSaldoCoins(chat, N2)], [0, 10]);
});

// A whole copy of the group that comes through groups.update: Baileys emits one from groupFetchAllParticipating
// (Socket/groups.js), and its event buffer may hold it back for up to 30 s (Utils/event-buffer.js). It isn't known when
// it was asked for: noted as of when it arrived, a copy from before a closing the bot had noted ended that closing, and
// the days it stayed closed counted as silence.
test("una copia del grupo que llega por groups.update no termina un cierre", () => {
  const chat = "inactivos-59@g.us";
  const ahora = Date.now();
  const participants = [{ id: "101@lid", admin: null }, { id: "999@lid", admin: "admin" }];
  F.anotarCierreGrupo(chat, true, ahora - 20_000); // the closing's notice
  CG.vaciar(); // the cache empty, as after reconnecting
  assert.ok(CG.aplicarCambioDeGrupo(globalThis.client, { id: chat, subject: "Grupo", announce: false, participants }), "la copia se guarda");
  assert.deepEqual(F.cierresGrupo(chat).map((c) => c.hasta), [null], "y el grupo sigue cerrado");
  CG.invalidar(globalThis.client, chat);
});

// A closing nothing else told the bot of (its notice lost while it was off, and found on reconnecting through the copy
// Baileys' refresh brings) wasn't noted from that copy, and the days it stayed closed counted as silence. It's noted as
// of as long before the copy came as it may have been asked for: then a copy from before an opening the bot had noted
// can't start a closing either.
test("una copia cerrada que llega por groups.update anota el cierre, desde lo antes que pudo pedirse", () => {
  assert.ok(CG.CACHE_GRUPOS.RETENIDA_MAX_MS >= 60_000 + 30_000, "lo que Baileys da a una consulta, más lo que retiene los eventos");
  const participants = [{ id: "101@lid", admin: null }, { id: "999@lid", admin: "admin" }];
  const [chat, otro] = ["inactivos-60@g.us", "inactivos-61@g.us"];
  const antes = Date.now();
  CG.vaciar();
  assert.ok(CG.aplicarCambioDeGrupo(globalThis.client, { id: chat, subject: "Grupo", announce: true, participants }));
  const [cierre] = F.cierresGrupo(chat);
  assert.equal(cierre?.hasta, null, "queda cerrado");
  assert.ok(Math.abs(cierre.desde - (antes - CG.CACHE_GRUPOS.RETENIDA_MAX_MS)) < 5000, `desde hace ${Math.round((antes - cierre.desde) / 1000)} s`);
  F.anotarCierreGrupo(otro, true, antes - 3_600_000);
  F.anotarCierreGrupo(otro, false, antes - 20_000); // the opening's notice
  assert.ok(CG.aplicarCambioDeGrupo(globalThis.client, { id: otro, subject: "Grupo", announce: true, participants }));
  assert.deepEqual(F.cierresGrupo(otro).map((c) => c.hasta === null), [false], "una copia de antes de que abriera no lo cierra de nuevo");
  CG.vaciar();
});

// A recycled number, in a group that lists people by number and doesn't bring NUEVO's LID: the database's LID for the
// number is VIEJO's, an admin listed first. Looked for by any id they came under, the confirmation found VIEJO, left
// them alone for being an admin, and NUEVO "se salvó a último momento".
test(".k inactivos confirmar saca a quien avisó en el grupo, no al primero que comparte una id con él", async () => {
  const chat = "inactivos-reciclado@g.us";
  const { X, VIEJO } = numeroReciclado(60);
  const ahora = Date.now();
  F.initDataDB({ chat, sender: "105@lid", senderJid: "59899000105@s.whatsapp.net", pushName: "Persona105" });
  F.registrarMensajeGrupo(chat, ["105@lid"], ahora - 20 * DIA);
  const participants = [{ id: unNumero(61), lid: VIEJO, admin: "admin" }, { id: X, admin: null }, { id: "105@lid", admin: "admin" }, { id: "999@lid", admin: "admin" }];
  miembros.set(chat, participants);
  await I.avisarInactivos(globalThis.client, m(chat, ""), participants, { ahora: ahora - 4 * DIA });
  await kick(chat, participants, "inactivos");
  await kick(chat, participants, "inactivos confirmar");
  assert.deepEqual(expulsiones.map((e) => e.ids[0]), [X]);
});

// A recycled number the bot never saw change hands: VIEJO was warned under the number and their LID, and neither of
// them wrote since, so nothing moved the warning to VIEJO (seguirALaPersona). The group lists the number with NUEVO's
// LID now. Read by any id, NUEVO was warned already: .inactivos didn't tag them, and .k inactivos could remove them.
test("el aviso de quien tuvo un número no cuenta para quien lo tiene ahora, aunque el bot no haya visto el cambio", async () => {
  const chat = "inactivos-aviso-ajeno@g.us";
  const { X, VIEJO, NUEVO, porLid } = numeroReciclado(70);
  F.registrarMensajeGrupo(chat, ["105@lid"], Date.now() - 20 * DIA); // the bot keeps track of the group since then
  F.marcarAvisoInactivo(chat, [VIEJO, X], Date.now() - 4 * DIA); // while the number was VIEJO's
  const participants = [...porLid, { id: "105@lid", admin: "admin" }, { id: "999@lid", admin: "admin" }];
  miembros.set(chat, participants);
  assert.deepEqual(I.paraSacar(chat, participants, globalThis.client).listos, [], "NUEVO no está avisado");
  const { mentions } = await I.avisarInactivos(globalThis.client, m(chat, ""), participants);
  assert.deepEqual(mentions, [NUEVO], "y .inactivos lo etiqueta");
});

// A warning under a number is the warning of the LID it went out with (aviso_de, avisoSuyo). VIEJO was warned under the
// number and their LID and never wrote, so no row had the number and nothing moved the warning when NUEVO came with it
// (seguirALaPersona): NUEVO's first message was a "Volvió", with the prize, for VIEJO's warning. One that went under
// the number alone, when the bot knew no LID for it, is the warning of whoever has the number: they're still warned
// once the group lists their LID, and paid when they come back. One from before aviso_de counts under a number only
// for whoever the bot knows by nothing else.
test("un aviso bajo un número es de la LID con la que salió: no paga el «Volvió» de otro, y sí el de quien solo tenía el número", async () => {
  const chat = "inactivos-aviso-de@g.us";
  const escribe = async (sender, senderJid) => {
    const msj = { chat, sender, senderJid, pushName: "x", isGroup: true };
    F.initDataDB(msj);
    F.syncUserInfo(msj);
    globalThis.enviados = [];
    await I.registrarPresencia(globalThis.client, msj); // after syncUserInfo, as handle-message runs them
    return [globalThis.enviados.map((e) => e.msg?.text).join(""), F.getSaldoCoins(chat, sender)];
  };
  const listos = (lid, numero) => I.paraSacar(chat, [{ id: lid, phoneNumber: numero, admin: null }], globalThis.client).listos.length;
  F.registrarMensajeGrupo(chat, ["105@lid"], Date.now() - 20 * DIA); // the bot keeps track of the group since then

  const [X, VIEJO, NUEVO] = [unNumero(71), unaLid(71, 1), unaLid(71, 2)];
  F.marcarAvisoInactivo(chat, [VIEJO, X], Date.now() - 4 * DIA);
  assert.deepEqual(await escribe(NUEVO, X), ["", 0], "ningún «Volvió» para NUEVO");
  assert.equal(F.presenciaDelGrupo(chat).find((r) => r.usuario === X)?.avisado ?? null, null, "y el aviso bajo el número se levanta igual");
  const [volvio, saldo] = await escribe(VIEJO, "");
  assert.ok(volvio.includes(`Volvió @${VIEJO.split("@")[0]}`), volvio);
  assert.equal(saldo, 10, "VIEJO sí vuelve de su aviso");

  const [Y, SOLO] = [unNumero(73), unaLid(73)];
  F.marcarAvisoInactivo(chat, [Y], Date.now() - 4 * DIA); // listed by the number alone, and no row had it
  assert.equal(listos(SOLO, Y), 1, "con la LID en la lista, sigue avisado");
  const [volvioSolo, saldoSolo] = await escribe(SOLO, Y);
  assert.match(volvioSolo, /Volvió/);
  assert.equal(saldoSolo, 10);

  const [Z, ANTES] = [unNumero(74), unaLid(74)];
  db.prepare("INSERT INTO presencia_grupo (chat, usuario, avisado) VALUES (?, ?, ?)").run(chat, Z, Date.now() - 4 * DIA);
  assert.equal(listos(ANTES, Z), 0, "uno de antes de aviso_de no le cuenta a quien trae su LID");
  assert.deepEqual(await escribe(ANTES, Z), ["", 0]);
});

// A warning under a number isn't passed on with it (atarAlLid): one that went out with a LID is that LID's, and one
// that went under the number alone was given when no LID was known, with no telling whose. The group listed C with the
// number when it was given, while the database had A on it: B writing with the number took the warning under it to A,
// and A was warned with C's warning, untagged, and removable.
test("atarAlLid no le pasa a quien tenía el número los avisos que había bajo él", () => {
  const [chat, otro] = ["inactivos-atar-aviso@g.us", "inactivos-atar-aviso-2@g.us"];
  const [N, A, B, C] = [unNumero(75), unaLid(75, 1), unaLid(75, 2), unaLid(75, 3)];
  for (const g of [chat, otro]) F.registrarMensajeGrupo(g, ["105@lid"], Date.now() - 20 * DIA);
  F.marcarAvisoInactivo(otro, [N], Date.now() - 4 * DIA); // there, the bot knew no LID for the number
  F.initDataDB({ chat, sender: A, senderJid: N, pushName: "A" });
  F.syncUserInfo({ chat, sender: A, senderJid: N, pushName: "A" });
  F.marcarAvisoInactivo(chat, [C, N], Date.now() - 4 * DIA);
  F.initDataDB({ chat, sender: B, senderJid: N, pushName: "B" });
  F.syncUserInfo({ chat, sender: B, senderJid: N, pushName: "B" }); // N is B's now, and what was under it goes to A
  const avisados = (g, lid) => I.paraSacar(g, [{ id: lid, admin: null }], globalThis.client).listos.length;
  assert.equal(avisados(chat, A), 0, "A no queda avisado con el aviso de C");
  assert.equal(avisados(chat, C), 1, "C sigue con el suyo");
  assert.equal(avisados(otro, A), 0, "ni el que fue solo al número");
});

// When a number changes hands, nothing .inactivos noted under it goes to whoever had it (atarAlLid). The next owner's
// join, and a warning of theirs from before aviso_de, did: the one who had the number came off .inactivos for weeks,
// and could be removed without having been tagged.
test("cuando un número cambia de dueño, lo anotado bajo él no le pasa al que lo tenía", () => {
  const chat = "inactivos-numero-pasado@g.us";
  const [A, B, X, Y] = [unaLid(76, 1), unaLid(76, 2), unNumero(76), unNumero(77)];
  const ahora = Date.now();
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(A, X, "A", 1); // wrote with X long ago
  F.registrarMensajeGrupo(chat, ["105@lid"], ahora - 40 * DIA);
  F.registrarMensajeGrupo(chat, [A], ahora - 20 * DIA); // A last wrote 20 days ago
  F.registrarIngresoGrupo(chat, [B, X], ahora - 10 * DIA); // B came in, with X
  const aviso = db.prepare("UPDATE presencia_grupo SET avisado = ? WHERE chat = ? AND usuario = ?");
  for (const id of [B, X]) aviso.run(ahora - 4 * DIA, chat, id); // B's warning, from before aviso_de
  const participants = [{ id: A, phoneNumber: Y, admin: null }, { id: B, phoneNumber: X, admin: null }, { id: "105@lid", admin: "admin" }, { id: "999@lid", admin: "admin" }];
  const msj = { chat, sender: B, senderJid: X, pushName: "B", isGroup: true };
  F.initDataDB(msj);
  F.syncUserInfo(msj); // X is B's now: what was under it goes
  const de = (lista) => lista.map((e) => e.participante.id);
  assert.ok(!de(I.paraSacar(chat, participants, globalThis.client).listos).includes(A), "A no queda avisado con el aviso de B");
  assert.ok(de(I.inactivosDe(chat, participants, globalThis.client)).includes(A), "y la entrada de B no lo saca de .inactivos");
});

// In a group listed by number alone, the warning goes under the number the group gives, and not under the LID the
// database has for it: that may be whoever had the number before, who got the "Volvió" and the prize for it when they
// wrote. Whoever has the number now is spared when they write, and the warning under the number goes then, with the
// rest of what's under it (atarAlLid): with no telling whose it was, they come back without the "Volvió" nor the prize.
test("en un grupo que lista por número solo, el aviso no va a la LID que la base supone para el número", async () => {
  const chat = "inactivos-aviso-pn@g.us";
  const [VIEJO, NUEVO, X, Y] = [unaLid(78, 1), unaLid(78, 2), unNumero(78), unNumero(79)];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(VIEJO, X, "Viejo", 1);
  F.registrarMensajeGrupo(chat, ["105@lid"], Date.now() - 40 * DIA);
  const participants = [{ id: X, admin: null }, { id: "105@lid", admin: "admin" }, { id: "999@lid", admin: "admin" }];
  miembros.set(chat, participants);
  const { mentions } = await I.avisarInactivos(globalThis.client, m(chat, ""), participants);
  assert.deepEqual(mentions, [X]);
  assert.equal(F.presenciaDelGrupo(chat).find((r) => r.usuario === VIEJO)?.avisado ?? null, null, "VIEJO no queda avisado");
  const escribe = async (sender, senderJid) => {
    const msj = { chat, sender, senderJid, pushName: "x", isGroup: true };
    F.initDataDB(msj);
    F.syncUserInfo(msj);
    globalThis.enviados = [];
    await I.registrarPresencia(globalThis.client, msj);
    return [textoEnviado(), F.getSaldoCoins(chat, sender)];
  };
  assert.deepEqual(await escribe(NUEVO, X), ["", 0], "NUEVO vuelve sin el «Volvió»: el aviso bajo el número se fue sin pasárselo a nadie");
  assert.equal(I.paraSacar(chat, participants, globalThis.client).listos.length, 0, "NUEVO se salvó");
  assert.deepEqual(await escribe(VIEJO, Y), ["", 0], "VIEJO no cobra un aviso que no era suyo");
});

// Someone coming in is noted under the ids the event brings: with their number alone, not under the LID the database
// has for it, which may be whoever had the number before, who then looked like they had just come in.
test("al entrar alguien con su número solo, la entrada no se anota en la LID que la base supone", () => {
  const chat = "inactivos-entrada-pn@g.us";
  const [VIEJO, X] = [unaLid(82), unNumero(82)];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(VIEJO, X, "Viejo", 1);
  I.anotarIngresos(chat, [{ id: X, admin: null }, { id: unaLid(83), phoneNumber: unNumero(83), admin: null }]);
  assert.deepEqual(F.presenciaDelGrupo(chat).map((r) => r.usuario).sort(), [X, unaLid(83), unNumero(83)].sort());
});

// A message that brings the LID and the number lifts the warning of those two, and not of the LID the database still
// has for the number: before syncUserInfo notes it (a late message, handle-message's early cuts), that's whoever had
// it, and a late message from whoever has it now took them off .k inactivos.
test("un mensaje atrasado de quien tiene ahora un número no le levanta el aviso a quien lo tuvo", () => {
  const chat = "inactivos-atrasado-ajeno@g.us";
  const [VIEJO, NUEVO, X, Y] = [unaLid(80, 1), unaLid(80, 2), unNumero(80), unNumero(81)];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(VIEJO, X, "Viejo", 1);
  F.registrarMensajeGrupo(chat, ["105@lid"], Date.now() - 40 * DIA);
  F.registrarMensajeGrupo(chat, [VIEJO], Date.now() - 30 * DIA);
  F.marcarAvisoInactivo(chat, [VIEJO, Y], Date.now() - 4 * DIA);
  const participants = [{ id: VIEJO, phoneNumber: Y, admin: null }, { id: NUEVO, phoneNumber: X, admin: null }, { id: "105@lid", admin: "admin" }, { id: "999@lid", admin: "admin" }];
  const listos = () => I.paraSacar(chat, participants, globalThis.client).listos.map((e) => e.participante.id);
  assert.deepEqual(listos(), [VIEJO]);
  I.anotarPresencia({ chat, isGroup: true, sender: NUEVO, senderJid: X, message: { conversation: "hola" }, mtype: "conversation", messageTimestamp: Math.floor(Date.now() / 1000) - 90 }, { antesDelNumero: true });
  assert.deepEqual(listos(), [VIEJO], "VIEJO sigue avisado");
});

// Whoever changes their own number takes along what .inactivos noted under the old one (atarAlLid, suyo): in a group
// that lists people by number alone, whose messages bring no LID, their last message, their join and their warning are
// only there. Dropped, whoever had written three days before was tagged as never seen, whoever had just come in too,
// and both came back from a warning without the "Volvió". The last message and the join stay under the old number as
// well, and its warning doesn't; nor is a warning that went out with someone else's LID taken along.
test("quien cambia su propio número se lleva lo que .inactivos anotó bajo el viejo", async () => {
  const [A, X1, X2, OTRA] = [unaLid(84), unNumero(84), unNumero(85), unaLid(86)];
  const [escribio, entro, avisado] = ["inactivos-propio-1@g.us", "inactivos-propio-2@g.us", "inactivos-propio-3@g.us"];
  const ahora = Date.now();
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(A, X1, "A", 1);
  for (const g of [escribio, entro, avisado]) F.registrarMensajeGrupo(g, ["105@lid"], ahora - 40 * DIA);
  F.registrarMensajeGrupo(escribio, [X1], ahora - 3 * DIA); // A wrote there, with the number alone
  F.registrarIngresoGrupo(entro, [X1], ahora - 5 * DIA); // and came in there
  F.marcarAvisoInactivo(entro, [OTRA, X1], ahora - 2 * DIA); // someone else's warning, that went out with their LID
  F.marcarAvisoInactivo(avisado, [X1], ahora - DIA); // and was warned there, tagged by the number
  // A writes somewhere else with the LID and the new number.
  const msj = { chat: "inactivos-propio-otro@g.us", sender: A, senderJid: X2, pushName: "A", isGroup: true };
  F.initDataDB(msj);
  F.syncUserInfo(msj);
  // Every group lists A by the new number alone.
  const porNumero = (chat) => {
    const participants = [{ id: X2, admin: null }, { id: "105@lid", admin: "admin" }, { id: "999@lid", admin: "admin" }];
    miembros.set(chat, participants);
    return participants;
  };
  const { listos, enPlazo } = I.paraSacar(entro, porNumero(entro), globalThis.client);
  const visto = {
    escribio: I.inactivosDe(escribio, porNumero(escribio), globalThis.client).length,
    entro: I.inactivosDe(entro, porNumero(entro), globalThis.client).length,
    avisoAjeno: listos.length + enPlazo.length,
    bajoElViejo: F.presenciaDelGrupo(escribio).find((r) => r.usuario === X1)?.ultimo_mensaje ?? null,
    avisosBajoElViejo: [entro, avisado].map((g) => F.presenciaDelGrupo(g).find((r) => r.usuario === X1)?.avisado ?? null),
  };
  // A writes in the group where they were warned, with the new number alone.
  const vuelve = { chat: avisado, sender: X2, senderJid: X2, pushName: "A", isGroup: true };
  F.initDataDB(vuelve);
  F.syncUserInfo(vuelve);
  globalThis.enviados = [];
  await I.registrarPresencia(globalThis.client, vuelve, porNumero(avisado));
  visto.volvio = /^🎉 Volvió/.test(textoEnviado());
  assert.deepEqual(visto, { escribio: 0, entro: 0, avisoAjeno: 0, bajoElViejo: ahora - 3 * DIA, avisosBajoElViejo: [null, null], volvio: true });
});

// A warning from before someone last came in doesn't stand, under any of their ids: coming back is a fresh start, and
// the join goes under the ids the event brings, which with the number alone leave out the LID the database has for it
// (anotarIngresos). Read under that LID, a warning of whoever had the number before, or the person's own from before
// they left, made whoever had just come in removable at once with .k inactivos, and paid them a "Volvió" when they
// wrote.
test("un aviso de antes de la última entrada no cuenta, ni para .k inactivos ni para el «Volvió»", async () => {
  const ahora = Date.now();
  const admins = [{ id: "105@lid", admin: "admin" }, { id: "999@lid", admin: "admin" }];
  // VIEJO was warned, under his LID too, and left; X is NUEVO's now, who comes in with it alone.
  const chat = "inactivos-entra-con-un-aviso@g.us";
  const [VIEJO, X] = [unaLid(87), unNumero(87)];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(VIEJO, X, "Viejo", 1);
  F.registrarMensajeGrupo(chat, ["105@lid"], ahora - 60 * DIA);
  F.registrarMensajeGrupo(chat, [VIEJO], ahora - 30 * DIA);
  F.marcarAvisoInactivo(chat, [X, VIEJO], ahora - 10 * DIA);
  I.anotarIngresos(chat, [{ id: X, admin: null }]);
  const participants = [{ id: X, admin: null }, ...admins];
  miembros.set(chat, participants);
  const visto = { nuevoParaSacar: I.paraSacar(chat, participants, globalThis.client).listos.length };
  const msj = { chat, sender: X, senderJid: X, pushName: "Nuevo", isGroup: true };
  F.initDataDB(msj);
  F.syncUserInfo(msj);
  globalThis.enviados = [];
  await I.registrarPresencia(globalThis.client, msj, participants);
  visto.volvio = textoEnviado();
  // The person's own, warned while the group listed them with their LID: they left, and come back with the number
  // alone.
  const otro = "inactivos-vuelve-con-su-aviso@g.us";
  const [A, Z] = [unaLid(88), unNumero(88)];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(A, Z, "A", 1);
  F.registrarMensajeGrupo(otro, ["105@lid"], ahora - 60 * DIA);
  F.marcarAvisoInactivo(otro, [Z, A], ahora - 10 * DIA);
  I.anotarIngresos(otro, [{ id: Z, admin: null }]);
  visto.vuelveParaSacar = I.paraSacar(otro, [{ id: Z, lid: A, admin: null }, ...admins], globalThis.client).listos.length;
  assert.deepEqual(visto, { nuevoParaSacar: 0, volvio: "", vuelveParaSacar: 0 });
});

// The LID the database has for a number isn't the person's when the group lists that LID with another number: it's
// whoever had the number before, who changed numbers and is still in the group. Taken for theirs, whoever has the
// number now looked warned with their warning, and writing with the number alone was paid the "Volvió" and took it
// away.
test("la LID que la base supone para un número no es suya si el grupo la lista con otro número", async () => {
  const chat = "inactivos-lid-desmentida@g.us";
  const ahora = Date.now();
  const [VIEJO, X, Y] = [unaLid(89), unNumero(89), unNumero(90)];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(VIEJO, X, "Viejo", 1);
  F.registrarMensajeGrupo(chat, ["105@lid"], ahora - 40 * DIA);
  F.registrarIngresoGrupo(chat, [X], ahora - 20 * DIA); // whoever has X came in, with it alone
  const participants = [{ id: Y, lid: VIEJO, admin: null }, { id: X, admin: null }, { id: "105@lid", admin: "admin" }, { id: "999@lid", admin: "admin" }];
  miembros.set(chat, participants);
  F.marcarAvisoInactivo(chat, [Y, VIEJO], ahora - 4 * DIA); // VIEJO warned, as the group lists him
  const listos = () => I.paraSacar(chat, participants, globalThis.client).listos.map((e) => e.participante.id);
  const visto = { antes: listos() };
  // A late message of theirs, with the copy of the group at hand, as handle-message's early cuts have it.
  CG.guardar(globalThis.client, chat, { id: chat, subject: "Los Pibes", participants });
  I.anotarPresencia({ chat, isGroup: true, sender: X, senderJid: X, message: { conversation: "hola" }, mtype: "conversation", messageTimestamp: Math.floor(ahora / 1000) - 90 }, { antesDelNumero: true });
  visto.atrasado = listos();
  // Whoever has X writes with it alone, through the hook, which handle-message hands the group: without the copy, so
  // it's the group the hook passes on that counts.
  CG.invalidar(globalThis.client, chat);
  const msj = { chat, sender: X, senderJid: X, pushName: "Nuevo", isGroup: true, message: { conversation: "hola" }, mtype: "conversation" };
  F.initDataDB(msj);
  F.syncUserInfo(msj);
  globalThis.enviados = [];
  await (await import("../plugins/_messsage-count.js")).default.before(msj, { client: globalThis.client, user: {}, participants });
  visto.volvio = textoEnviado();
  visto.despues = listos();
  assert.deepEqual(visto, { antes: [Y], atrasado: [Y], volvio: "", despues: [Y] });
});
