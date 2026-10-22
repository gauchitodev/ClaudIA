import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { prepararBase, ultimoEnviado } from "./helpers.mjs";
import strings from "../lib/strings.js";

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

// Before the bot kept track of a group, nobody can be told apart from someone silent. It used to go by the first time it
// had seen each one write: right after the update, whoever sent only stickers, audios or one-word messages (counted, but
// not when) came out "hace 120 días", tagged, and three days later removable.
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

  // Since 16 days ago: who sent a sticker 5 days ago stays, and who sent nothing counts from then, not from 4 months back.
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

// With ".inactivos 1" a moderator could warn the same people every other day, and coming back paid each time.
test("el premio por volver va una vez cada 30 días, y .inactivos pide 7 días como mínimo", async () => {
  const chat = "inactivos-32@g.us";
  const participants = armarGrupo(chat);
  for (let vez = 0; vez < 2; vez++) {
    avisar(chat, "101@lid");
    await I.registrarPresencia(globalThis.client, { chat, sender: "101@lid" });
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
  const participants = [{ id: "4444@lid", admin: null }, { id: "555@lid", admin: null }, { id: "666@lid", admin: null }];
  miembros.set(chat, participants);
  const mapa = { "59899777777@s.whatsapp.net": "4444@lid", "59899000555@s.whatsapp.net": "555@lid" };
  const ownersReales = globalThis.owners;
  globalThis.owners = [...ownersReales, "59899777777"];
  globalThis.client.signalRepository = { lidMapping: { getLIDForPN: async (pn) => mapa[pn] || null, getPNForLID: async () => null } };
  try {
    await Inactivos.run(m(chat, ""), { client: globalThis.client, participants, text: "" });
  } finally {
    delete globalThis.client.signalRepository;
    globalThis.owners = ownersReales;
  }
  assert.deepEqual(ultimoEnviado().msg.mentions, ["666@lid"]);
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

test("una segunda confirmación mientras saca no saca de nuevo", async () => {
  const chat = "inactivos-38@g.us";
  const participants = armarGrupo(chat);
  avisar(chat, "101@lid", "102@lid");
  await kick(chat, participants, "inactivos");
  let segunda = null;
  alExpulsar = async (id) => {
    if (id !== "101@lid") return;
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
  const esperarReal = I._dep.esperar;
  I._dep.esperar = async (ms) => esperas.push(ms);
  try {
    await kick(chat, participants, "inactivos confirmar");
  } finally {
    I._dep.esperar = esperarReal;
  }
  assert.equal(expulsiones.length, 3);
  assert.deepEqual(esperas, [I.INACTIVOS.PAUSA_MS, I.INACTIVOS.PAUSA_MS]);
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
