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
  // ".llamar @111 5 minutos" called "1115@lid", who is nobody. The phone number typed here is 111's, and it now resolves
  // to their LID: it used to mention "5989911111@lid", a LID that doesn't exist either.
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
// Every removal and admin change lands in "expulsiones". Installed on each call because earlier tests in this file
// swap groupParticipantsUpdate for their own and don't put it back: without this, "nothing was removed" held trivially.
const vigilar = () => {
  globalThis.client.groupParticipantsUpdate = async (chat, ids, accion) => {
    expulsiones.push({ chat, ids, accion });
    return ids.map((jid) => ({ status: "200", jid }));
  };
};
// Runs a plugin the way the dispatcher does: the sender's rank comes from the group (WhatsApp admin) and, for the bot's
// own roles, from the database, which the plugins look up themselves.
const como = (sender, P, command, objetivo, text = "") => {
  prepararJerarquia();
  vigilar();
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
  vigilar();
  await Ruleta.run({ chat: J, sender: "555@lid", isGroup: true }, { client: globalThis.client, groupMetadata: { participants: grupo }, isOwner: false, isWaAdmin: false });
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
