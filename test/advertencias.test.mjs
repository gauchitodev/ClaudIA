import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";
import strings from "../lib/strings.js";

let F, Warn, Unwarn, Lista;
const H = "otro@g.us";
let expulsiones = [];
let statusExpulsion = "200";

before(async () => {
  ({ F } = await prepararBase("advertencias"));
  globalThis.txt = strings;
  globalThis.client.user.lid = "999@lid";
  globalThis.client.groupParticipantsUpdate = async (chat, ids, accion) => {
    expulsiones.push({ chat, ids, accion });
    return ids.map((jid) => ({ status: statusExpulsion, jid }));
  };
  Warn = (await import("../plugins/grupo-advertir.js")).default;
  Unwarn = (await import("../plugins/grupo-advertir-delete.js")).default;
  Lista = (await import("../plugins/lista-advertidos.js")).default;
  for (const n of [111, 222]) F.initDataDB({ chat: G, sender: `${n}@lid`, senderJid: `5989911${n}@s.whatsapp.net` });
  F.updateUser("111@lid", { pushName: "Fulano" });
});

beforeEach(() => {
  expulsiones = [];
  statusExpulsion = "200";
  globalThis.enviados = [];
  for (const n of [111, 222]) for (const chat of [G, H]) F.setAdvertencias(`${n}@lid`, chat, 0);
});

// El grupo lista a la gente por LID y trae el número de quien lo comparte.
const participants = [
  { id: "111@lid", admin: null, phoneNumber: "5989911111@s.whatsapp.net" },
  { id: "222@lid", admin: null },
  { id: "999@lid", admin: "admin" },
];

const m = (text, { mentionedJid = [], chat = G } = {}) => ({ chat, sender: "100@lid", text, mentionedJid, isGroup: true, react: async () => {} });
const ultimo = () => ultimoEnviado()?.msg?.text || "";
const correr = (P, text, opciones = {}) =>
  P.run(m(text, opciones), { client: globalThis.client, text, command: "adv", usedPrefix: ".", participants });

test("una razón que empieza con número no le cambia el destinatario", async () => {
  // El bug viejo: el regex incluía \s y seguía comiéndose dígitos, así que ".adv @5989911111 3 veces" advertía
  // a "59899111113" —alguien que no era— y dejaba la razón en "veces".
  await correr(Warn, "@5989911111 3 veces seguidas", { mentionedJid: ["111@lid"] });

  assert.equal(F.advertenciasDe("111@lid", G), 1);
  assert.match(ultimo(), /3 veces seguidas/, "la razón queda entera");
  assert.match(ultimo(), /1\/3/);
});

test("advertir por número guarda de verdad, no solo lo anuncia", async () => {
  // El bug viejo: getUser encontraba a la persona por la columna jid, pero updateUser escribía siempre contra lid,
  // así que el UPDATE no tocaba ninguna fila y el bot igual anunciaba "2/3".
  await correr(Warn, "molesta", { mentionedJid: ["5989911111@s.whatsapp.net"] });
  assert.equal(F.advertenciasDe("111@lid", G), 1, "quedó guardada");
  assert.match(ultimo(), /1\/3/);

  await correr(Warn, "otra vez", { mentionedJid: ["5989911111@s.whatsapp.net"] });
  assert.equal(F.advertenciasDe("111@lid", G), 2, "la segunda se suma a la primera");
  assert.match(ultimo(), /2\/3/);
});

test("a la tercera lo echa, y el mensaje no promete un 3/3 que no pasa nada", async () => {
  await correr(Warn, "@111 una", { mentionedJid: ["111@lid"] });
  assert.match(ultimo(), /1\/3/);
  await correr(Warn, "@111 dos", { mentionedJid: ["111@lid"] });
  assert.match(ultimo(), /2\/3/);
  assert.equal(expulsiones.length, 0);

  await correr(Warn, "@111 tres", { mentionedJid: ["111@lid"] });
  assert.match(ultimo(), /SERÁS ELIMINADO/);
  assert.deepEqual(expulsiones, [{ chat: G, ids: ["111@lid"], accion: "remove" }], "se lo expulsa con el LID del grupo");
  assert.equal(F.advertenciasDe("111@lid", G), 0, "se le limpia la cuenta al salir");
});

test("si WhatsApp no deja expulsar, las advertencias no se pierden", async () => {
  F.setAdvertencias("111@lid", G, 2);
  statusExpulsion = "403";

  await correr(Warn, "@111 la tercera", { mentionedJid: ["111@lid"] });
  assert.equal(expulsiones.length, 1);
  assert.match(ultimo(), /No me dejaron echarlo \(error 403\)/);
  assert.equal(F.advertenciasDe("111@lid", G), 3, "quedan anotadas para el próximo intento");
});

test("las advertencias son de cada grupo: las de uno no echan de otro", async () => {
  await correr(Warn, "@111 una acá", { mentionedJid: ["111@lid"] });
  await correr(Warn, "@111 dos acá", { mentionedJid: ["111@lid"] });
  assert.equal(F.advertenciasDe("111@lid", G), 2);
  assert.equal(F.advertenciasDe("111@lid", H), 0, "el otro grupo sigue en cero");

  // La primera en el otro grupo es la primera, no la tercera
  await correr(Warn, "@111 una allá", { mentionedJid: ["111@lid"], chat: H });
  assert.match(ultimo(), /1\/3/);
  assert.equal(expulsiones.length, 0, "no lo echa por lo que hizo en otro lado");
  assert.equal(F.advertenciasDe("111@lid", H), 1);
});

test("unwarn saca una advertencia de este grupo", async () => {
  F.setAdvertencias("111@lid", G, 2);
  F.setAdvertencias("111@lid", H, 2);

  await correr(Unwarn, "@111", { mentionedJid: ["111@lid"] });
  assert.equal(F.advertenciasDe("111@lid", G), 1);
  assert.equal(F.advertenciasDe("111@lid", H), 2, "no toca las del otro grupo");
  assert.match(ultimo(), /Antes: 2\/3[\s\S]*Ahora: 1\/3/);

  F.setAdvertencias("111@lid", G, 0);
  await correr(Unwarn, "@111", { mentionedJid: ["111@lid"] });
  assert.match(ultimo(), /No tiene advertencias en este grupo/);
});

test("no se puede advertir al bot ni a un dueño", async () => {
  await correr(Warn, "@999 por algo", { mentionedJid: ["999@lid"] });
  assert.equal(globalThis.enviados.length, 0, "al bot no");

  const ownerLid = "777@lid";
  F.initDataDB({ chat: G, sender: ownerLid, senderJid: `${globalThis.owners[0]}@s.whatsapp.net` });
  await correr(Warn, "@777 por algo", { mentionedJid: [ownerLid] });
  assert.equal(F.advertenciasDe(ownerLid, G), 0, "a un dueño tampoco");
});

test("la lista de advertidos es la del grupo donde se pide", async () => {
  F.setAdvertencias("111@lid", G, 2);
  F.setAdvertencias("222@lid", H, 1);

  await Lista.run(m(""), { client: globalThis.client });
  assert.match(ultimo(), /Total : 1/);
  assert.match(ultimo(), /Fulano \*\(2\/3\)\*/, "se lo nombra sin etiquetarlo");
  assert.doesNotMatch(ultimo(), /222/, "los del otro grupo no salen acá");

  assert.equal(F.advertidos().length, 2, "sin grupo, salen todas");
  assert.equal(F.advertidos(H).length, 1);
});

// Va acá porque es la raíz del bug de arriba: updateUser escribía siempre contra la columna lid, así que al pasarle
// un número el UPDATE no tocaba ninguna fila y devolvía true igual. Hoy los plugins normalizan a LID antes de
// escribir, pero si esa normalización se rompe alguna vez, esto tiene que seguir fallando ruidosamente.
test("updateUser escribe encontrando la fila por número, y avisa si no hay ninguna", () => {
  assert.equal(F.updateUser("5989911111@s.whatsapp.net", { pushName: "Por número" }), true);
  assert.equal(F.getUser("111@lid").pushName, "Por número", "escribió en la fila de esa persona");
  assert.equal(F.updateUser("000@lid", { pushName: "nadie" }), false, "no finge haber guardado");
  F.updateUser("111@lid", { pushName: "Fulano" });
});
