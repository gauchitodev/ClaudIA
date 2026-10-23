import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";
import strings from "../lib/strings.js";

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

// An old reason in the group: the listed person's own LID goes, a longer number that holds their digits stays, and
// someone the bot doesn't know is "@alguien", as a reason given now names them: the digits of their LID were in sight.
test(".vln en el grupo: un motivo viejo sin la LID de la persona ni la de un desconocido", async () => {
  F.initDataDB({ chat: G, sender: "300000000000578@lid", senderJid: "59899578578@s.whatsapp.net", pushName: "Dani" });
  F.addToBlacklist("59899578578@s.whatsapp.net", "@300000000000578 molesta, como el 598995785789 y el 159899578578, y lo vio @300000000000777", "59899100100@s.whatsapp.net", G, "300000000000578@lid");
  await correr("vln", "");
  assert.match(ultimo(), /📝 Razón: molesta, como el 598995785789 y el 159899578578, y lo vio @alguien\n/);
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
