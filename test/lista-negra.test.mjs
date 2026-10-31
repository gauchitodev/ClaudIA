import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";
import strings from "../lib/strings.js";
import { owner, unaLid, unNumero, digitos } from "./identidad-escenarios.mjs";
// Loaded with the file, as the bot has it by the time anyone asks: lidSegunWhatsApp imports Baileys the first time it
// asks WhatsApp, and inside the first test that asks, under a time limit of its own, loading it was most of that
// test's time, the more the slower the machine: 10.6 s against its 10 with the CPU at 12%.
import "@whiskeysockets/baileys";

let F, LN, B, P, Manejador;

// What WhatsApp answers on removal: "200" is ok. Another can be forced to test the rejection path.
let expulsiones = [];
let statusExpulsion = "200";

before(async () => {
  ({ F } = await prepararBase("lista-negra"));
  globalThis.txt = strings;
  globalThis.client.decodeJid = (j) => j;
  globalThis.client.user.lid = "999000@lid";
  LN = await import("../lib/lista-negra.js");
  B = await import("../lib/bienvenida.js");
  P = (await import("../plugins/grupo-lista-negra.js")).default;
  Manejador = (await import("../plugins/_manejador-lista-negra.js")).default;
});

// Put back before each test: the sweep's test swaps it for its own, and in another order a rejected removal came out
// accepted.
beforeEach(() => {
  expulsiones = [];
  statusExpulsion = "200";
  globalThis.enviados = [];
  db.exec("DELETE FROM lista_negra");
  globalThis.client.groupParticipantsUpdate = async (chat, ids, accion) => {
    expulsiones.push({ chat, ids, accion });
    return ids.map((jid) => ({ status: statusExpulsion, jid }));
  };
});

// The group lists everyone by LID. 111 is the only one whose number WhatsApp sent; 222 joined and never wrote.
const participants = [
  { id: "100@lid", admin: "superadmin", phoneNumber: "59899100100@s.whatsapp.net" },
  { id: "111@lid", admin: null, phoneNumber: "59899111111@s.whatsapp.net" },
  { id: "222@lid", admin: null },
  { id: "999000@lid", admin: "admin" },
];

const mensaje = (extra = {}) => ({
  chat: G,
  isGroup: true,
  sender: "100@lid",
  senderJid: "59899100100@s.whatsapp.net",
  mentionedJid: [],
  quoted: null,
  react: async () => {},
  delete: async () => {},
  ...extra,
});

// Run by 100, the group's creator, as the dispatcher would pass it along.
const correr = (command, text, extra = {}, opciones = {}) =>
  P.run(mensaje(extra), { client: globalThis.client, text, command, usedPrefix: ".", participants, isBotAdmin: true, isOwner: false, isWaAdmin: true, ...opciones });

const ultimo = () => ultimoEnviado()?.msg?.text || "";

test("por número: lo anota y lo expulsa con el LID, que es el id con el que el grupo lo lista", async () => {
  await correr("ln", "+59899111111 spam");

  const entrada = F.isBlacklisted("59899111111@s.whatsapp.net", G);
  assert.ok(entrada, "quedó anotado");
  assert.equal(entrada.reason, "spam");
  assert.equal(entrada.lid, "111@lid", "guardó el LID para reconocerlo después");
  assert.deepEqual(expulsiones, [{ chat: G, ids: ["111@lid"], accion: "remove" }]);
});

test("por mención: a quien nunca escribió se lo anota igual y se lo echa", async () => {
  // 222 has no users row and no number in the metadata: the command used to bail out with "no record of the user".
  await correr("ln", "@222 molesta", { mentionedJid: ["222@lid"] });

  const entrada = F.isBlacklisted("222@lid", G);
  assert.ok(entrada, "se anota por LID cuando no se conoce el número");
  assert.equal(entrada.reason, "molesta");
  assert.deepEqual(expulsiones, [{ chat: G, ids: ["222@lid"], accion: "remove" }]);
});

test("si WhatsApp rechaza la expulsión, lo dice en el grupo en vez de callarse", async () => {
  statusExpulsion = "403";
  await correr("ln", "+59899111111 spam");

  assert.equal(expulsiones.length, 1);
  assert.match(ultimo(), /no me dejó echarlo \(error 403\)/);
});

test("sin admin lo anota y avisa que no puede echarlo", async () => {
  await correr("ln", "+59899111111 spam", {}, { isBotAdmin: false });

  assert.ok(F.isBlacklisted("59899111111@s.whatsapp.net", G), "queda anotado igual");
  assert.equal(expulsiones.length, 0);
  assert.match(ultimo(), /no lo puedo echar porque no soy admin/);
});

test("si no está en el grupo, queda anotado para cuando entre", async () => {
  await correr("ln", "+59899555555 spam");

  assert.ok(F.isBlacklisted("59899555555@s.whatsapp.net", G));
  assert.equal(expulsiones.length, 0);
  assert.match(ultimo(), /lo echo apenas entre/);
});

test("a un admin del grupo no se lo puede anotar", async () => {
  await correr("ln", "+59899100100 porque sí", { sender: "111@lid", senderJid: "59899111111@s.whatsapp.net" });

  assert.equal(F.isBlacklisted("59899100100@s.whatsapp.net", G), null);
  assert.match(ultimo(), /No se puede meter a un admin/);
});

test("un admin del bot no puede anotar a otro admin del bot, pero sí a un miembro", async () => {
  // The WhatsApp-admin rule was already here; the bot's own roles follow the same one (lib/roles.js).
  F.setRolGrupo(G, "555@lid", "admin", "100@lid");
  F.setRolGrupo(G, "556@lid", "admin", "100@lid");
  const comoAdminDelBot = { sender: "555@lid", senderJid: "" };

  await correr("ln", "@556 le cae mal a alguien", { ...comoAdminDelBot, mentionedJid: ["556@lid"] }, { isWaAdmin: false });
  assert.match(ultimo(), /No lo puedo anotar: es admin del bot\. Eso lo puede hacer un admin de WhatsApp/);
  assert.equal(F.isBlacklisted("556@lid", G), null);

  await correr("ln", "@111 spam", { ...comoAdminDelBot, mentionedJid: ["111@lid"] }, { isWaAdmin: false });
  assert.ok(F.isBlacklisted("111@lid", G), "a un miembro sí");
});

test("quien está anotado por número se reconoce por su LID cuando escribe", async () => {
  F.addToBlacklist("59899111111@s.whatsapp.net", "spam", "100@s.whatsapp.net", G);

  // The message arrives with the LID only, no number: this is the case that was never detected before.
  const m = mensaje({ sender: "111@lid", senderJid: "", messageStubType: null });
  const frenado = await Manejador.before(m, { client: globalThis.client, participants, isBotAdmin: true, isRAdmin: false });

  assert.equal(frenado, true);
  assert.deepEqual(expulsiones, [{ chat: G, ids: ["111@lid"], accion: "remove" }]);
  assert.match(ultimo(), /estaba en la lista negra/);
  assert.equal(F.isBlacklisted("59899111111@s.whatsapp.net", G).lid, "111@lid", "de paso aprende el LID");
});

// What Baileys 7 actually hands to group-participants.update: objects, not strings (Socket/messages-recv.js builds
// them as { id, phoneNumber, lid, username, admin }). The first version of this test passed bare ids, a shape the
// event never has, and so it never saw that every real join threw.
const entran = (...ids) => ids.map((id) => ({ id, phoneNumber: id === "111@lid" ? "59899111111@s.whatsapp.net" : undefined, lid: undefined, username: undefined, admin: null }));

test("al entrar al grupo se lo echa sin esperar a que escriba", async () => {
  F.addToBlacklist("59899111111@s.whatsapp.net", "spam", "100@s.whatsapp.net", G, "111@lid");

  const nuevos = entran("111@lid", "222@lid");
  const { expulsados, fallados } = await LN.expulsarDeListaNegra(globalThis.client, G, nuevos, participants);

  assert.equal(expulsados.length, 1);
  assert.equal(fallados.length, 0);
  assert.equal(expulsados[0].original, nuevos[0], "devuelve la entrada del evento, que es lo que se compara después");
  assert.deepEqual(expulsiones, [{ chat: G, ids: ["111@lid"], accion: "remove" }]);
});

// ---------- someone joins: lib/bienvenida.js ----------
// This used to be inline in main.js, out of reach of any test. The bug it hid: the blacklist step threw on every
// join, and since the rules went out after it, the welcome stopped going out too in every group where the bot is admin.

const conReglas = () => {
  db.prepare("INSERT OR IGNORE INTO chats (remoteJid) VALUES (?)").run(G);
  F.updateChat(G, { reglas: "Nada de spam." });
};
const bienvenida = () => globalThis.enviados.find((e) => /Bienvenid@s/.test(e.msg?.text || ""))?.msg;

test("al entrar: el anotado sale y los demás reciben las reglas", async () => {
  conReglas();
  F.addToBlacklist("59899111111@s.whatsapp.net", "spam", "100@s.whatsapp.net", G, "111@lid");

  await B.recibirNuevos(globalThis.client, G, entran("111@lid", "222@lid"), { participants });

  assert.deepEqual(expulsiones, [{ chat: G, ids: ["111@lid"], accion: "remove" }]);
  assert.deepEqual(bienvenida()?.mentions, ["222@lid"], "la bienvenida es solo para el que no está anotado");
});

test("al entrar: si la lista negra falla, la bienvenida sale igual", async () => {
  conReglas();
  const errorReal = console.error;
  console.error = () => {};
  try {
    // Metadata that can't be read: the blacklist step blows up, whatever the reason.
    await B.recibirNuevos(globalThis.client, G, entran("222@lid"), { participants: "roto" });
  } finally {
    console.error = errorReal;
  }
  assert.deepEqual(bienvenida()?.mentions, ["222@lid"], "un error en la lista negra no se lleva puesta la bienvenida");
});

test("al entrar: si el bot no es admin no echa a nadie, pero da la bienvenida", async () => {
  conReglas();
  F.addToBlacklist("59899111111@s.whatsapp.net", "spam", "100@s.whatsapp.net", G, "111@lid");
  const sinAdmin = participants.map((p) => (p.id === "999000@lid" ? { ...p, admin: null } : p));

  await B.recibirNuevos(globalThis.client, G, entran("111@lid"), { participants: sinAdmin });

  assert.deepEqual(expulsiones, [], "sin ser admin no lo puede echar");
  assert.deepEqual(bienvenida()?.mentions, ["111@lid"], "lo echará el manejador cuando escriba, si le dan admin al bot");
});

test("la lista de todos los grupos vale en cualquier grupo, y la del grupo no se filtra a otro", async () => {
  F.addToBlacklist("59899111111@s.whatsapp.net", "spam", "owner@s.whatsapp.net", "*", "111@lid");
  F.addToBlacklist("59899222222@s.whatsapp.net", "spam", "100@s.whatsapp.net", G);

  assert.ok(F.isBlacklisted("111@lid", "otro@g.us"), "la global vale en cualquier grupo");
  assert.equal(F.isBlacklisted("59899222222@s.whatsapp.net", "otro@g.us"), null, "la del grupo no");
});

test(".ln2 saca a la persona anotada por LID o por número", async () => {
  F.addToBlacklist("59899111111@s.whatsapp.net", "spam", "100@s.whatsapp.net", G, "111@lid");

  await correr("ln2", "@111", { mentionedJid: ["111@lid"] });
  assert.equal(F.isBlacklisted("59899111111@s.whatsapp.net", G), null, "lo sacó mencionándolo por LID");
});

// In a group the whole group reads .vln: each one by name, without tagging them, and without their number or the number
// of whoever listed them, which it used to show. Someone on it is out of the group by then and can't be mentioned, so
// .ln2 takes them off by their number in the list. The owner's private chat keeps the numbers.
test(".vln en un grupo nombra sin números ni menciones, y .ln2 saca por el número de la lista", async () => {
  // People of their own, whom no other test here names.
  F.initDataDB({ chat: G, sender: "511@lid", senderJid: "59899511511@s.whatsapp.net", pushName: "Beto" });
  F.initDataDB({ chat: G, sender: "512@lid", senderJid: "59899512512@s.whatsapp.net", pushName: "Ana" });
  F.addToBlacklist("59899511511@s.whatsapp.net", "estafa", "59899512512@s.whatsapp.net", G, "511@lid");
  F.addToBlacklist("59899333333@s.whatsapp.net", "spam", "59899512512@s.whatsapp.net", G);
  F.addToBlacklist("59899444444@s.whatsapp.net", "de todos", "owner", "*");
  await correr("vln", "");
  const lista = ultimoEnviado().msg;
  assert.doesNotMatch(lista.text, /5989\d|@\d/, "ni números ni LID");
  assert.equal(lista.mentions, undefined, "y no arroba a nadie");
  assert.match(lista.text, /\d\. Beto\n📝 Razón: estafa\n👤 Añadido por: Ana\n/);
  assert.match(lista.text, /Para sacar a alguien: \.ln2 <su número en esta lista>$/);

  const numeroDe = (patron) => lista.text.match(new RegExp(`(\\d+)\\. ${patron}`))[1];
  const [deBeto, delOtro, delGlobal] = [numeroDe("Beto"), numeroDe("alguien\\n📝 Razón: spam"), numeroDe("alguien 🌐")];
  await correr("ln2", deBeto);
  assert.equal(ultimo(), "☑️ Saqué de la lista negra a Beto.");
  assert.equal(F.isBlacklisted("59899511511@s.whatsapp.net", G), null, "lo saca el número de la lista");
  assert.ok(F.isBlacklisted("59899333333@s.whatsapp.net", G), "y a nadie más");
  // The numbers are the ones on screen, though one came off since.
  await correr("ln2", delGlobal);
  assert.match(ultimo(), /lista negra de todos los grupos: solo la puede sacar el dueño/);
  await correr("ln2", deBeto);
  assert.match(ultimo(), new RegExp(`No hay ningún ${deBeto} en la lista negra de este grupo: ya lo sacaron`));
  await correr("ln2", delOtro);
  assert.equal(F.isBlacklisted("59899333333@s.whatsapp.net", G), null);
  await correr("ln2", "9");
  assert.match(ultimo(), /No hay ningún 9 en la lista negra de este grupo\./);

  await P.run(mensaje({ chat: PRIVADO_VLN, isGroup: false }), { client: globalThis.client, text: "", command: "vln", usedPrefix: ".", participants: [], isBotAdmin: true, isOwner: true, isWaAdmin: false });
  assert.match(ultimo(), /\+59899444444/, "por privado, el owner ve los números");
});
const PRIVADO_VLN = "59899100100@s.whatsapp.net";

// Without a recent .vln, ".ln2 2" took the second one of the list as it was then: if someone had come off it since,
// that was someone else than the one on the admin's screen.
test(".ln2 con un número, sin una .vln de la última media hora, pide mirar la lista de nuevo", async () => {
  F.initDataDB({ chat: G, sender: "601@lid", senderJid: "59899000601@s.whatsapp.net", pushName: "Carla" });
  F.addToBlacklist("59899000601@s.whatsapp.net", "uno", "", G, "601@lid");
  globalThis.listaNegraMostrada.delete(G);
  await correr("ln2", "1");
  assert.match(ultimo(), /^Mirá la lista negra con \.vln y después usá \.ln2 con el número que aparece ahí/);
  assert.ok(F.isBlacklisted("59899000601@s.whatsapp.net", G), "no sacó a nadie");

  await correr("vln", "");
  globalThis.listaNegraMostrada.get(G).fecha -= 31 * 60 * 1000; // half an hour went by
  await correr("ln2", "1");
  assert.match(ultimo(), /^Mirá la lista negra con \.vln/);
  assert.ok(F.isBlacklisted("59899000601@s.whatsapp.net", G));
});

// In a group listed by number the mention comes by number, and the reason kept "@59899… estafa": the whole group reads
// the reason in .vln.
test("en un grupo por número, el motivo de .ln no guarda el número de la persona", async () => {
  const porNumero = [
    { id: "59899100100@s.whatsapp.net", lid: "100@lid", admin: "superadmin" },
    { id: "59899555555@s.whatsapp.net", lid: "555@lid", admin: null },
    { id: "59899999000@s.whatsapp.net", lid: "999000@lid", admin: "admin" },
  ];
  F.initDataDB({ chat: G, sender: "555@lid", senderJid: "59899555555@s.whatsapp.net", pushName: "Beto" });
  F.initDataDB({ chat: G, sender: "300000000000004@lid", senderJid: "", pushName: "Dani" });
  await correr("ln", "@59899555555 estafa, lo vio @300000000000004", { mentionedJid: ["59899555555@s.whatsapp.net", "300000000000004@lid"] }, { participants: porNumero });
  assert.deepEqual(F.getBlacklist(G).map((e) => e.reason), ["estafa, lo vio @Dani"], "y otra mención, con su nombre");
});

// By number, the reason kept the LID of whoever else it mentioned; and one from before the reasons left the listed
// person out showed their number to the whole group in .vln. The owner, in private, sees it as it was written.
test(".ln por número también nombra a los otros mencionados, y .vln no muestra el número de un motivo viejo", async () => {
  F.initDataDB({ chat: G, sender: "300000000000005@lid", senderJid: "", pushName: "Eli" });
  await correr("ln", "+59899666666 le debe plata a @300000000000005", { mentionedJid: ["300000000000005@lid"] });
  assert.deepEqual(F.getBlacklist(G).map((e) => e.reason), ["le debe plata a @Eli"]);
  db.exec("DELETE FROM lista_negra");

  F.initDataDB({ chat: G, sender: "577@lid", senderJid: "59899577577@s.whatsapp.net", pushName: "Gabi" });
  F.addToBlacklist("59899577577@s.whatsapp.net", "@59899577577 estafa, lo vio @300000000000005", "59899100100@s.whatsapp.net", G, "577@lid");
  await correr("vln", "");
  assert.match(ultimo(), /\d\. Gabi\n📝 Razón: estafa, lo vio @Eli\n/);
  assert.doesNotMatch(ultimo(), /5989|@3000/, "ni su número ni la LID del otro");
  await P.run(mensaje({ chat: PRIVADO_VLN, isGroup: false }), { client: globalThis.client, text: "", command: "vln", usedPrefix: ".", participants: [], isBotAdmin: true, isOwner: true, isWaAdmin: false });
  assert.match(ultimo(), /📝 Razón: @59899577577 estafa, lo vio @300000000000005\n/);
});

// Typed all together, the number ends where its digits do: ".ln +59899666666 2 veces me estafó" listed 598996666662,
// someone else, with "veces me estafó". Spaced out, the number is every group of digits.
test(".ln por número no se come los dígitos que siguen", async () => {
  await correr("ln", "+59899666666 2 veces me estafó");
  assert.deepEqual(F.getBlacklist(G).map((e) => [e.jid, e.reason]), [["59899666666@s.whatsapp.net", "2 veces me estafó"]]);
  db.exec("DELETE FROM lista_negra");
  await correr("ln", "+598 99 666 667 spam");
  assert.deepEqual(F.getBlacklist(G).map((e) => [e.jid, e.reason]), [["59899666667@s.whatsapp.net", "spam"]]);
});

// Who goes on the list is right after the command, the number or the mention, and anything further on is the reason:
// ".ln @persona le robó a +598…" listed the number's owner and removed them, and then ".ln el +598… le robó a @persona"
// the one robbed. With nobody right after the command it asks for them there, and replying to someone else's message
// with someone named further on it asks too: whoever wrote it may be who was meant, or the one named. Replying to the
// bot's message or one's own, the reply names nobody.
test(".ln anota a quien va justo después del comando, el número o la mención, y si no pregunta", async () => {
  const anotados = () => F.getBlacklist(G).map((e) => [e.lid, e.reason]);
  await correr("ln", "@222 le robó la plata a +59899111111", { mentionedJid: ["222@lid"] });
  assert.deepEqual(anotados(), [["222@lid", "le robó la plata a +59899111111"]]);
  assert.deepEqual(expulsiones, [{ chat: G, ids: ["222@lid"], accion: "remove" }]);
  db.exec("DELETE FROM lista_negra");
  await correr("ln", "+59899111111 le robó a @222", { mentionedJid: ["222@lid"] });
  assert.deepEqual(anotados(), [["111@lid", "le robó a @222"]], "con el número primero, es el número");
  db.exec("DELETE FROM lista_negra");
  await correr("ln", "spam", { quoted: { sender: "222@lid" } });
  assert.deepEqual(anotados(), [["222@lid", "spam"]], "respondiendo, quien escribió el mensaje");
  db.exec("DELETE FROM lista_negra");
  expulsiones = [];

  const pedirAdelante = "Poné a quién anotar justo después de .ln: .ln @persona motivo o .ln +59899999999 motivo.";
  for (const [texto, extra] of [
    ["el +59899111111 le robó a @222", { mentionedJid: ["222@lid"] }],
    ["estafó con el +59899111111 a @222", { mentionedJid: ["222@lid"] }],
    ["estafa, su número es +59899111111", {}],
    ["estafa @222", { mentionedJid: ["222@lid"] }],
    ["estafador, su número es +59899111111", { quoted: { sender: "999000@lid" } }],
    ["estafador, su número es +59899111111", { quoted: { sender: "100@lid" } }],
  ]) {
    await correr("ln", texto, extra);
    assert.equal(ultimo(), pedirAdelante, texto);
  }
  for (const [texto, extra] of [
    ["cuidado con +59899111111", { quoted: { sender: "222@lid" } }],
    ["le robó a @111", { mentionedJid: ["111@lid"], quoted: { sender: "222@lid" } }],
  ]) {
    await correr("ln", texto, extra);
    assert.match(ultimo(), /^No sé a quién anotar: si a quien escribió el mensaje que respondiste o a quien nombrás en el texto\. Poné primero a quién \(\.ln @persona motivo o \.ln \+59899999999 motivo\), o respondé el mensaje sin nombrar a nadie más\.$/, texto);
  }
  assert.deepEqual(anotados(), [], "no anotó a nadie");
  assert.deepEqual(expulsiones, [], "ni sacó a nadie");

  F.addToBlacklist("222@lid", "spam", "100@s.whatsapp.net", G, "222@lid");
  await correr("ln2", "ya no @222", { mentionedJid: ["222@lid"] });
  assert.equal(ultimo(), "Poné a quién sacar justo después de .ln2: .ln2 @persona o .ln2 +59899999999.");
  assert.ok(F.isBlacklisted("222@lid", G), "y no sacó a nadie");
  await P.run(mensaje({ chat: PRIVADO_VLN, isGroup: false }), { client: globalThis.client, text: "estafa +59899111111", command: "ln", usedPrefix: ".", participants: [], isBotAdmin: true, isOwner: true, isWaAdmin: false });
  assert.equal(ultimo(), "Poné a quién anotar justo después de .ln: .ln +59899999999 motivo.", "por privado no hay a quién mencionar");
});

// An old reason in the group: the listed person's own LID goes, a longer number that holds their digits isn't cut into
// (it goes whole, as anybody else's number), and someone the bot doesn't know is "@alguien", as a reason given now
// names them: the digits of their LID were in sight.
test(".vln en el grupo: un motivo viejo sin la LID de la persona ni la de un desconocido", async () => {
  F.initDataDB({ chat: G, sender: "300000000000578@lid", senderJid: "59899578578@s.whatsapp.net", pushName: "Dani" });
  F.addToBlacklist("59899578578@s.whatsapp.net", "@300000000000578 molesta, como el 598995785789 y el 159899578578, y lo vio @300000000000777", "59899100100@s.whatsapp.net", G, "300000000000578@lid");
  await correr("vln", "");
  assert.match(ultimo(), /📝 Razón: molesta, como el \(número oculto\) y el \(número oculto\), y lo vio @alguien\n/);
});

// Anybody else's number doesn't show in the group either, with its "+" or as a long run of digits: the whole group
// reads .vln, and an entry of the all-groups list was written by the owner in private, where they still see it whole.
// An e-mail address isn't a mention ("pepe@12345.com" was "pepe@alguien.com"), and neither is an "@" before fewer than
// five digits.
test(".vln en el grupo no muestra números de otros, y deja los mails y lo que no es una mención", async () => {
  F.addToBlacklist("59899579579@s.whatsapp.net", "le vendió a +59899777777 y a +598 99 777 778, la cuenta 300000000000779, escribe desde pepe@12345.com, entradas a @2000 y $ 50000, +1000 de recargo", "59899100100@s.whatsapp.net", "*");
  await correr("vln", "");
  assert.match(ultimo(), /📝 Razón: le vendió a \(número oculto\) y a \(número oculto\), la cuenta \(número oculto\), escribe desde pepe@12345\.com, entradas a @2000 y \$ 50000, \+1000 de recargo\n/);
  await P.run(mensaje({ chat: PRIVADO_VLN, isGroup: false }), { client: globalThis.client, text: "", command: "vln", usedPrefix: ".", participants: [], isBotAdmin: true, isOwner: true, isWaAdmin: false });
  assert.match(ultimo(), /📝 Razón: le vendió a \+59899777777 y a \+598 99 777 778, la cuenta 300000000000779, /);
});

// Leaving out every "@" after a letter for the e-mails left "x@59899123456" and somebody's LID in sight, and a number
// written as people write them, with a leading 0, parentheses, dots or two separators, or glued to a word, showed
// whole. An amount with its thousands' dots and a date stay.
test(".vln en el grupo tapa los números como se escriben, y una @ pegada a una palabra", async () => {
  const motivos = ["le escribió x@59899123456", "cuenta 3@300000000000779", "foo.@59899123456", "le vendió al 099 123 456", "le vendió al 099-123-456", "le vendió al (099) 123 456", "le vendió al +598 (99) 123 456", "le vendió al +598 - 99 - 123 456", "le vendió al +598.99.123.456", "le vendió al 099.123.456", "le vendió al 2 123 4567", "cel59899123456", "59899123456abc", "escribe desde pepe@12345.com", "le debe 15.000.000", "le debe 1 500 000", "el 23/10/2026 y el 2026-10-23", "+1000 de recargo"];
  for (const [i, motivo] of motivos.entries()) F.addToBlacklist(`5989800${String(i).padStart(4, "0")}@s.whatsapp.net`, motivo, "59899100100@s.whatsapp.net", G);
  await correr("vln", "");
  const razones = [...ultimo().matchAll(/📝 Razón: (.*)\n/g)].map((r) => r[1]).sort(); // added in the same millisecond
  assert.deepEqual(razones, ["le escribió x@alguien", "cuenta 3@alguien", "foo.@alguien", ...Array(8).fill("le vendió al (número oculto)"), "cel(número oculto)", "(número oculto)abc", "escribe desde pepe@12345.com", "le debe 15.000.000", "le debe 1 500 000", "el 23/10/2026 y el 2026-10-23", "+1000 de recargo"].sort());
});

// Spaced out or with dashes, the reason may start with digits too: "+598 99 666 666 2 veces me estafó" listed
// 598996666662, and "+59899666 666", taken as typed all together, 59899666. The cut that is someone the bot knows wins;
// with none, the only one that makes a whole number; with more than one, it asks.
test(".ln por número con espacios: el corte que es alguien conocido, el único número entero, o pregunta", async () => {
  const anotado = () => F.getBlacklist(G).map((e) => [e.jid, e.reason]);
  const conocido = [...participants, { id: "666@lid", admin: null, phoneNumber: "59899666666@s.whatsapp.net" }];
  await correr("ln", "+598 99 666 666 2 veces me estafó", {}, { participants: conocido });
  assert.deepEqual(anotado(), [["59899666666@s.whatsapp.net", "2 veces me estafó"]]);
  assert.deepEqual(expulsiones, [{ chat: G, ids: ["666@lid"], accion: "remove" }]);
  db.exec("DELETE FROM lista_negra");
  for (const texto of ["+598 99 666 666 2 veces me estafó", "+598 99666666 3 veces", "+598-99-666-666 4 veces"]) {
    await correr("ln", texto);
    assert.deepEqual(anotado(), [], texto);
    assert.match(ultimo(), /^No sé dónde termina el número: puede ser \+59899666666 o \+59899666666\d\. Mandalo todo junto, sin espacios, y el motivo después, que no empiece con un número\.$/, texto);
  }
  await correr("ln2", "+598 99 666 666 2");
  assert.match(ultimo(), /^No sé dónde termina el número: .*\. Mandalo todo junto, sin espacios\.$/);
  await correr("ln", "+59899666 666 spam");
  assert.deepEqual(anotado(), [["59899666666@s.whatsapp.net", "spam"]], "ocho dígitos juntos no son un número entero");
  db.exec("DELETE FROM lista_negra");
  await correr("ln", "+59899666666 - me estafó");
  assert.deepEqual(anotado(), [["59899666666@s.whatsapp.net", "me estafó"]], "sin el guion");
  db.exec("DELETE FROM lista_negra");
  // Two cuts that are two people in the group: as unclear as none.
  const dos = [...conocido, { id: "667@lid", admin: null, phoneNumber: "598996666662@s.whatsapp.net" }];
  await correr("ln", "+598 99 666 666 2 veces me estafó", {}, { participants: dos });
  assert.match(ultimo(), /^No sé dónde termina el número: puede ser \+59899666666 o \+598996666662\./);
  // Past 15 digits no cut is a number: the options end there, and a long run of spaced digits doesn't hold the bot.
  await correr("ln", "+598 99 666 667 1 2 3 4 5 6 7");
  assert.match(ultimo(), /puede ser \+59899666667, \+598996666671, \+5989966666712, \+59899666667123 o \+598996666671234\./);
  const antes = performance.now();
  await correr("ln", `+5 ${"1 ".repeat(30000)}`);
  assert.ok(performance.now() - antes < 300, `tardó ${Math.round(performance.now() - antes)} ms`);
  assert.deepEqual(anotado(), []);
});

// Eight or nine digits typed together and a reason that starts with a digit: the digit went with the number (".ln
// +50012345 2 veces" listed 500123452), and asked about, typing it all together again didn't help. A cut someone has
// may be the number and the reason's digits when a shorter cut is a whole number too: ".ln +43 664 123456 7 veces"
// listed and removed whoever had 436641234567. A comma or a long dash after the number stayed at the reason's start.
test(".ln por número: ocho dígitos y un motivo con dígitos, un conocido que puede ser número y motivo, y la puntuación", async () => {
  const anotado = () => F.getBlacklist(G).map((e) => [e.jid, e.reason]);
  for (const texto of ["+50012345 2 veces", "+500 12345 2 veces"]) {
    await correr("ln", texto);
    assert.equal(ultimo(), "No sé dónde termina el número: puede ser +50012345 o +500123452. Mandalo todo junto, sin espacios, y el motivo después, que no empiece con un número.", texto);
  }
  await correr("ln", "+50012345 estafa");
  assert.deepEqual(anotado(), [["50012345@s.whatsapp.net", "estafa"]], "con un solo corte posible, ese");
  db.exec("DELETE FROM lista_negra");
  const conLargo = [...participants, { id: "333@lid", admin: null, phoneNumber: "436641234567@s.whatsapp.net" }];
  await correr("ln", "+43 664 123456 7 veces", {}, { participants: conLargo });
  assert.match(ultimo(), /^No sé dónde termina el número: puede ser \+43664123456 o \+436641234567\./);
  assert.deepEqual([anotado(), expulsiones], [[], []]);
  // Someone the bot knows by the number: in the database, from having written, or in a group that lists people by
  // number.
  F.initDataDB({ chat: G, sender: "300000000000951@lid", senderJid: "59899666951@s.whatsapp.net", pushName: "Beto" });
  await correr("ln", "+598 99 666 951 2 veces");
  assert.deepEqual(anotado(), [["59899666951@s.whatsapp.net", "2 veces"]], "conocido por la base");
  db.exec("DELETE FROM lista_negra");
  const porNumero = [{ id: "59899100100@s.whatsapp.net", lid: "100@lid", admin: "superadmin" }, { id: "59899666952@s.whatsapp.net", lid: "300000000000952@lid", admin: null }, { id: globalThis.client.user.jid, lid: "999000@lid", admin: "admin" }];
  await correr("ln", "+598 99 666 952 3 veces", {}, { participants: porNumero });
  assert.deepEqual(anotado(), [["59899666952@s.whatsapp.net", "3 veces"]], "conocido en un grupo por número");
  db.exec("DELETE FROM lista_negra");
  db.prepare("INSERT INTO users (lid, jid, pushName) VALUES (?, ?, ?)").run("59899@s.whatsapp.net", "59899@s.whatsapp.net", "x"); // too short a number
  await correr("ln", "+598 99 666 951 2 veces");
  assert.deepEqual(anotado(), [["59899666951@s.whatsapp.net", "2 veces"]], "una fila con un número demasiado corto no cuenta");
  db.exec("DELETE FROM lista_negra");
  const dosConocidos = [...participants, { id: "953@lid", admin: null, phoneNumber: "50012345@s.whatsapp.net" }, { id: "954@lid", admin: null, phoneNumber: "50012345678@s.whatsapp.net" }];
  await correr("ln", "+500 12345 678 spam", {}, { participants: dosConocidos });
  assert.match(ultimo(), /^No sé dónde termina el número: puede ser \+50012345 o \+50012345678\./, "dos conocidos");
  await correr("ln", "+683 1234 5 veces");
  assert.match(ultimo(), /^No sé dónde termina el número: puede ser \+6831234 o \+68312345\./, "siete dígitos ya pueden ser un número");
  await correr("ln", "+598 99 5 spam");
  assert.deepEqual(anotado(), [["598995@s.whatsapp.net", "spam"]], "sin ningún corte que pueda ser un número, todos");
  for (const texto of ["+59899666666, estafa", "+59899666666: estafa", "+59899666666 – estafa", "+59899666666 — estafa"]) {
    db.exec("DELETE FROM lista_negra");
    await correr("ln", texto);
    assert.deepEqual(anotado(), [["59899666666@s.whatsapp.net", "estafa"]], texto);
  }
});

// ---------- all-groups list, from the owner's private chat ----------
// It used to sweep only the groups whose participants were in memory at that moment: after a change invalidated a
// group's copy, or for someone who joined after it was taken, it skipped them without a word, and it never said where
// the person was removed from.

const PRIVADO = "59899100100@s.whatsapp.net";
const desdeElPrivado = (text) =>
  P.run(mensaje({ chat: PRIVADO, isGroup: false }), { client: globalThis.client, text, command: "ln", usedPrefix: ".", participants: [], isBotAdmin: true, isOwner: true, isWaAdmin: false });
const bot = { id: "999000@lid", admin: "admin" };
const anotado = { id: "111@lid", admin: null, phoneNumber: "59899111111@s.whatsapp.net" };

test("lista de todos los grupos: le pide los grupos a WhatsApp, lo saca de donde está y le cuenta al dueño", async () => {
  globalThis.client.chats = {}; // nothing in memory: the old sweep found no group at all
  globalThis.client.groupFetchAllParticipating = async () => ({
    "a@g.us": { id: "a@g.us", subject: "Grupo A", participants: [anotado, bot] },
    "b@g.us": { id: "b@g.us", subject: "Grupo B", participants: [anotado, bot] },
    "c@g.us": { id: "c@g.us", subject: "Grupo C", participants: [anotado, { ...bot, admin: null }] },
    "d@g.us": { id: "d@g.us", subject: "Grupo D", participants: [{ id: "222@lid", admin: null }, bot] },
  });
  globalThis.client.groupParticipantsUpdate = async (chat, ids, accion) => {
    expulsiones.push({ chat, ids, accion });
    return ids.map((jid) => ({ status: chat === "b@g.us" ? "403" : "200", jid }));
  };

  await desdeElPrivado("+59899111111 estafa");
  assert.ok(F.isBlacklisted("59899111111@s.whatsapp.net", "*"), "quedó en la lista de todos los grupos");
  assert.deepEqual(
    expulsiones,
    [
      { chat: "a@g.us", ids: ["111@lid"], accion: "remove" },
      { chat: "b@g.us", ids: ["111@lid"], accion: "remove" },
    ],
    "donde el bot no es admin ni lo intenta, y donde no está no hace nada",
  );
  assert.equal(ultimo(), "Anotado en la lista negra de todos los grupos.\nLo saqué de: Grupo A.\nNo lo pude sacar de: Grupo B (error 403), Grupo C (no soy admin). Ahí sacalo a mano.");
  assert.equal(globalThis.client.chats["d@g.us"]?.metadata?.subject, "Grupo D", "la consulta de paso llenó la caché");
});

test("lista de todos los grupos: si no está en ninguno, o WhatsApp no pasa los grupos, lo dice", async () => {
  globalThis.client.groupFetchAllParticipating = async () => ({ "d@g.us": { id: "d@g.us", subject: "Grupo D", participants: [bot] } });
  await desdeElPrivado("+59899111111 estafa");
  assert.equal(ultimo(), "Anotado en la lista negra de todos los grupos.\nNo está en ninguno de mis grupos ahora: lo echo apenas entre en uno.");

  db.exec("DELETE FROM lista_negra");
  globalThis.client.groupFetchAllParticipating = async () => {
    throw new Error("timed out");
  };
  await desdeElPrivado("+59899111111 estafa");
  assert.ok(F.isBlacklisted("59899111111@s.whatsapp.net", "*"), "queda anotado igual");
  assert.match(ultimo(), /WhatsApp no me pasó la lista de grupos, así que no lo saqué de ninguno/);
  assert.deepEqual(expulsiones, []);
});

test("a un admin de WhatsApp o a un dueño anotados no se los echa cuando escriben", async () => {
  // .ln by number can't see whose number it is when the group doesn't send it: a bot admin listed a WhatsApp admin like
  // that, and this hook removed them on their next message. It only let the group's creator through.
  F.addToBlacklist("59899777777@s.whatsapp.net", "molesta", "555@s.whatsapp.net", G);
  let borrado = false;
  const m = mensaje({ sender: "777@lid", senderJid: "59899777777@s.whatsapp.net", messageStubType: null, delete: async () => (borrado = true) });
  for (const rango of [{ isWaAdmin: true }, { isOwner: true }]) {
    assert.equal(await Manejador.before(m, { client: globalThis.client, participants, isBotAdmin: true, isRAdmin: false, ...rango }), undefined);
  }
  assert.deepEqual(expulsiones, []);
  assert.equal(borrado, false);
  // Without admin, the same person is removed, as before.
  assert.equal(await Manejador.before(m, { client: globalThis.client, participants, isBotAdmin: true, isRAdmin: false }), true);
  assert.deepEqual(expulsiones, [{ chat: G, ids: ["777@lid"], accion: "remove" }]);
});

// The notice goes to the whole group: it names whoever was removed, never by their number or their LID, which the group
// may not show.
test("el aviso de que lo saqué lo nombra, sin su número ni su LID", async () => {
  F.addToBlacklist("59899111111@s.whatsapp.net", "spam", "100@s.whatsapp.net", G);
  F.initDataDB({ chat: G, sender: "111@lid", senderJid: "59899111111@s.whatsapp.net", pushName: "Pedro" });
  await Manejador.before(mensaje({ sender: "111@lid", senderJid: "59899111111@s.whatsapp.net", messageStubType: null }), { client: globalThis.client, participants, isBotAdmin: true, isRAdmin: false });
  assert.equal(ultimo(), "*[⚠️] Saqué a Pedro: estaba en la lista negra.*\n\n*[❗] Razón:* spam");

  // Someone the bot has no name for.
  F.addToBlacklist("333@lid", "molesta", "100@s.whatsapp.net", G);
  await Manejador.before(mensaje({ sender: "333@lid", senderJid: "", messageStubType: null }), { client: globalThis.client, participants, isBotAdmin: true, isRAdmin: false });
  assert.equal(ultimo(), "*[⚠️] Saqué a alguien: estaba en la lista negra.*\n\n*[❗] Razón:* molesta");
});

// ---------- a number that moved on ----------
// A number the database still has on whoever had it before (recycled, or its owner changed numbers) is whoever the
// group lists with it now. ".ln +número" listed the database's LID: the one meant was removed then and got back in as
// soon as they came with their own LID, and whoever had had the number stayed listed. From private, with no group to
// tell, the entry keeps no LID, rather than the database's guess: the number says it.
test(".ln por número anota a quien el grupo lista con él, no a quien la base recuerda", async () => {
  const [ANTES, AHORA, X] = ["300000000000901@lid", "300000000000902@lid", "59899000901@s.whatsapp.net"];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(ANTES, X, "Antes", 1); // wrote with X, long ago
  const conAhora = [...participants, { id: AHORA, admin: null, phoneNumber: X }];
  await correr("ln", "+59899000901 estafa", {}, { participants: conAhora });
  assert.deepEqual(F.getBlacklist(G).map((e) => [e.jid, e.lid]), [[X, AHORA]]);
  assert.deepEqual(expulsiones, [{ chat: G, ids: [AHORA], accion: "remove" }]);
  expulsiones = [];
  await B.recibirNuevos(globalThis.client, G, [{ id: AHORA, phoneNumber: X, admin: null }], { participants: conAhora });
  assert.deepEqual(expulsiones.map((e) => e.ids), [[AHORA]], "al volver, se lo echa");
  assert.equal(F.isBlacklisted([ANTES, "59899000909@s.whatsapp.net"], G), null, "y quien lo tuvo antes no quedó anotado");

  // A group that lists people by number brings the LID apart.
  db.exec("DELETE FROM lista_negra");
  const porNumero = [{ id: "59899100100@s.whatsapp.net", lid: "100@lid", admin: "superadmin" }, { id: X, lid: AHORA, admin: null }, { id: globalThis.client.user.jid, lid: "999000@lid", admin: "admin" }];
  await correr("ln", "+59899000901 estafa", {}, { participants: porNumero });
  assert.deepEqual(F.getBlacklist(G).map((e) => [e.jid, e.lid]), [[X, AHORA]], "en un grupo por número");

  db.exec("DELETE FROM lista_negra");
  globalThis.client.groupFetchAllParticipating = async () => ({ "e@g.us": { id: "e@g.us", subject: "Grupo E", participants: [{ id: ANTES, admin: null, phoneNumber: "59899000909@s.whatsapp.net" }, { id: AHORA, admin: null, phoneNumber: X }, bot] } });
  expulsiones = [];
  await desdeElPrivado("+59899000901 estafa");
  assert.deepEqual(F.getBlacklist("*").map((e) => [e.jid, e.lid]), [[X, null]], "por privado, sin la LID de la base");
  assert.deepEqual(expulsiones, [{ chat: "e@g.us", ids: [AHORA], accion: "remove" }], "y de cada grupo saca a quien tiene el número");
  expulsiones = [];
  await B.recibirNuevos(globalThis.client, G, [{ id: AHORA, phoneNumber: X, admin: null }], { participants: conAhora });
  assert.deepEqual(expulsiones.map((e) => e.ids), [[AHORA]]);
});

// Someone listed by number joins a group by number whose event doesn't bring the LID: removed, and the entry used to
// record the LID the database knew for the number, a guess that may be whoever had it before. The next time the one
// listed came with their own LID, they got in.
test("al entrar sin la LID, la entrada no se queda con la que la base recuerda para el número", async () => {
  const [ANTES, AHORA, X] = ["300000000000911@lid", "300000000000912@lid", "59899000911@s.whatsapp.net"];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(ANTES, X, "Antes", 1);
  F.addToBlacklist(X, "estafa", "100@s.whatsapp.net", G);
  const yo = { id: globalThis.client.user.jid, admin: "admin" };
  await B.recibirNuevos(globalThis.client, G, [{ id: X, admin: null }], { participants: [{ id: X, admin: null }, yo] });
  assert.deepEqual(expulsiones.map((e) => e.ids), [[X]]);
  assert.deepEqual(F.getBlacklist(G).map((e) => [e.jid, e.lid]), [[X, null]]);
  expulsiones = [];
  await B.recibirNuevos(globalThis.client, G, [{ id: AHORA, phoneNumber: X, admin: null }], { participants: [{ id: AHORA, phoneNumber: X, admin: null }, { id: "999000@lid", admin: "admin" }] });
  assert.deepEqual(expulsiones.map((e) => e.ids), [[AHORA]], "con su LID también");
  assert.deepEqual(F.getBlacklist(G).map((e) => [e.jid, e.lid]), [[X, AHORA]], "y esa sí la aprende: vino con la persona");
});

// The person's row may still have the number they left, now someone else's, who the group may list first: looking for
// either id in the group's order, ".ln @persona" removed the number's owner now instead of the one mentioned.
test(".ln @persona saca a la persona aunque su fila tenga un número que ya es de otro", async () => {
  const [A, OTRO, X] = ["300000000000921@lid", "300000000000922@lid", "59899000921@s.whatsapp.net"];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(A, X, "A", 1);
  const grupo = [participants[0], { id: OTRO, admin: null, phoneNumber: X }, { id: A, admin: null, phoneNumber: "59899000929@s.whatsapp.net" }, participants.at(-1)];
  await correr("ln", "@300000000000921 estafa", { mentionedJid: [A] }, { participants: grupo });
  assert.deepEqual(expulsiones, [{ chat: G, ids: [A], accion: "remove" }]);
});

// ".ln @persona" keeps the entry under the person's number, with their LID. Once the number was someone else's, listing
// that one (same group, same key) wrote over it, and the first person came off the list without a word.
test("anotar a quien tiene ahora un número no le saca la entrada a quien lo tuvo antes", async () => {
  const [A, NUEVO, X] = ["300000000000931@lid", "300000000000932@lid", "59899000931@s.whatsapp.net"];
  const escribe = (sender, senderJid) => {
    const m = { chat: G, sender, senderJid, pushName: "x" };
    F.initDataDB(m);
    F.syncUserInfo(m);
  };
  const conDos = [...participants, { id: A, admin: null }, { id: NUEVO, admin: null }];
  escribe(A, X);
  await correr("ln", "@300000000000931 estafa", { mentionedJid: [A] }, { participants: conDos });
  assert.deepEqual(F.getBlacklist(G).map((e) => [e.jid, e.lid]), [[X, A]], "bajo su número");
  escribe(A, "59899000939@s.whatsapp.net"); // A changed numbers
  assert.deepEqual(F.getBlacklist(G).map((e) => [e.jid, e.lid]), [[A, A]], "deja el número y se lleva la entrada");
  escribe(NUEVO, X);
  await correr("ln", "@300000000000932 spam", { mentionedJid: [NUEVO] }, { participants: conDos });
  assert.ok(F.isBlacklisted([A, "59899000939@s.whatsapp.net"], G), "A sigue anotado");
  assert.ok(F.isBlacklisted([NUEVO, X], G), "y el dueño nuevo del número también");

  // An entry with someone else's LID that stayed under the number (its LID came with them when they joined, and the
  // database never had them with it): it goes under that LID, and the new one gets the number.
  db.exec("DELETE FROM lista_negra");
  F.addToBlacklist(X, "uno", "100@s.whatsapp.net", G, "300000000000933@lid");
  F.addToBlacklist(X, "dos", "100@s.whatsapp.net", G, NUEVO);
  assert.deepEqual(F.getBlacklist(G).map((e) => [e.jid, e.lid, e.reason]).sort(), [["300000000000933@lid", "300000000000933@lid", "uno"], [X, NUEVO, "dos"]]);

  // From private the LID is only the database's (the number's owner now): the new entry doesn't keep it, and it still
  // tells that the one under the number is someone else's.
  F.addToBlacklist(X, "tres", "100@s.whatsapp.net", "*", "300000000000933@lid");
  globalThis.client.groupFetchAllParticipating = async () => ({});
  await desdeElPrivado("+59899000931 cuatro");
  assert.deepEqual(F.getBlacklist("*").map((e) => [e.jid, e.lid, e.reason]).sort(), [["300000000000933@lid", "300000000000933@lid", "tres"], [X, null, "cuatro"]]);
});

// In private .vln shows each entry by its key: the number, or the LID once its number went to someone else. Typed back
// it's that entry: by the person's identities, one kept under a number that is someone else's now came out "no estaba",
// and one under a LID couldn't be named at all, since there's no mentioning anybody there.
test("por privado, .ln2 saca la entrada como la muestra .vln", async () => {
  const [A, NUEVO, C, X] = ["300000000000941@lid", "300000000000942@lid", "300000000000943@lid", "59899000941@s.whatsapp.net"];
  F.initDataDB({ chat: G, sender: NUEVO, senderJid: X, pushName: "Nuevo" });
  F.syncUserInfo({ chat: G, sender: NUEVO, senderJid: X, pushName: "Nuevo" });
  F.addToBlacklist(A, "uno", "59899100100@s.whatsapp.net", "*", A);
  F.addToBlacklist(X, "dos", "59899100100@s.whatsapp.net", "*", C);
  const enPrivado = (command, text) => P.run(mensaje({ chat: PRIVADO, isGroup: false }), { client: globalThis.client, text, command, usedPrefix: ".", participants: [], isBotAdmin: true, isOwner: true, isWaAdmin: false });
  await enPrivado("vln", "");
  assert.match(ultimo(), /\d\. @300000000000941 🌐 todos los grupos\n/);
  assert.match(ultimo(), /\d\. \+59899000941 🌐 todos los grupos\n/);
  await enPrivado("ln2", "@300000000000941");
  await enPrivado("ln2", "+59899000941");
  assert.deepEqual(F.getBlacklist("*"), [], "salieron las dos");
  globalThis.enviados = [];
  await enPrivado("ln2", "@300000000000949");
  assert.equal(ultimo(), "Esa persona no estaba en la lista negra.");
  await enPrivado("ln2", "saquen a +59899000941");
  assert.equal(ultimo(), "Poné a quién sacar justo después de .ln2: .ln2 +59899999999, o como lo muestra .vln.");
});

// In a group that doesn't list numbers, or from private, the database's LID for a typed number was all the bot had, and
// it may be whoever had the number before: they were removed, and an entry kept without a LID went to them as soon as
// the number's owner now wrote (seguirALaPersona). WhatsApp is asked who has it (USync's LID query), only when the
// group doesn't say, and that one is listed, removed and kept on the entry. With no answer in time it goes on as
// before. With its own time limit: if the code stopped putting one on the question WhatsApp doesn't answer, this would
// wait for it, and hang until npm test's 120 s instead of failing.
test(".ln por número le pregunta a WhatsApp quién lo tiene, si el grupo no lo dice", { timeout: 10_000 }, async (t) => {
  const I = await import("../lib/identidad.js");
  const [VIEJO, NUEVO, X] = ["300000000000961@lid", "300000000000962@lid", "59899000961@s.whatsapp.net"];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(VIEJO, X, "Viejo", 1);
  const consultas = [];
  let responde = async () => ({ list: [{ id: X, lid: "300000000000962:3@lid" }], sideList: [] }); // with a device, even
  globalThis.client.executeUSyncQuery = (consulta) => (consultas.push(consulta), responde());
  const consultaReal = I.IDENTIDAD?.CONSULTA_MS;
  t.after(() => {
    delete globalThis.client.executeUSyncQuery;
    if (I.IDENTIDAD) I.IDENTIDAD.CONSULTA_MS = consultaReal;
  });
  const sinNumeros = [participants[0], { id: VIEJO, admin: null }, { id: NUEVO, admin: null }, participants.at(-1)];
  await correr("ln", "+59899000961 estafa", {}, { participants: sinNumeros });
  assert.deepEqual(F.getBlacklist(G).map((e) => [e.jid, e.lid]), [[X, NUEVO]]);
  assert.deepEqual(expulsiones, [{ chat: G, ids: [NUEVO], accion: "remove" }]);
  // The question Baileys itself asks for a number it has no LID for (pnFromLIDUSync, Socket/socket.js).
  const [consulta] = consultas;
  assert.deepEqual([consultas.length, consulta.protocols.map((p) => p.name), consulta.users.map((u) => u.id), consulta.context], [1, ["lid"], [X], "background"]);

  // From private the entry keeps it too, and the number's owner writing doesn't hand it to whoever had it before.
  db.exec("DELETE FROM lista_negra");
  globalThis.client.groupFetchAllParticipating = async () => ({});
  await desdeElPrivado("+59899000961 estafa");
  assert.deepEqual(F.getBlacklist("*").map((e) => [e.jid, e.lid]), [[X, NUEVO]]);
  const m = { chat: G, isGroup: true, sender: NUEVO, senderJid: X, pushName: "Nuevo", delete: async () => {}, react: async () => {} };
  F.initDataDB(m);
  F.syncUserInfo(m);
  assert.deepEqual(F.getBlacklist("*").map((e) => [e.jid, e.lid]), [[X, NUEVO]], "sigue siendo de quien tiene el número");

  // A group that lists who has the number needs no question.
  db.exec("DELETE FROM lista_negra");
  consultas.length = 0;
  await correr("ln", "+59899111111 spam");
  assert.equal(consultas.length, 0);

  // With WhatsApp not answering in time, failing or not saying, the database's guess, as before, and not kept.
  I.IDENTIDAD.CONSULTA_MS = 20;
  for (const sinRespuesta of [() => new Promise(() => {}), async () => Promise.reject(new Error("timed out")), async () => ({ list: [{ id: X }] }), async () => ({ list: [{ id: X, lid: X }] })]) {
    db.exec("DELETE FROM lista_negra");
    responde = sinRespuesta;
    expulsiones = [];
    await correr("ln", "+59899000961 estafa", {}, { participants: sinNumeros });
    assert.deepEqual([F.getBlacklist(G).map((e) => [e.jid, e.lid]), expulsiones.map((e) => e.ids)], [[[X, null]], [[NUEVO]]]);
  }
  assert.equal(await I.lidSegunWhatsApp({ executeUSyncQuery: async () => ({ list: [{ id: X, lid: X }] }) }, X), null, "un número no es una LID");
  assert.equal(await I.lidSegunWhatsApp({}, X), null, "sin cómo preguntar");
});

// "@<digits>" typed by hand right after .ln, not picked from WhatsApp's list, is who goes on the list, as with the
// other commands: replying to a message, it fell to the quoted one's author, and ".ln @59899… estafa" answering
// whoever warned about the scammer listed and removed them. .ln2 took the quoted one off the list the same way.
test(".ln @<número tipeado> respondiendo a alguien anota a ese número, no a quien escribió el mensaje", async () => {
  F.initDataDB({ chat: G, sender: "111@lid", senderJid: "59899111111@s.whatsapp.net", pushName: "A" });
  await correr("ln", "@59899777777 estafa", { quoted: { sender: "111@lid" } });
  assert.deepEqual([F.getBlacklist(G).map((e) => [e.jid, e.reason]), expulsiones], [[["59899777777@s.whatsapp.net", "estafa"]], []]);
  db.exec("DELETE FROM lista_negra");
  await correr("ln", "@222 spam", { quoted: { sender: "111@lid" } }); // the digits of a LID the group lists
  assert.deepEqual([F.getBlacklist(G).map((e) => e.jid), expulsiones.map((e) => e.ids)], [["222@lid"], [["222@lid"]]]);
  F.addToBlacklist("59899111111@s.whatsapp.net", "otra cosa", "admin", G, "111@lid");
  await correr("ln2", "@222", { quoted: { sender: "111@lid" } });
  assert.deepEqual(F.getBlacklist(G).map((e) => e.jid), ["59899111111@s.whatsapp.net"]);
});

// A mention or a quoted message that comes by number, as a group that lists people by number brings them, is asked
// about as a typed number is: kept without a LID, the entry went to whoever had the number before as soon as its owner
// now wrote anywhere (seguirALaPersona), and they were the one removed when they came to write.
test(".ln con una mención o un mensaje citado por número le pregunta a WhatsApp quién lo tiene", async (t) => {
  const [VIEJO, NUEVO, X] = ["300000000000971@lid", "300000000000972@lid", "59899000971@s.whatsapp.net"];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(VIEJO, X, "Viejo", 1);
  globalThis.client.executeUSyncQuery = async () => ({ list: [{ id: X, lid: NUEVO }] });
  t.after(() => delete globalThis.client.executeUSyncQuery);
  const porNumero = [participants[0], { id: X, admin: null }, participants.at(-1)];
  await correr("ln", "@59899000971 spam", { mentionedJid: [X] }, { participants: porNumero });
  assert.deepEqual([F.getBlacklist(G).map((e) => [e.jid, e.lid]), expulsiones.map((e) => e.ids)], [[[X, NUEVO]], [[X]]]);
  const escribe = { chat: "otro@g.us", isGroup: true, sender: NUEVO, senderJid: X, pushName: "Nuevo" };
  F.initDataDB(escribe);
  F.syncUserInfo(escribe);
  assert.deepEqual(F.getBlacklist(G).map((e) => [e.jid, e.lid]), [[X, NUEVO]], "no pasa a VIEJO cuando NUEVO escribe");
  db.exec("DELETE FROM lista_negra");
  await correr("ln", "spam", { quoted: { sender: X } }, { participants: porNumero });
  assert.deepEqual(F.getBlacklist(G).map((e) => [e.jid, e.lid]), [[X, NUEVO]], "citado por número");
});

// With WhatsApp not saying who has a number, .ln doesn't list it where the group lists the database's guess with
// another number: the person moved on to it. Listed and removed, or kept by the number alone, the entry went to them
// as soon as the number's owner wrote. From private the sweep leaves them alone in such a group.
test(".ln por número no anota ni echa a quien la base recuerda si el grupo lo lista con otro número", async (t) => {
  const [VIEJO, X, Y] = ["300000000000981@lid", "59899000981@s.whatsapp.net", "59899000989@s.whatsapp.net"];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(VIEJO, X, "Viejo", 1);
  globalThis.client.executeUSyncQuery = async () => ({ list: [{ id: X }] }); // it answers, without a LID
  t.after(() => delete globalThis.client.executeUSyncQuery);
  const conOtroNumero = [participants[0], { id: VIEJO, phoneNumber: Y, admin: null }, participants.at(-1)];
  await correr("ln", "+59899000981 estafa", {}, { participants: conOtroNumero });
  assert.deepEqual([F.getBlacklist(G), expulsiones], [[], []]);
  assert.match(ultimo(), /^No sé de quién es ese número ahora/);
  globalThis.client.groupFetchAllParticipating = async () => ({ "otro@g.us": { id: "otro@g.us", subject: "Otro", participants: [{ id: VIEJO, phoneNumber: Y, admin: null }, bot] } });
  await desdeElPrivado("+59899000981 estafa");
  assert.deepEqual(expulsiones, []);
});

// The owners are left alone by the list as for their powers (esOwnerConfirmado), joining and writing: by what comes
// with them and by the number the group lists them with. By their rows, someone else's that still had an owner's number
// got in past the list, and was removed only once they wrote; and an owner WhatsApp hadn't confirmed yet, whose event
// and messages bring only their LID, was removed by an entry under their number, from whoever had it before.
test("la lista negra deja en paz a los dueños como para sus poderes, al entrar y al escribir", async (t) => {
  // AJENA, someone else's row that still has the owner's number, listed in the group.
  const o = owner(t, 830, { filaAjena: true });
  F.addToBlacklist(o.AJENA, "estafa", "100@lid", G, o.AJENA);
  await LN.expulsarDeListaNegra(globalThis.client, G, [{ id: o.AJENA }], [...participants, { id: o.AJENA, admin: null }]);
  const visto = { ajenaAlEntrar: expulsiones.map((e) => e.ids[0]) };
  // Another owner, whose row has no number and whom WhatsApp hasn't confirmed yet: their number was listed back when it
  // was someone else's, and the group lists them with it.
  const [OL, Z] = [unaLid(831), unNumero(831)];
  globalThis.owners = [...globalThis.owners, digitos(Z)];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, '', 'Dueño', 1)").run(OL);
  F.addToBlacklist(Z, "el que tenía el número antes", "100@lid", G);
  const conDueno = [...participants, { id: OL, phoneNumber: Z, admin: null }];
  expulsiones = [];
  await LN.expulsarDeListaNegra(globalThis.client, G, [{ id: OL }], conDueno);
  visto.duenoAlEntrar = expulsiones.length;
  await Manejador.before(mensaje({ sender: OL, senderJid: "", messageStubType: null }), { client: globalThis.client, participants: conDueno, isBotAdmin: true, isRAdmin: false, isWaAdmin: false, isOwner: false });
  visto.duenoAlEscribir = expulsiones.length;
  assert.deepEqual(visto, { ajenaAlEntrar: [o.AJENA], duenoAlEntrar: 0, duenoAlEscribir: 0 });
});
