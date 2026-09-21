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
