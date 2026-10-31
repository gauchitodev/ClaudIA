import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado, esperar } from "./helpers.mjs";
import strings from "../lib/strings.js";

let F, Kick, Silenciar, Ban, Llamar;
let expulsiones = [];
let statusExpulsion = "200";

before(async () => {
  ({ F } = await prepararBase("moderacion"));
  globalThis.txt = strings;
  globalThis.client.user.lid = "999@lid";
  Kick = (await import("../plugins/grupo-kick.js")).default;
  Silenciar = (await import("../plugins/grupo-silenciar.js")).default;
  Ban = (await import("../plugins/owner-banuser.js")).default;
  Llamar = (await import("../plugins/grupo-llamar.js")).default;
  for (const n of [111, 222]) F.initDataDB({ chat: G, sender: `${n}@lid`, senderJid: `5989911${n}@s.whatsapp.net` });
  F.initDataDB({ chat: G, sender: "333@lid", senderJid: "" }); // someone whose number isn't known
});

// Put back before each test: some swap it for their own, and in another order .kick got one that always says yes.
beforeEach(() => {
  expulsiones = [];
  statusExpulsion = "200";
  globalThis.enviados = [];
  globalThis.client.groupParticipantsUpdate = async (chat, ids, accion) => {
    expulsiones.push({ chat, ids, accion });
    return ids.map((jid) => ({ status: statusExpulsion, jid }));
  };
});

// The group lists by LID; 111's number is known, 222's isn't.
const participants = [
  { id: "111@lid", admin: null, phoneNumber: "5989911111@s.whatsapp.net" },
  { id: "222@lid", admin: null },
  { id: "999@lid", admin: "admin" },
];
const groupMetadata = { owner: "100@lid", participants };

const m = (text, { mentionedJid = [], quoted = null } = {}) => ({
  chat: G,
  sender: "100@lid",
  text,
  mentionedJid,
  quoted,
  isGroup: true,
  react: async () => {},
  delete: async () => {},
});
const ultimo = () => ultimoEnviado()?.msg?.text || "";
// Like the dispatcher, it says who runs the command: here, 100, the group's creator. The rank matters since
// moderation only goes from strictly above (lib/roles.js).
const correr = (P, text, command, opciones = {}) =>
  P.run(m(text, opciones), { client: globalThis.client, text, command, usedPrefix: ".", participants, groupMetadata, isOwner: false, isWaAdmin: true, ...opciones.rango });

test(".kick expulsa con el id del grupo y avisa si WhatsApp no deja", async () => {
  await correr(Kick, "@111", "kick", { mentionedJid: ["111@lid"] });
  await esperar(1400);
  assert.deepEqual(expulsiones, [{ chat: G, ids: ["111@lid"], accion: "remove" }]);

  expulsiones = [];
  statusExpulsion = "403";
  await correr(Kick, "@111", "kick", { mentionedJid: ["111@lid"] });
  await esperar(1400);
  assert.match(ultimo(), /No pude sacarlo \(error 403\)/);
});

test(".kick por número resuelve a la persona, no a un LID inventado", async () => {
  // It used to build "<digits>@lid" from what was typed: writing the phone number gave a LID that doesn't exist.
  await correr(Kick, "@5989911111", "kick");
  await esperar(1400);
  assert.deepEqual(expulsiones, [{ chat: G, ids: ["111@lid"], accion: "remove" }], "lo encuentra por el número del grupo");
});

// The person's row may still have the number they left, now someone else's, whom the group may list first: looking for
// either id in the group's order, ".kick @persona" removed the number's owner now instead of the one mentioned.
test(".kick saca a quien se mencionó aunque su fila tenga un número que ya es de otro", async () => {
  const [A, OTRO, X] = ["300000000000801@lid", "300000000000802@lid", "59899000801@s.whatsapp.net"];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(A, X, "A", 1);
  const grupo = [{ id: OTRO, admin: null, phoneNumber: X }, { id: A, admin: null, phoneNumber: "59899000809@s.whatsapp.net" }, participants.at(-1)];
  await correr(Kick, "@300000000000801", "kick", { mentionedJid: [A], rango: { participants: grupo, groupMetadata: { owner: "100@lid", participants: grupo } } });
  await esperar(1400);
  assert.deepEqual(expulsiones, [{ chat: G, ids: [A], accion: "remove" }]);

  // And the other way around: in a group that lists people by number the mention comes by number, which the database
  // still has on A, who had it before. Whoever the group lists with it is who has it now.
  expulsiones = [];
  const porNumero = [{ id: "59899000809@s.whatsapp.net", lid: A, admin: null }, { id: X, lid: OTRO, admin: null }, { id: "59899000999@s.whatsapp.net", lid: "999@lid", admin: "admin" }];
  await correr(Kick, "@59899000801", "kick", { mentionedJid: [X], rango: { participants: porNumero, groupMetadata: { owner: "100@lid", participants: porNumero } } });
  await esperar(1400);
  assert.deepEqual(expulsiones, [{ chat: G, ids: [X], accion: "remove" }]);
});

// Named only by a typed number the group doesn't pair with a LID, while the database still has it on whoever had it
// before: every command that does something to a person acted on them, and ".rd" deleted their data. WhatsApp is asked
// who has the number (lib/identidad.js, destinatarioActual), and that one is acted on; the group's own pairing, a
// mention by LID, a quoted message or the digits of a LID the bot knows need no question. Without an answer in time,
// the guess of before.
test("los comandos que le hacen algo a alguien nombrado por un número le preguntan a WhatsApp quién lo tiene", { timeout: 30_000 }, async (t) => {
  const I = await import("../lib/identidad.js");
  const [VIEJO, NUEVO, X] = ["300000000000881@lid", "300000000000882@lid", "59899000881@s.whatsapp.net"];
  let consultas = 0;
  let responde = async () => ({ list: [{ id: X, lid: NUEVO }], sideList: [] });
  globalThis.client.executeUSyncQuery = () => (consultas++, responde());
  const consultaReal = I.IDENTIDAD?.CONSULTA_MS;
  t.after(() => {
    delete globalThis.client.executeUSyncQuery;
    if (I.IDENTIDAD) I.IDENTIDAD.CONSULTA_MS = consultaReal;
  });
  const grupo = [{ id: VIEJO, admin: null }, { id: NUEVO, admin: null }, { id: "999@lid", admin: "admin" }];
  const filas = ({ conNuevo = true } = {}) => {
    db.exec(`DELETE FROM users WHERE lid IN ('${VIEJO}', '${NUEVO}')`);
    db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(VIEJO, X, "Viejo", 1); // wrote with X long ago
    if (conNuevo) db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(NUEVO, "", "Nuevo", 2); // never with a number
    for (const id of [VIEJO, NUEVO]) if (F.getUser(id, G)) F.updateUserInGroup(id, G, { warn: 1 });
  };
  const correrA = async (P, command, text, extra = {}) => {
    expulsiones = [];
    globalThis.enviados = [];
    await P.run(m(text, extra), { client: globalThis.client, text, args: text.split(" "), command, usedPrefix: ".", participants: extra.participants || grupo, groupMetadata: { owner: "100@lid", participants: extra.participants || grupo }, isOwner: true, isWaAdmin: true, isAdmin: true });
  };
  const datos = (id) => F.getUser(id, G);
  const [Warn, Unwarn, Promote, Demote, Rd] = await Promise.all(["grupo-advertir", "grupo-advertir-delete", "grupo-promote", "grupo-demote", "owner-restaurar-usuario"].map(async (p) => (await import(`../plugins/${p}.js`)).default));

  filas();
  await correrA(Kick, "kick", "+59899000881");
  await esperar(1400);
  assert.deepEqual(expulsiones, [{ chat: G, ids: [NUEVO], accion: "remove" }], ".kick");
  // Typed with an "@", the group's creator being who had the number: it's not them who is removed, nor who's spared.
  expulsiones = [];
  await Kick.run(m("@59899000881"), { client: globalThis.client, text: "@59899000881", command: "kick", usedPrefix: ".", participants: grupo, groupMetadata: { owner: VIEJO, participants: grupo }, isOwner: true, isWaAdmin: true, isAdmin: true });
  await esperar(1400);
  assert.deepEqual(expulsiones, [{ chat: G, ids: [NUEVO], accion: "remove" }], ".kick @número, con el creador del grupo como dueño anterior");
  for (const [P, command, cambio] of [[Promote, "promote", "promote"], [Demote, "demote", "demote"]]) {
    await correrA(P, command, "+59899000881");
    assert.deepEqual(expulsiones, [{ chat: G, ids: [NUEVO], accion: cambio }], `.${command}`);
  }
  filas();
  await correrA(Warn, "advertir", "+59899000881 spam");
  assert.deepEqual([F.advertenciasDe(NUEVO, G), F.advertenciasDe(VIEJO, G)], [2, 1], ".advertir");
  await correrA(Unwarn, "delwarn", "+59899000881");
  await correrA(Unwarn, "delwarn", "+59899000881");
  assert.deepEqual([F.advertenciasDe(NUEVO, G), F.advertenciasDe(VIEJO, G)], [0, 1], ".delwarn");
  await correrA(Silenciar, "mute", "+59899000881");
  assert.deepEqual([datos(NUEVO).inGroup[G].mute, datos(VIEJO).inGroup[G].mute], [true, false], ".mute");
  // A mention by number the group doesn't pair with a LID, too.
  await correrA(Silenciar, "unmute", "@59899000881", { mentionedJid: [X] });
  assert.equal(datos(NUEVO).inGroup[G].mute, false, ".unmute con una mención por número");
  await correrA(Ban, "banuser", "+59899000881");
  assert.deepEqual([datos(NUEVO).banned, datos(VIEJO).banned], [1, 0], ".banuser");
  await correrA(Rd, "rd", "+59899000881");
  assert.deepEqual([datos(NUEVO), Boolean(datos(VIEJO))], [null, true], ".rd borra los datos del dueño del número, no los del que lo tuvo");
  // Whoever has the number now never wrote: nothing is written on the one who had it.
  filas({ conNuevo: false });
  await correrA(Warn, "advertir", "+59899000881 spam");
  assert.match(ultimo(), /^No tengo registro de esa persona todavía/);
  assert.equal(F.advertenciasDe(VIEJO, G), 1);

  // No question for what already says who it is.
  filas();
  consultas = 0;
  const conNumero = [{ id: VIEJO, admin: null }, { id: NUEVO, admin: null, phoneNumber: X }, { id: "999@lid", admin: "admin" }];
  await correrA(Silenciar, "unmute", "+59899000881", { participants: conNumero });
  await correrA(Silenciar, "unmute", "@300000000000882", { mentionedJid: [NUEVO] });
  await correrA(Silenciar, "unmute", "@300000000000882");
  await correrA(Silenciar, "unmute", "", { quoted: { sender: NUEVO } });
  await correrA(Silenciar, "unmute", "+59899000881", { quoted: { sender: VIEJO } }); // the quote wins over the number
  await correrA(Silenciar, "unmute", "@12345"); // too short to be a number
  assert.equal(consultas, 0);

  // WhatsApp not answering in time: the database's guess, as before.
  I.IDENTIDAD.CONSULTA_MS = 20;
  responde = () => new Promise(() => {});
  await correrA(Silenciar, "mute", "+59899000881");
  assert.equal(datos(VIEJO).inGroup[G].mute, true);
});

test(".kick responde a todos sus alias", async () => {
  for (const alias of ["k", "kick", "rifle", "andate", "morite", "chau"]) {
    assert.ok(Kick.cmd.includes(alias), `falta .${alias} en plugin.cmd`);
  }
});

test(".kick no saca al bot ni al dueño del grupo", async () => {
  await correr(Kick, "@999", "kick", { mentionedJid: ["999@lid"] });
  assert.match(ultimo(), /No me quiero ir/);
  assert.equal(expulsiones.length, 0);

  await correr(Kick, "@100", "kick", { mentionedJid: ["100@lid"] });
  assert.equal(expulsiones.length, 0, "el dueño del grupo tampoco");
});

test(".mute guarda el silencio en este grupo y no finge cuando no puede", async () => {
  await correr(Silenciar, "@111", "mute", { mentionedJid: ["111@lid"] });
  assert.equal(F.getUser("111@lid").inGroup[G].mute, true);

  await correr(Silenciar, "@111", "unmute", { mentionedJid: ["111@lid"] });
  assert.equal(F.getUser("111@lid").inGroup[G].mute, false);

  // By number: the UPDATE has to find the same row all the same.
  await correr(Silenciar, "@5989911111", "mute");
  assert.equal(F.getUser("111@lid").inGroup[G].mute, true, "escribió en la fila correcta");
  await correr(Silenciar, "@5989911111", "unmute");

  await correr(Silenciar, "@5980000000", "mute");
  assert.match(ultimo(), /No existen datos del usuario/, "a quien no conoce, lo dice");
});

test(".banuser guarda de verdad y avisa si no encontró a nadie", async () => {
  await correr(Ban, "@111", "banuser", { mentionedJid: ["111@lid"] });
  assert.equal(F.getUser("111@lid").banned, 1);

  await correr(Ban, "@111", "unbanuser", { mentionedJid: ["111@lid"] });
  assert.equal(F.getUser("111@lid").banned, 0);

  // This used to announce ☑️ without writing anything: the UPDATE found no row and passed as good.
  await correr(Ban, "@5980000000", "banuser");
  assert.match(ultimo(), /No tengo registro de esa persona/);
});

test(".llamar no se come los números que vienen después de la mención", async () => {
  // ".llamar @111 5 minutos" called "1115@lid", who is nobody. The phone number typed here is 111's, and it now
  // resolves to their LID: it used to mention "5989911111@lid", a LID that doesn't exist either.
  await correr(Llamar, "@5989911111 5 minutos", "llamar");
  await esperar(50);
  assert.match(ultimo(), /^@111$/, "menciona a la persona por su LID, sin el 5 pegado");

  await correr(Llamar, "", "cancelar");
  assert.match(ultimo(), /Menciones canceladas/);

  // Several people at once
  await correr(Llamar, "@111 @222 vengan", "llamar", { mentionedJid: ["111@lid", "222@lid"] });
  await esperar(50);
  assert.match(ultimo(), /^@111 @222$/);
  await correr(Llamar, "", "cancelar");
});

test("las ráfagas de menciones son solo de admins, no de moderadores", async () => {
  // .ht2 and .tagall2 mention the whole group ten times in a row, and .llamar sends someone ten messages. A merge that
  // brings back an old copy of any of them would hand them back to moderators without anything failing.
  for (const archivo of ["grupo-hidetag2.js", "grupo-tagall2.js", "grupo-llamar.js"]) {
    const P = (await import(`../plugins/${archivo}`)).default;
    assert.equal(P.onlyAdmin, true, `${archivo} tiene que ser solo de admins`);
  }
});

test("destinatario: resuelve las dos identidades venga como venga", async () => {
  const { destinatario } = await import("../lib/identidad.js");
  const men = (text, mentionedJid = [], quoted = null) => ({ chat: G, sender: "100@lid", text, mentionedJid, quoted });

  // the message's mention
  const porMencion = destinatario(men("@111 algo", ["111@lid"]), "@111 algo", participants);
  assert.equal(porMencion.quien, "111@lid");
  assert.equal(porMencion.jid, "5989911111@s.whatsapp.net");
  assert.equal(porMencion.participante.id, "111@lid");

  // "@number" typed with the phone number: the hand-built LID didn't exist
  const porNumero = destinatario(men("@5989911111"), "@5989911111", participants);
  assert.equal(porNumero.quien, "111@lid", "da con la persona igual");

  // "+number" written by hand
  const porMas = destinatario(men("+598 99 11 111"), "+598 99 11 111", participants);
  assert.equal(porMas.quien, "111@lid");

  // a real mention beats any loose "+number" in the text
  const conAmbos = destinatario(men("@111 debe +598 99 11 222", ["111@lid"]), "@111 debe +598 99 11 222", participants);
  assert.equal(conAmbos.quien, "111@lid");

  // citado
  const porCitado = destinatario(men("", [], { sender: "222@lid" }), "", participants);
  assert.equal(porCitado.quien, "222@lid");

  // someone the bot doesn't know: no row, but still someone to point at
  const desconocido = destinatario(men("@5980000000"), "@5980000000", participants);
  assert.equal(desconocido.quien, null);
  assert.equal(desconocido.objetivo, "5980000000@lid");

  // with nothing
  assert.equal(destinatario(men(""), "", participants).mencionado, null);
});

// A group that lists people by number names them by it and brings the LID apart: someone pointed at by their LID is
// found there too, even when the bot doesn't know their number, which the group gives.
test("destinatario: en un grupo que lista por número, encuentra a la persona por su LID", async () => {
  const { destinatario } = await import("../lib/identidad.js");
  const porNumero = [{ id: "59899333333@s.whatsapp.net", lid: "333@lid", admin: "admin" }];
  const r = destinatario({ chat: G, sender: "100@lid", text: "@333", mentionedJid: ["333@lid"], quoted: null }, "@333", porNumero);
  assert.deepEqual([r.participante?.id, r.lid, r.jid], ["59899333333@s.whatsapp.net", "333@lid", "59899333333@s.whatsapp.net"]);
  assert.equal(r.participante.admin, "admin", "con lo que el grupo dice de ella");
});

test(".p y .d miran lo que contesta WhatsApp", async () => {
  const Promote = (await import("../plugins/grupo-promote.js")).default;
  const Demote = (await import("../plugins/grupo-demote.js")).default;
  const cambios = [];
  globalThis.client.groupParticipantsUpdate = async (chat, ids, accion) => {
    cambios.push({ ids, accion });
    return ids.map((jid) => ({ status: statusExpulsion, jid }));
  };

  await correr(Promote, "@5989911111", "promote");
  assert.deepEqual(cambios, [{ ids: ["111@lid"], accion: "promote" }], "promueve con el LID del grupo");

  statusExpulsion = "403";
  await correr(Demote, "@111", "demote", { mentionedJid: ["111@lid"] });
  assert.match(ultimo(), /No pude sacarle el admin \(error 403\)/);

  statusExpulsion = "200";
  await correr(Demote, "@999", "demote", { mentionedJid: ["999@lid"] });
  assert.match(ultimo(), /dejo de funcionar/, "no se saca el admin a sí mismo");
});

test(".bloquear usa el número, que es lo único que WhatsApp acepta", async () => {
  const Bloquear = (await import("../plugins/owner-bloquear.js")).default;
  const bloqueos = [];
  globalThis.client.updateBlockStatus = async (jid, accion) => bloqueos.push({ jid, accion });

  await correr(Bloquear, "@111", "bloquear", { mentionedJid: ["111@lid"] });
  assert.deepEqual(bloqueos, [{ jid: "5989911111@s.whatsapp.net", accion: "block" }]);

  // 333's number isn't known: it says so instead of sending a LID WhatsApp will reject
  await correr(Bloquear, "@333", "bloquear", { mentionedJid: ["333@lid"] });
  assert.equal(bloqueos.length, 1);
  assert.match(ultimo(), /No sé el número de esa persona/);
});

test(".fr parte el texto por el @ que está escrito, no por el id resuelto", async () => {
  const FakeReply = (await import("../plugins/fun-fake-reply.js")).default;
  // It forges a quote from someone else: moderators only (the dispatcher enforces the flag).
  assert.equal(FakeReply.onlyMod, true, ".fr no puede quedar abierto a cualquiera");
  const enviados = [];
  globalThis.client.sendMessage = async (chat, msg, opciones) => {
    enviados.push({ msg, opciones });
    return { key: { id: "X" } };
  };
  globalThis.client.parseMention = () => [];

  await correr(FakeReply, "hola a todos @5989911111 qué tal", "fr");
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].msg.text, "hola a todos");
  assert.equal(enviados[0].opciones.quoted.message.extendedTextMessage.text, "qué tal");
  assert.equal(enviados[0].opciones.quoted.key.participant, "111@lid", "el falso autor va con el LID resuelto");
});

test(".addowner saca el teléfono de una mención por LID", async () => {
  const fs = await import("fs");
  const AddOwner = (await import("../plugins/owner-add-owner.js")).default;
  const ownersAntes = globalThis.owners;
  // The plugin reads and writes config.toml in the current directory, which in the tests is a temp folder.
  fs.writeFileSync("config.toml", 'owners = ["59899000000"]\n');

  // The phone number used to be mandatory: a mention built a LID and getUser returned "".
  await correr(AddOwner, "@111", "addowner", { mentionedJid: ["111@lid"] });
  assert.match(ultimo(), /\*5989911111\* fué añadido como owner/);
  assert.ok(fs.readFileSync("config.toml", "utf8").includes("5989911111"), "quedó escrito en el archivo");

  await correr(AddOwner, "@111", "addowner", { mentionedJid: ["111@lid"] });
  assert.match(ultimo(), /ya es owner/);

  await correr(AddOwner, "@111", "removeowner", { mentionedJid: ["111@lid"] });
  assert.match(ultimo(), /fué removido de owners/);

  // for someone whose number isn't known, it says so instead of writing junk into the config
  await correr(AddOwner, "@333", "addowner", { mentionedJid: ["333@lid"] });
  assert.match(ultimo(), /No se encontró el numero telefonico/);

  globalThis.owners = ownersAntes;
});

test(".silenciar y .mute son lo mismo, y .desilenciar y .unmute también", async () => {
  const Silenciar = (await import("../plugins/grupo-silenciar.js")).default;
  const muteDe = () => F.getUser("111@lid").inGroup[G].mute;

  // All four names have to be declared: the tests call run with the command directly and never go through
  // plugin.cmd, so without this an alias could be deleted with nothing complaining.
  for (const alias of ["silenciar", "mute", "desilenciar", "unmute"]) {
    assert.ok(Silenciar.cmd.includes(alias), `falta .${alias} en plugin.cmd`);
  }

  // The ones that apply the mute
  for (const alias of ["silenciar", "mute", "silencio", "hacesilencio"]) {
    await correr(Silenciar, "@111", "unmute", { mentionedJid: ["111@lid"] }); // dejarlo hablando
    await correr(Silenciar, "@111", alias, { mentionedJid: ["111@lid"] });
    assert.equal(muteDe(), true, `.${alias} tendría que silenciar`);
  }

  // The ones that lift it
  for (const alias of ["desilenciar", "unmute"]) {
    await correr(Silenciar, "@111", "mute", { mentionedJid: ["111@lid"] }); // silenciarlo primero
    assert.equal(muteDe(), true);
    await correr(Silenciar, "@111", alias, { mentionedJid: ["111@lid"] });
    assert.equal(muteDe(), false, `.${alias} tendría que devolverle la voz`);
  }
});

// ---------- the hierarchy: moderation only goes from strictly above ----------
// lib/roles.js says moderator < bot admin < WhatsApp admin < owner, but the commands never looked: any moderator could
// remove, warn or mute an admin, and a bot admin could make himself a WhatsApp admin and leave the hierarchy behind.
const J = "jerarquia@g.us";
const jerarquia = [
  { id: "100@lid", admin: "superadmin" }, // the group's creator
  { id: "444@lid", admin: "admin" }, // a WhatsApp admin
  { id: "555@lid", admin: null }, // bot admin
  { id: "666@lid", admin: null }, // moderator
  { id: "777@lid", admin: null }, // another moderator
  { id: "111@lid", admin: null, phoneNumber: "5989911111@s.whatsapp.net" }, // a member
  { id: "999@lid", admin: "admin" }, // the bot
];
let rolesListos = false;
function prepararJerarquia() {
  if (rolesListos) return;
  for (const n of [444, 555, 666, 777]) F.initDataDB({ chat: J, sender: `${n}@lid`, senderJid: "" });
  F.setRolGrupo(J, "555@lid", "admin", "100@lid");
  F.setRolGrupo(J, "666@lid", "mod", "555@lid");
  F.setRolGrupo(J, "777@lid", "mod", "555@lid");
  rolesListos = true;
}
// Runs a plugin the way the dispatcher does: the sender's rank comes from the group (WhatsApp admin) and, for the bot's
// own roles, from the database, which the plugins look up themselves.
const como = (sender, P, command, objetivo, text = "") => {
  prepararJerarquia();
  const texto = `@${objetivo.split("@")[0]} ${text}`.trim();
  const esAdminWhatsApp = Boolean(jerarquia.find((p) => p.id === sender)?.admin);
  const msg = { chat: J, sender, text: texto, mentionedJid: [objetivo], quoted: null, isGroup: true, react: async () => {}, delete: async () => {} };
  return P.run(msg, { client: globalThis.client, text: texto, command, usedPrefix: ".", participants: jerarquia, groupMetadata: { owner: "100@lid", participants: jerarquia }, isOwner: false, isWaAdmin: esAdminWhatsApp });
};

test("jerarquía: un moderador no puede sacar, advertir ni silenciar a un admin de WhatsApp", async () => {
  const Warn = (await import("../plugins/grupo-advertir.js")).default;
  await como("666@lid", Kick, "kick", "444@lid");
  assert.match(ultimo(), /No lo puedo sacar: es admin del grupo, y los admins de WhatsApp están por encima de los roles del bot/);
  await como("666@lid", Warn, "adv", "444@lid", "por pesado");
  assert.match(ultimo(), /No lo puedo advertir: es admin del grupo/);
  assert.equal(F.advertenciasDe("444@lid", J), 0);
  await como("666@lid", Silenciar, "mute", "444@lid");
  assert.match(ultimo(), /No lo puedo silenciar: es admin del grupo/);
  assert.ok(!F.getUser("444@lid", J).inGroup[J]?.mute, "el bot le habría borrado cada mensaje");
  assert.deepEqual(expulsiones, []);
});

test("jerarquía: un moderador no toca a otro moderador ni a un admin del bot", async () => {
  await como("666@lid", Kick, "kick", "777@lid");
  assert.match(ultimo(), /No lo puedo sacar: es moderador\. Eso lo puede hacer un admin del bot o de WhatsApp/);
  await como("666@lid", Kick, "kick", "555@lid");
  assert.match(ultimo(), /No lo puedo sacar: es admin del bot\. Eso lo puede hacer un admin de WhatsApp/);
  assert.deepEqual(expulsiones, []);
});

test("jerarquía: un admin de WhatsApp no saca a otro sin sacarle el admin primero", async () => {
  await como("100@lid", Kick, "kick", "444@lid");
  assert.match(ultimo(), /No lo puedo sacar: es admin del grupo\. Primero hay que sacarle el admin con \.demote/);
  assert.deepEqual(expulsiones, []);
});

test("jerarquía: de arriba hacia abajo sí se puede", async () => {
  // A bot admin removes a moderator, and a moderator removes an ordinary member.
  await como("555@lid", Kick, "kick", "777@lid");
  await como("666@lid", Kick, "kick", "111@lid");
  assert.deepEqual(
    expulsiones.map((e) => e.ids[0]),
    ["777@lid", "111@lid"],
  );
  F.setRolGrupo(J, "777@lid", "mod", "555@lid"); // back, for whoever runs next
});

test("jerarquía: dar y sacar admin de WhatsApp es solo de los admins de WhatsApp", async () => {
  const Promote = (await import("../plugins/grupo-promote.js")).default;
  const Demote = (await import("../plugins/grupo-demote.js")).default;

  await como("555@lid", Promote, "promote", "555@lid");
  assert.match(ultimo(), /Dar admin de WhatsApp es cosa de los admins de WhatsApp/, "un admin del bot no se asciende a sí mismo");
  await como("555@lid", Demote, "demote", "444@lid");
  assert.match(ultimo(), /Sacar admin de WhatsApp es cosa de los admins de WhatsApp/);
  assert.deepEqual(expulsiones, []);

  await como("444@lid", Promote, "promote", "111@lid");
  assert.deepEqual(expulsiones, [{ chat: J, ids: ["111@lid"], accion: "promote" }], "un admin de WhatsApp sí");
});

test("jerarquía: la ruleta del ban no se lleva a nadie que quien la gira no podría sacar", async () => {
  const Ruleta = (await import("../plugins/fun-ruleta-del-ban.js")).default;
  prepararJerarquia();
  F.setRolGrupo(J, "888@lid", "admin", "100@lid");
  // Besides the admins, only two bot admins: the one spinning it and another one. Neither is fair game.
  const grupo = [{ id: "100@lid", admin: "superadmin" }, { id: "555@lid", admin: null }, { id: "888@lid", admin: null }, { id: "999@lid", admin: "admin" }];
  await Ruleta.run({ chat: J, sender: "555@lid", isGroup: true }, { client: globalThis.client, groupMetadata: { participants: grupo }, isOwner: false, isWaAdmin: false });
  assert.match(ultimo(), /No se encontraron candidatos/);
  assert.deepEqual(expulsiones, []);
});

// A group that lists people by number names them by it, LID apart, and may still list the bot as not admin (metadata
// from before it was promoted). The bot, or a bot admin listed that way, used to be fair game.
test("ruleta del ban: en un grupo que lista por número, no se lleva al bot ni a un admin del bot", async () => {
  const Ruleta = (await import("../plugins/fun-ruleta-del-ban.js")).default;
  prepararJerarquia();
  const grupo = [
    { id: "100@s.whatsapp.net", lid: "100@lid", admin: "superadmin" },
    { id: "555@s.whatsapp.net", lid: "555@lid", admin: null }, // bot admin, who spins it
    { id: "888@s.whatsapp.net", lid: "888@lid", admin: null }, // another bot admin
    { id: globalThis.client.user.jid, lid: globalThis.client.user.lid, admin: null }, // the bot
  ];
  F.setRolGrupo(J, "888@lid", "admin", "100@lid");
  await Ruleta.run({ chat: J, sender: "555@lid", isGroup: true }, { client: globalThis.client, groupMetadata: { participants: grupo }, isOwner: false, isWaAdmin: false });
  assert.match(ultimo(), /No se encontraron candidatos/);
  assert.deepEqual(expulsiones, []);
});

// The owner is recognized by their number, which a group that lists people by number names them by: going by the LID it
// brings apart, the owner whose LID the bot didn't know was fair game.
test("ruleta del ban: en un grupo que lista por número, no se lleva al owner", async () => {
  const Ruleta = (await import("../plugins/fun-ruleta-del-ban.js")).default;
  const grupo = [
    { id: "59899000100@s.whatsapp.net", lid: "100@lid", admin: "superadmin" }, // who spins it
    { id: `${globalThis.owners[0]}@s.whatsapp.net`, lid: "770077@lid", admin: null }, // the owner, LID unknown to the bot
    { id: globalThis.client.user.jid, lid: globalThis.client.user.lid, admin: "admin" },
  ];
  await Ruleta.run({ chat: J, sender: "100@lid", isGroup: true }, { client: globalThis.client, groupMetadata: { participants: grupo }, isOwner: false, isWaAdmin: true });
  assert.match(ultimo(), /No se encontraron candidatos/);
  assert.deepEqual(expulsiones, []);
});

test("ruleta del ban: el anuncio sale antes de la expulsión, y si WhatsApp no deja, lo dice", async () => {
  const Ruleta = (await import("../plugins/fun-ruleta-del-ban.js")).default;
  // Two groups spinning at once: in one WhatsApp accepts the removal, in the other it answers 403. Each group's
  // announcement waits its turn in the queue (lib/envios.js) until the test lets it go.
  const lineas = { "ruleta-si@g.us": [], "ruleta-no@g.us": [] };
  const compuertas = {};
  const soltar = {};
  for (const chat of Object.keys(lineas)) compuertas[chat] = new Promise((resolve) => (soltar[chat] = resolve));
  const client = {
    ...globalThis.client,
    sendText: async (chat, texto) => {
      if (/ruleta de la muerte/.test(texto)) await compuertas[chat];
      lineas[chat].push(texto);
      return { key: { id: "R" } };
    },
    groupParticipantsUpdate: async (chat, ids) => {
      lineas[chat].push(`fuera ${ids[0]}`);
      return ids.map((jid) => ({ status: chat === "ruleta-no@g.us" ? "403" : "200", jid }));
    },
  };
  const grupo = [{ id: "999@lid", admin: "admin" }, { id: "111@lid", admin: null }];
  const girar = (chat) => Ruleta.run({ chat, sender: "100@lid", isGroup: true }, { client, groupMetadata: { participants: grupo }, isOwner: true, isWaAdmin: true });
  const corriendo = Object.keys(lineas).map(girar);

  await esperar(2300); // past the 2 seconds of suspense: without waiting for the announcement, both would be out by now
  assert.deepEqual(lineas, { "ruleta-si@g.us": [], "ruleta-no@g.us": [] }, "nadie sale mientras el anuncio espera su turno");

  soltar["ruleta-si@g.us"]();
  soltar["ruleta-no@g.us"]();
  await Promise.all(corriendo);
  assert.deepEqual(lineas["ruleta-si@g.us"], [strings.ruletaDelBan("111@lid"), "fuera 111@lid"], "anuncio, expulsión, y nada más");
  assert.deepEqual(lineas["ruleta-no@g.us"], [strings.ruletaDelBan("111@lid"), "fuera 111@lid", "La ruleta eligió, pero WhatsApp no me dejó sacarlo (error 403)."]);
});

test(".del: con un rol del bot se borra solo hacia abajo; los admins de WhatsApp y los mensajes de Claudia, siempre", async () => {
  const Del = (await import("../plugins/grupo-delete-message.js")).default;
  F.initDataDB({ chat: G, sender: "400@lid", senderJid: "" });
  F.setRolGrupo(G, "400@lid", "mod", "100@lid");
  F.initDataDB({ chat: G, sender: "7070@lid", senderJid: `${globalThis.owners[0]}@s.whatsapp.net` }); // the bot's owner
  const conAdmin = [...participants, { id: "888@lid", admin: "admin" }, { id: "7070@lid", admin: null }];
  const borrar = async (autor, { fromMe = false, rango = { isWaAdmin: false } } = {}) => {
    const borrados = [];
    const msg = { chat: G, sender: "400@lid", isGroup: true, delete: async () => {}, quoted: { sender: autor, fromMe, delete: async () => borrados.push(autor) } };
    await Del.run(msg, { client: globalThis.client, participants: conAdmin, isMod: true, isOwner: false, ...rango });
    return borrados.length > 0;
  };
  assert.ok(await borrar("111@lid"), "un moderador borra a un miembro");
  assert.ok(!(await borrar("888@lid")), "un moderador borraba a un admin de WhatsApp");
  assert.match(ultimo(), /No lo puedo borrar: es admin del grupo/);
  assert.ok(!(await borrar("7070@lid")), "un moderador borraba al dueño del bot");
  assert.match(ultimo(), /No lo puedo borrar: es dueño del bot/);
  assert.ok(await borrar("999@lid", { fromMe: true }), "los mensajes de Claudia los limpia cualquier moderador");
  assert.ok(await borrar("888@lid", { rango: { isWaAdmin: true } }), "un admin de WhatsApp borra lo que sea");
});

// The notice of a promotion or a demotion (.detect) leaves the owner alone, whether they did it or it was done to them,
// under either identity: a group that lists people by number brings them by it, and comparing with the owner's LID
// alone posted the owner's promotion.
test(".detect no avisa del promote ni del demote del owner, lo traiga el grupo por número o por LID", async () => {
  const Det = (await import("../plugins/_detect-events.js")).default;
  const OWNER = "59899111222@s.whatsapp.net";
  F.initDataDB({ chat: G, sender: "7070@lid", senderJid: OWNER, pushName: "Dueño" });
  const avisa = async (participante, sender = "105@lid") => {
    globalThis.enviados = [];
    await Det.before({ isGroup: true, chat: G, sender, senderJid: "", messageStubType: 29, messageStubParameters: [JSON.stringify(participante)] }, { client: globalThis.client, participants: [{ id: "105@lid", admin: "admin" }], isBotAdmin: true, chat: { detect: 1, isBanned: 0 } });
    return globalThis.enviados.length > 0;
  };
  assert.equal(await avisa({ id: OWNER, lid: "7070@lid", admin: null }), false, "en un grupo por número");
  assert.equal(await avisa({ id: "7070@lid", phoneNumber: OWNER, admin: null }), false, "en un grupo por LID");
  assert.equal(await avisa({ id: "7070@lid", admin: null }), false, "por LID, sin el número al lado");
  assert.equal(await avisa({ id: "7171@lid", phoneNumber: OWNER, admin: null }), false, "por un LID que la base no tiene, con el número al lado");
  assert.equal(await avisa({ id: "59899000444@s.whatsapp.net", admin: null }, OWNER), false, "si lo hizo el owner, en un grupo por número");
  globalThis.enviados = [];
  await Det.before({ isGroup: true, chat: G, sender: "7272@lid", senderJid: OWNER, messageStubType: 30, messageStubParameters: [JSON.stringify({ id: "444@lid", admin: null })] }, { client: globalThis.client, participants: [], isBotAdmin: true, chat: { detect: 1, isBanned: 0 } });
  assert.deepEqual(globalThis.enviados, [], "si lo hizo el owner con un LID que la base no tiene, y el número al lado");
  assert.equal(await avisa({ id: "444@lid", admin: null }), true, "con cualquier otra persona, avisa");
});

// A notice that doesn't name who acted (Baileys keys it by a participant it may not bring, or by an account m.sender
// can't name, @hosted) came out as "Acción hecha por: @", with nobody after the "@": those used to be cut before the
// hooks.
test(".detect no avisa de un cambio cuando no sabe quién lo hizo", async () => {
  const Det = (await import("../plugins/_detect-events.js")).default;
  for (const [tipo, parametros] of [[23, ["CodigoNuevo"]], [29, [JSON.stringify({ id: "444@lid", admin: "admin" })]], [30, [JSON.stringify({ id: "444@lid", admin: null })]]]) {
    globalThis.enviados = [];
    await Det.before({ isGroup: true, chat: G, sender: "", senderJid: "", messageStubType: tipo, messageStubParameters: parametros }, { client: globalThis.client, participants: [{ id: "105@lid", admin: "admin" }], isBotAdmin: true, chat: { detect: 1, isBanned: 0 } });
    assert.deepEqual(globalThis.enviados, [], `tipo ${tipo}`);
  }
});

// Two ids are the same person by an id in common, counting the LID the database knows for a number; never through a
// number two LIDs share, which is what a recycled number has.
test("mismaPersona: por la LID que la base sabe del número, pero no a través de un número reciclado", async () => {
  const { mismaPersona } = await import("../lib/identidad.js");
  const N = "59899004747@s.whatsapp.net";
  F.initDataDB({ chat: G, sender: "4747@lid", senderJid: N });
  assert.ok(mismaPersona("4747@lid", N));
  assert.ok(mismaPersona(N, ["4747@lid"]));
  assert.ok(mismaPersona(["otro@lid", N], "4747@lid"));
  F.initDataDB({ chat: G, sender: "4748@lid", senderJid: N }); // the number, later, of someone else
  assert.ok(!mismaPersona("4747@lid", "4748@lid"), "dos personas que usaron el mismo número");
  assert.ok(!mismaPersona(null, [undefined, ""]));
});

// With WhatsApp not saying who has a number, the database's guess isn't taken where the group lists that LID with
// another number: the person moved on to it. .kick removed them, .mute silenced them and .rd deleted their data, for a
// number that's someone else's now.
test("por número y sin respuesta de WhatsApp, no se toca a quien la base recuerda si el grupo lo lista con otro número", async (t) => {
  const I = await import("../lib/identidad.js");
  const [VIEJO, X, Y] = ["300000000000891@lid", "59899000891@s.whatsapp.net", "59899000898@s.whatsapp.net"];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(VIEJO, X, "Viejo", 1);
  const consultaReal = I.IDENTIDAD.CONSULTA_MS;
  I.IDENTIDAD.CONSULTA_MS = 20;
  globalThis.client.executeUSyncQuery = () => new Promise(() => {});
  t.after(() => {
    delete globalThis.client.executeUSyncQuery;
    I.IDENTIDAD.CONSULTA_MS = consultaReal;
  });
  const grupo = [{ id: VIEJO, phoneNumber: Y, admin: null }, { id: "999@lid", admin: "admin" }];
  const Rd = (await import("../plugins/owner-restaurar-usuario.js")).default;
  const correrA = (P, command, text) => P.run(m(text), { client: globalThis.client, text, args: text.split(" "), command, usedPrefix: ".", participants: grupo, groupMetadata: { owner: "100@lid", participants: grupo }, isOwner: true, isWaAdmin: true, isAdmin: true });
  // What .kick removes by (it waits over a second before removing, and this file runs close to Node 22's cap on it).
  const { participante, lid, quien } = await I.destinatarioActual(globalThis.client, m("+59899000891"), "+59899000891", grupo);
  assert.deepEqual([participante, lid, quien], [null, null, null], ".kick no saca a VIEJO");
  await correrA(Silenciar, "mute", "+59899000891");
  assert.notEqual(F.getUser(VIEJO, G).inGroup[G]?.mute, true, ".mute no lo silencia");
  await correrA(Rd, "rd", "+59899000891");
  assert.ok(F.getUser(VIEJO), ".rd no borra su fila");
});

// .rd by a number whose LID, as WhatsApp gives it, has no row resets nothing: it said "Se reinició" all the same.
test(".rd por número no dice que reinició si no había nada que borrar", async (t) => {
  const [X, L] = ["59899000893@s.whatsapp.net", "300000000000893@lid"];
  globalThis.client.executeUSyncQuery = async () => ({ list: [{ id: X, lid: L }] });
  t.after(() => delete globalThis.client.executeUSyncQuery);
  const Rd = (await import("../plugins/owner-restaurar-usuario.js")).default;
  await Rd.run(m("+59899000893"), { client: globalThis.client, text: "+59899000893", command: "rd", usedPrefix: ".", participants, isOwner: true });
  assert.equal(ultimo(), "No tengo registro de esa persona.");
});

// A "+number" ends where it does, as .ln reads it (numeroTipeado): glued to a reason that starts with digits, ".adv
// +598… 3 veces" asked WhatsApp about another number and warned whoever had it, or nobody.
test(".adv por número no se come los dígitos del motivo", async () => {
  const Warn = (await import("../plugins/grupo-advertir.js")).default;
  const antes = F.advertenciasDe("111@lid", G);
  await correr(Warn, "+5989911111 3 veces seguidas", "advertir");
  assert.equal(F.advertenciasDe("111@lid", G), antes + 1);
});
