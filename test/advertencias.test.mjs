import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado, esperar } from "./helpers.mjs";
import { configuracion } from "../lib/configuracion.js";
import { conexion } from "../lib/conexion.js";

let F, Warn, Unwarn, Lista;
const H = "otro@g.us";
let expulsiones = [];
let statusExpulsion = "200";

before(async () => {
  ({ F } = await prepararBase("advertencias"));
  conexion.client.user.lid = "999@lid";
  conexion.client.groupParticipantsUpdate = async (chat, ids, accion) => {
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
  // No warnings anywhere: unwarn's test leaves its moderators with some, and run first, the list counted them.
  for (const a of F.advertidos()) F.setAdvertencias(a.lid, a.chat, 0);
});

// The group lists people by LID and carries the number of whoever shares it.
const participants = [
  { id: "111@lid", admin: null, phoneNumber: "5989911111@s.whatsapp.net" },
  { id: "222@lid", admin: null },
  { id: "999@lid", admin: "admin" },
];

const m = (text, { mentionedJid = [], chat = G } = {}) => ({ chat, sender: "100@lid", text, mentionedJid, isGroup: true, react: async () => {} });
const ultimo = () => ultimoEnviado()?.msg?.text || "";
// Run by 100, a WhatsApp admin, as the dispatcher would say: warning only goes from strictly above.
const correr = (P, text, opciones = {}) =>
  P.run(m(text, opciones), { client: conexion.client, text, command: "adv", usedPrefix: ".", participants, isOwner: false, isWaAdmin: true });

test("una razón que empieza con número no le cambia el destinatario", async () => {
  // The old bug: the regex included \s and kept swallowing digits, so ".adv @5989911111 3 veces" warned
  // "59899111113" —someone else entirely— and left the reason as "veces".
  await correr(Warn, "@5989911111 3 veces seguidas", { mentionedJid: ["111@lid"] });

  assert.equal(F.advertenciasDe("111@lid", G), 1);
  assert.match(ultimo(), /3 veces seguidas/, "la razón queda entera");
  assert.match(ultimo(), /1\/3/);
});

test("advertir por número guarda de verdad, no solo lo anuncia", async () => {
  // The old bug: getUser found the person through the jid column, but updateUser always wrote against lid, so the
  // UPDATE touched no row and the bot announced "2/3" regardless.
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

  // The first one in the other group is the first, not the third
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
  F.initDataDB({ chat: G, sender: ownerLid, senderJid: `${configuracion.owners[0]}@s.whatsapp.net` });
  await correr(Warn, "@777 por algo", { mentionedJid: [ownerLid] });
  assert.equal(F.advertenciasDe(ownerLid, G), 0, "a un dueño tampoco");
});

test("la lista de advertidos es la del grupo donde se pide", async () => {
  F.setAdvertencias("111@lid", G, 2);
  F.setAdvertencias("222@lid", H, 1);

  await Lista.run(m(""), { client: conexion.client });
  assert.match(ultimo(), /Total : 1/);
  assert.match(ultimo(), /Fulano \*\(2\/3\)\*/, "se lo nombra sin etiquetarlo");
  assert.doesNotMatch(ultimo(), /222/, "los del otro grupo no salen acá");

  assert.equal(F.advertidos().length, 2, "sin grupo, salen todas");
  assert.equal(F.advertidos(H).length, 1);
});

// The list is the owner's: from their private chat, someone without a name shows their number, since "alguien" wouldn't
// say who. In a group the whole group reads it, and there it stays "alguien".
test("la lista de advertidos: por privado, el número de quien no tiene nombre; en un grupo, no", async () => {
  F.setAdvertencias("111@lid", G, 2);
  F.setAdvertencias("222@lid", H, 1);
  await Lista.run({ chat: "59899111222@s.whatsapp.net", sender: "100@lid", text: "", mentionedJid: [], isGroup: false }, { client: conexion.client });
  assert.match(ultimo(), /│ Fulano \*\(2\/3\)\*/);
  assert.match(ultimo(), /│ \+5989911222 \*\(1\/3\)\*/);
  await Lista.run(m("", { chat: H }), { client: conexion.client });
  assert.match(ultimo(), /│ alguien \*\(1\/3\)\*/);
  assert.doesNotMatch(ultimo(), /5989911222|222@lid/);
});

// This lives here because it is the root of the bug above: updateUser always wrote against the lid column, so given
// a number the UPDATE touched no row and returned true anyway. The plugins now normalize to LID before writing, but
// if that normalization ever breaks, this has to keep failing loudly.
test("updateUser escribe encontrando la fila por número, y avisa si no hay ninguna", () => {
  assert.equal(F.updateUser("5989911111@s.whatsapp.net", { pushName: "Por número" }), true);
  assert.equal(F.getUser("111@lid").pushName, "Por número", "escribió en la fila de esa persona");
  assert.equal(F.updateUser("000@lid", { pushName: "nadie" }), false, "no finge haber guardado");
  F.updateUser("111@lid", { pushName: "Fulano" });
});

test("unwarn: nadie se saca sus propias advertencias, y un moderador no se las saca a otro moderador", async () => {
  // Taking a warning away undoes a sanction, so it goes only from strictly above, like .adv.
  for (const n of [300, 301]) {
    F.initDataDB({ chat: G, sender: `${n}@lid`, senderJid: "" });
    F.setRolGrupo(G, `${n}@lid`, "mod", "100@lid");
    F.setAdvertencias(`${n}@lid`, G, 2);
  }
  const comoModerador = (text, mentionedJid) =>
    Unwarn.run({ ...m(text, { mentionedJid }), sender: "300@lid" }, { client: conexion.client, text, command: "unwarn", usedPrefix: ".", participants, isOwner: false, isWaAdmin: false });
  await comoModerador("@300", ["300@lid"]);
  assert.match(ultimo(), /Tus propias advertencias no te las podés sacar vos/);
  await comoModerador("@301", ["301@lid"]);
  assert.match(ultimo(), /No le puedo sacar la advertencia: es moderador/);
  assert.deepEqual([F.advertenciasDe("300@lid", G), F.advertenciasDe("301@lid", G)], [2, 2]);
  // A WhatsApp admin can.
  await correr(Unwarn, "@301", { mentionedJid: ["301@lid"] });
  assert.equal(F.advertenciasDe("301@lid", G), 1);
});

// With "numeros" (lib/menciones.js), the owner asked for the numbers: everyone by theirs, in a group too, with what
// they're called in brackets; "nombres" names them by their WhatsApp name.
test("la lista de advertidos con «numeros»: el número de cada uno, también en un grupo", async () => {
  F.setAdvertencias("111@lid", G, 2);
  F.setAdvertencias("222@lid", H, 1);
  await Lista.run(m("numeros"), { client: conexion.client, text: "numeros" });
  assert.match(ultimo(), /│ \+5989911111 \(Fulano\) \*\(2\/3\)\*/);
  await Lista.run(m("numeros", { chat: H }), { client: conexion.client, text: "numeros" });
  assert.match(ultimo(), /│ \+5989911222 \(alguien\) \*\(1\/3\)\*/);
  await Lista.run(m("nombres"), { client: conexion.client, text: "nombres" });
  assert.match(ultimo(), /│ Fulano \*\(2\/3\)\*/);
  assert.doesNotMatch(ultimo(), /5989911111/);
});

// By WhatsApp name with no word, as .cumples (a nickname from the shop can be anything); "nombre" says the same,
// "alias" goes by nickname and "numero" by number (lib/menciones.js). In a group and from the owner's private chat.
test("la lista de advertidos va por nombre de WhatsApp; con «alias», el apodo; con «numero», el número", async (t) => {
  F.setAdvertencias("111@lid", G, 2);
  F.updateUser("111@lid", { apodo: "Fula" });
  t.after(() => F.updateUser("111@lid", { apodo: "" }));
  const pedir = async (text, chat = G, isGroup = true) => {
    await Lista.run({ ...m(text, { chat }), isGroup }, { client: conexion.client, text });
    assert.equal(ultimoEnviado()?.msg?.mentions, undefined, `sin arrobar (${text || "sin palabra"})`);
    return ultimo();
  };
  assert.match(await pedir(""), /│ Fulano \(Fula\) \*\(2\/3\)\*/);
  assert.equal(await pedir("nombre"), await pedir(""));
  assert.match(await pedir("alias"), /│ Fula \*\(2\/3\)\*/);
  assert.match(await pedir("Número"), /│ \+5989911111 \(Fula\) \*\(2\/3\)\*/);
  assert.match(await pedir("", "59899111222@s.whatsapp.net", false), /│ Fulano \(Fula\) \*\(2\/3\)\* · /, "por privado también");
});

// The list used to be the owner's everywhere, and in no menu: now the moderators and the admins, who give and take the
// warnings, see their group's. From a private chat it's still the owner's alone, with no code of its own: the roles are
// a group's (lib/roles.js), so in a private chat nobody else is a moderator.
test(".listaadv la ven los moderadores y los admins en el grupo, y por privado solo el owner", async () => {
  const { permisosDe } = await import("../lib/roles.js");
  assert.deepEqual([Lista.onlyMod, Lista.onlyOwner, Lista.onlyGroup], [true, undefined, undefined]);
  const privado = "59899111222@s.whatsapp.net";
  assert.equal(permisosDe(privado, "100@lid").isMod, false, "un admin de un grupo no es moderador en privado");
  assert.equal(permisosDe(privado, "100@lid", { esOwner: true }).isMod, true);
});

// The third warning removes: it announces it, asks WhatsApp, and only then touches the count. A second third warning in
// between read the same count, and announced and removed all over again: nobody types .adv that fast, but the anti-flood
// gives warnings on its own in the middle of a burst (plugins/_antiflood.js), and a moderator may be typing .adv at the
// same flood. One place gives them all (lib/advertencias.js), and it lets one removal through at a time.
test("dos terceras advertencias a la vez lo sacan una sola vez", async () => {
  const { darAdvertencia } = await import("../lib/advertencias.js");
  F.setAdvertencias("222@lid", G, 2);
  const anotadas = () => F.antecedentesDe("222@lid", G).total;
  const antes = anotadas();
  // WhatsApp takes its time to answer the removal.
  const responder = conexion.client.groupParticipantsUpdate;
  let contestar;
  const espera = new Promise((r) => (contestar = r));
  conexion.client.groupParticipantsUpdate = async (chat, ...a) => (chat === G && (await espera), responder(chat, ...a));
  try {
    const deClaudia = { motivo: "flood", dadoPor: "999@lid", expulsarA: "222@lid" };
    // What each of these gives, or "sigue esperando" if it was left waiting for WhatsApp too: awaited as it is, that
    // hung the test instead of failing it.
    const pronto = (promesa) => Promise.race([promesa, esperar(200).then(() => "sigue esperando")]);
    const primera = darAdvertencia(conexion.client, G, "222@lid", deClaudia);
    assert.deepEqual(await pronto(darAdvertencia(conexion.client, G, "222@lid", deClaudia)), { advertencias: 3, saliendo: true }, "otra del anti-flood, en el medio");
    assert.deepEqual(await pronto(darAdvertencia(conexion.client, G, "5989911222@s.whatsapp.net", deClaudia)), { advertencias: 3, saliendo: true }, "nombrada por su número, es la misma persona");
    // Another group's removal is another matter: it doesn't wait for this one.
    F.setAdvertencias("222@lid", H, 2);
    assert.deepEqual(await pronto(darAdvertencia(conexion.client, H, "222@lid", deClaudia)), { advertencias: 3, expulsion: { ok: true, status: "200" } });
    assert.deepEqual(expulsiones, [{ chat: H, ids: ["222@lid"], accion: "remove" }]);
    expulsiones = [];
    await pronto(correr(Warn, "@222 flood", { mentionedJid: ["222@lid"] }));
    assert.equal(ultimo(), "Ya lo estoy sacando: con la advertencia anterior llegó a 3.", "y el .adv de un moderador");
    assert.deepEqual([expulsiones.length, anotadas() - antes, F.advertenciasDe("222@lid", G)], [0, 0, 2], "nada cambió todavía");

    contestar();
    assert.deepEqual(await primera, { advertencias: 3, expulsion: { ok: true, status: "200" } });
  } finally {
    conexion.client.groupParticipantsUpdate = responder;
  }
  assert.deepEqual(expulsiones, [{ chat: G, ids: ["222@lid"], accion: "remove" }], "una sola expulsión");
  assert.equal(globalThis.enviados.filter((e) => e.chat === G && /SERÁS ELIMINAD/.test(e.msg?.text)).length, 1, "anunciada una sola vez en este grupo");
  assert.deepEqual([anotadas() - antes, F.advertenciasDe("222@lid", G)], [1, 0], "una anotada, y la cuenta en cero");

  // Once it's over, the next third warning goes through like any other.
  F.setAdvertencias("222@lid", G, 2);
  await correr(Warn, "@222 otra vez", { mentionedJid: ["222@lid"] });
  assert.equal(expulsiones.length, 2);
  assert.equal(F.advertenciasDe("222@lid", G), 0);
});

// The third warning removes by the id the group lists the person under, which is the one WhatsApp takes. In a group
// that lists people by number, the id of their row (their LID, where the count is kept) came back with an error status
// that nobody read: announced, and still there.
test("a la tercera lo saca por el id con que el grupo lo lista, no por el de su fila", async () => {
  const porNumero = [
    { id: "5989911111@s.whatsapp.net", lid: "111@lid", admin: null },
    { id: "999@lid", admin: "admin" },
  ];
  F.setAdvertencias("111@lid", G, 2);
  const text = "@111 otra vez";
  await Warn.run(m(text, { mentionedJid: ["111@lid"] }), { client: conexion.client, text, command: "adv", usedPrefix: ".", participants: porNumero, isOwner: false, isWaAdmin: true });
  assert.deepEqual(expulsiones, [{ chat: G, ids: ["5989911111@s.whatsapp.net"], accion: "remove" }]);
  assert.equal(F.advertenciasDe("111@lid", G), 0);
});

// .adv answers the command it was given, quoting it: the warning, the announcement of the removal and, if WhatsApp says
// no, that too. The anti-flood's warning, which nobody typed, quotes nothing (test/antiflood.test.mjs).
test(".adv contesta citando el comando: la advertencia, el anuncio de la expulsión y el aviso de que no lo dejaron", async () => {
  const citados = [];
  const enviar = conexion.client.sendText;
  conexion.client.sendText = (chat, text, quoted, opciones) => (citados.push(quoted?.text), enviar(chat, text, quoted, opciones));
  try {
    await correr(Warn, "@222 spam", { mentionedJid: ["222@lid"] });
    F.setAdvertencias("222@lid", G, 2);
    statusExpulsion = "403";
    await correr(Warn, "@222 insultos", { mentionedJid: ["222@lid"] });
  } finally {
    conexion.client.sendText = enviar;
  }
  assert.deepEqual(citados, ["@222 spam", "@222 insultos", "@222 insultos"]);
  assert.match(ultimo(), /^No me dejaron echarlo \(error 403\)/);
});
