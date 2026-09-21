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
  F.initDataDB({ chat: G, sender: "333@lid", senderJid: "" }); // alguien de quien no se conoce el número
});

beforeEach(() => {
  expulsiones = [];
  statusExpulsion = "200";
  globalThis.enviados = [];
});

// El grupo lista por LID; de 111 se conoce el número, de 222 no.
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
  // Antes se armaba "<dígitos>@lid" con lo tipeado: escribir el teléfono daba un LID que no existe.
  await correr(Kick, "@5989911111", "kick");
  await esperar(1400);
  assert.deepEqual(expulsiones, [{ chat: G, ids: ["111@lid"], accion: "remove" }], "lo encuentra por el número del grupo");
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

  // Por número: el UPDATE tiene que dar con la misma fila igual.
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

  // Antes esto anunciaba ☑️ sin escribir nada: el UPDATE no encontraba la fila y se daba por bueno.
  await correr(Ban, "@5980000000", "banuser");
  assert.match(ultimo(), /No tengo registro de esa persona/);
});

test(".llamar no se come los números que vienen después de la mención", async () => {
  // ".llamar @111 5 minutos" llamaba a "1115@lid", que no es nadie.
  await correr(Llamar, "@5989911111 5 minutos", "llamar");
  await esperar(50);
  assert.match(ultimo(), /^@5989911111$/, "menciona a la persona, sin el 5 pegado");

  await correr(Llamar, "", "cancelar");
  assert.match(ultimo(), /Menciones canceladas/);

  // Varias personas de una
  await correr(Llamar, "@111 @222 vengan", "llamar", { mentionedJid: ["111@lid", "222@lid"] });
  await esperar(50);
  assert.match(ultimo(), /^@111 @222$/);
  await correr(Llamar, "", "cancelar");
});

test("destinatario: resuelve las dos identidades venga como venga", async () => {
  const { destinatario } = await import("../lib/identidad.js");
  const men = (text, mentionedJid = [], quoted = null) => ({ chat: G, sender: "100@lid", text, mentionedJid, quoted });

  // mención del mensaje
  const porMencion = destinatario(men("@111 algo", ["111@lid"]), "@111 algo", participants);
  assert.equal(porMencion.quien, "111@lid");
  assert.equal(porMencion.jid, "5989911111@s.whatsapp.net");
  assert.equal(porMencion.participante.id, "111@lid");

  // "@número" tipeado con el teléfono: el LID que se armaba a mano no existía
  const porNumero = destinatario(men("@5989911111"), "@5989911111", participants);
  assert.equal(porNumero.quien, "111@lid", "da con la persona igual");

  // "+número" escrito a mano
  const porMas = destinatario(men("+598 99 11 111"), "+598 99 11 111", participants);
  assert.equal(porMas.quien, "111@lid");

  // una mención de verdad le gana al "+número" suelto que haya en el texto
  const conAmbos = destinatario(men("@111 debe +598 99 11 222", ["111@lid"]), "@111 debe +598 99 11 222", participants);
  assert.equal(conAmbos.quien, "111@lid");

  // citado
  const porCitado = destinatario(men("", [], { sender: "222@lid" }), "", participants);
  assert.equal(porCitado.quien, "222@lid");

  // alguien que el bot no conoce: no hay fila, pero sí a quién apuntar
  const desconocido = destinatario(men("@5980000000"), "@5980000000", participants);
  assert.equal(desconocido.quien, null);
  assert.equal(desconocido.objetivo, "5980000000@lid");

  // sin nada
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

  // de 333 no se conoce el número: lo dice en vez de mandar un LID que WhatsApp rechaza
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
  // El plugin lee y escribe config.toml en el directorio actual, que en las pruebas es una carpeta temporal.
  fs.writeFileSync("config.toml", 'owners = ["59899000000"]\n');

  // Antes había que escribir el teléfono sí o sí: con una mención se armaba un LID y getUser devolvía "".
  await correr(AddOwner, "@111", "addowner", { mentionedJid: ["111@lid"] });
  assert.match(ultimo(), /\*5989911111\* fué añadido como owner/);
  assert.ok(fs.readFileSync("config.toml", "utf8").includes("5989911111"), "quedó escrito en el archivo");

  await correr(AddOwner, "@111", "addowner", { mentionedJid: ["111@lid"] });
  assert.match(ultimo(), /ya es owner/);

  await correr(AddOwner, "@111", "removeowner", { mentionedJid: ["111@lid"] });
  assert.match(ultimo(), /fué removido de owners/);

  // de quien no se sabe el número, lo dice en vez de escribir basura en el config
  await correr(AddOwner, "@333", "addowner", { mentionedJid: ["333@lid"] });
  assert.match(ultimo(), /No se encontró el numero telefonico/);

  globalThis.owners = ownersAntes;
});
