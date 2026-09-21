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
  globalThis.client.groupParticipantsUpdate = async (chat, ids, accion) => {
    expulsiones.push({ chat, ids, accion });
    return ids.map((jid) => ({ status: statusExpulsion, jid }));
  };
  Kick = (await import("../plugins/grupo-kick.js")).default;
  Silenciar = (await import("../plugins/grupo-silenciar.js")).default;
  Ban = (await import("../plugins/owner-banuser.js")).default;
  Llamar = (await import("../plugins/grupo-llamar.js")).default;
  for (const n of [111, 222]) F.initDataDB({ chat: G, sender: `${n}@lid`, senderJid: `5989911${n}@s.whatsapp.net` });
  F.initDataDB({ chat: G, sender: "333@lid", senderJid: "" }); // someone whose number isn't known
});

beforeEach(() => {
  expulsiones = [];
  statusExpulsion = "200";
  globalThis.enviados = [];
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
const correr = (P, text, command, opciones = {}) =>
  P.run(m(text, opciones), { client: globalThis.client, text, command, usedPrefix: ".", participants, groupMetadata });

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
  // ".llamar @111 5 minutos" called "1115@lid", who is nobody.
  await correr(Llamar, "@5989911111 5 minutos", "llamar");
  await esperar(50);
  assert.match(ultimo(), /^@5989911111$/, "menciona a la persona, sin el 5 pegado");

  await correr(Llamar, "", "cancelar");
  assert.match(ultimo(), /Menciones canceladas/);

  // Several people at once
  await correr(Llamar, "@111 @222 vengan", "llamar", { mentionedJid: ["111@lid", "222@lid"] });
  await esperar(50);
  assert.match(ultimo(), /^@111 @222$/);
  await correr(Llamar, "", "cancelar");
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
