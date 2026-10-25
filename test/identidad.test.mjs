import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Database from "better-sqlite3";
import { prepararBase, G, fijarSaldo, ultimoEnviado, esperar } from "./helpers.mjs";
import { numeroReciclado, filaVieja, owner, botEnGrupo, usyncFalso, mensaje, unaLid, unNumero, digitos } from "./identidad-escenarios.mjs";

// Who is who (lib/identidad.js, lib/menciones.js and the database's rows): what is right today and had no test of its
// own, and, as todo, what is wrong today, each with the tanda that fixes it (the identity frontier plan). A tanda takes
// the todo off its cases, and they fail first against the code before it.

let F, I, M, R, S, P;
before(async () => {
  ({ F } = await prepararBase("identidad"));
  globalThis.txt = (await import("../lib/strings.js")).default;
  I = await import("../lib/identidad.js");
  M = await import("../lib/menciones.js");
  R = await import("../lib/roles.js");
  S = await import("../database-schema.js");
  const plugin = async (nombre) => (await import(`../plugins/${nombre}.js`)).default;
  P = {
    regalar: await plugin("coins-regalar"),
    llamar: await plugin("grupo-llamar"),
    besar: await plugin("fun-besar"),
    silenciar: await plugin("grupo-silenciar"),
    kick: await plugin("grupo-kick"),
    id: await plugin("owner-get-user-data"),
    bloquear: await plugin("owner-bloquear"),
    addowner: await plugin("owner-add-owner"),
    antiLink: await plugin("_anti-Link-grupos-canales"),
    roles: await plugin("grupo-roles"),
    config: await plugin("grupo-config"),
  };
});

const cliente = () => globalThis.client;

// ---------- right today ----------

test("buscarEnGrupo: la LID gana al número que otro tiene en la lista", () => {
  const { X, VIEJO, NUEVO } = numeroReciclado(1);
  const grupo = [{ id: VIEJO, phoneNumber: X }, { id: NUEVO }];
  assert.equal(I.buscarEnGrupo(grupo, { lid: NUEVO, jid: X }).id, NUEVO);
  assert.equal(I.buscarEnGrupo(grupo, { jid: X }).id, VIEJO, "sin la LID, a quien el grupo lista con el número");
  assert.equal(I.buscarEnGrupo([], { lid: NUEVO }), null);
});

test("esParticipante: por id, por lid o por phoneNumber", () => {
  const [L, X] = [unaLid(2), unNumero(2)];
  for (const p of [{ id: L }, { id: X, lid: L }]) assert.ok(I.esParticipante(p, { lid: L }), JSON.stringify(p));
  for (const p of [{ id: X }, { id: L, phoneNumber: X }]) assert.ok(I.esParticipante(p, { jid: X }), JSON.stringify(p));
  assert.ok(!I.esParticipante({ id: unaLid(3) }, { lid: L, jid: X }));
  assert.ok(!I.esParticipante(null, { lid: L }));
});

test("estaEnGrupo: en un grupo que lista por número, por la lid que trae cada uno", () => {
  const { NUEVO, porNumero } = numeroReciclado(4);
  assert.equal(I.estaEnGrupo(porNumero)(NUEVO), true);
  assert.equal(I.estaEnGrupo(porNumero)(unaLid(5)), false);
});

test("identidadesDe: por LID, por número con el grupo, y por número con la base sola", () => {
  const { X, VIEJO, NUEVO, porLid, porNumero, porNumeroSinLid } = numeroReciclado(6);
  const sin = ({ participante, ...resto }) => ({ ...resto, participante: participante?.id ?? null });
  assert.deepEqual(sin(I.identidadesDe(NUEVO, porLid)), { jid: X, lid: NUEVO, participante: NUEVO, lidDeLaBase: false }, "el número, del grupo");
  assert.deepEqual(sin(I.identidadesDe(X, porNumero)), { jid: X, lid: NUEVO, participante: X, lidDeLaBase: false }, "la LID, de quien el grupo lista con el número");
  assert.deepEqual(sin(I.identidadesDe(X, [])), { jid: X, lid: VIEJO, participante: null, lidDeLaBase: true }, "sin grupo, la de la base: una suposición");
  assert.deepEqual(sin(I.identidadesDe(X, porNumeroSinLid)), { jid: X, lid: VIEJO, participante: X, lidDeLaBase: true });
  assert.deepEqual(I.identidadesDe([], porLid), { jid: null, lid: null, participante: null, lidDeLaBase: false });
});

test("lidEnElGrupo: por la id o por el phoneNumber, y nada si el grupo no lo empareja", () => {
  const { X, NUEVO, porLid, porNumero, porNumeroSinLid } = numeroReciclado(7);
  assert.equal(M.lidEnElGrupo(porLid, X), NUEVO);
  assert.equal(M.lidEnElGrupo(porNumero, X), NUEVO);
  assert.equal(M.lidEnElGrupo(porNumeroSinLid, X), null);
  assert.equal(M.lidEnElGrupo(null, X), null);
});

test("lidDeDigitos: una LID conocida, un número conocido, o se toma como LID", () => {
  const { X, LID } = filaVieja(8);
  assert.equal(M.lidDeDigitos(digitos(LID)), LID);
  assert.equal(M.lidDeDigitos(digitos(X)), LID, "el número, a la fila de la LID y no a la vieja");
  assert.equal(M.lidDeDigitos("123456789"), "123456789@lid");
});

test("deQuienEs: nombrar al bot es preguntar por uno mismo, y un @ que no es mención no es nadie", () => {
  const A = unaLid(9);
  assert.equal(I.deQuienEs(cliente(), mensaje({ sender: A, quoted: { sender: cliente().user.lid } }), "", []), A);
  assert.equal(I.deQuienEs(cliente(), mensaje({ sender: A, quoted: { sender: cliente().user.jid } }), "", []), A);
  assert.equal(I.deQuienEs(cliente(), mensaje({ sender: A }), "", []), A);
  assert.equal(I.deQuienEs(cliente(), mensaje({ sender: A, text: "@Fulano" }), "@Fulano", []), null);
});

test("lidMencionadoActual le pregunta a WhatsApp solo si el grupo no empareja el número", async (t) => {
  const { X, NUEVO, porNumero } = numeroReciclado(10);
  const consultas = usyncFalso(t, { [X]: NUEVO });
  assert.equal(await I.lidMencionadoActual(cliente(), mensaje({ mentionedJid: [X] }), "", porNumero), NUEVO);
  assert.equal(consultas.length, 0, "el grupo ya lo dice");
  assert.equal(await I.lidMencionadoActual(cliente(), mensaje({ mentionedJid: [X] }), "", []), NUEVO, "y la base decía VIEJO");
  assert.equal(consultas.length, 1);
});

test("idsDeOwners: el número de cada owner y las LID de todas sus filas", (t) => {
  const o = owner(t, 11);
  db.prepare(`INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, '', 1)`).run(o.X, o.X); // the one from before LIDs
  assert.deepEqual([...F.idsDeOwners()].sort(), [o.X, o.LID].sort());
});

test("esOwner: con el owner escrito en config.toml con + y espacios", (t) => {
  const o = owner(t, 12, { comoEnConfig: `+598 99 ${digitos(unNumero(12)).slice(5, 8)} ${digitos(unNumero(12)).slice(8)}` });
  assert.ok(F.esOwner(o.X));
  assert.ok(F.esOwner(o.LID));
  assert.ok(!F.esOwner(unaLid(13)));
});

// The day a recycled number's old holder writes again, or a .rd, would be the ones to show otherwise (tanda I4b).
test("una fila con el número del owner hace owner a esa LID (así es hoy: se decide en la tanda I4b)", (t) => {
  const o = owner(t, 14, { filaAjena: true });
  assert.equal(F.esOwner(o.AJENA), true);
});

test("por número se lee la fila de la LID, aunque haya una vieja y una de dispositivo", () => {
  const { X, LID } = filaVieja(15, { dispositivo: true });
  F.updateUserInGroup(LID, G, { messageCount: 7 });
  assert.equal(F.getUser(X).lid, LID);
  assert.equal(F.enGrupoDe(X, G).messageCount, 7);
  assert.equal(F.nombresGuardados(X).pushName, "Persona");
});

test("soloUnaFilaPorNumero trabaja sobre la base que le pasan, no sobre la del bot", () => {
  const otra = new Database(":memory:");
  S.ponerAlDia(otra);
  const X = unNumero(16);
  const insertar = otra.prepare(`INSERT INTO users (lid, jid, timestamp) VALUES (?, ?, ?)`);
  insertar.run(unaLid(16, 1), X, 1);
  insertar.run(unaLid(16, 2), X, 2);
  insertar.run(unaLid(16, 3).replace("@lid", ":12@lid"), X, 3);
  const delBot = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE jid = ''`).get().n;
  assert.deepEqual(F.soloUnaFilaPorNumero(otra), { deDispositivos: 1, repetidos: 1 });
  assert.deepEqual(otra.prepare(`SELECT lid FROM users WHERE jid = ?`).all(X).map((r) => r.lid), [unaLid(16, 2)]);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM users WHERE jid = ''`).get().n, delBot, "la del bot, intacta");
  otra.close();
});

test("los rankings dejan afuera al bot, por su LID y por su número", () => {
  const C = "ranking@g.us";
  fijarSaldo(F, C, cliente().user.lid, 500);
  fijarSaldo(F, C, cliente().user.jid, 400);
  fijarSaldo(F, C, unaLid(17), 10);
  assert.deepEqual(F.topCoins(C).map((r) => r.usuario), [unaLid(17)]);
});

test("rango ve el rol de un moderador guardado por número", () => {
  const C = "rango@g.us";
  F.setRolGrupo(C, unNumero(18), "mod");
  assert.equal(R.rango(C, { lid: unNumero(18) }), 1);
});

test("los escenarios: el bot en un grupo, de las tres formas", () => {
  const { lid, jid } = cliente().user;
  const b = botEnGrupo();
  assert.ok([b.porLid, b.porNumero].every((p) => I.esParticipante(p, { lid })));
  assert.ok([b.porLid, b.porNumero, b.porNumeroSinLid].every((p) => I.esParticipante(p, { jid })));
});

// ---------- wrong today: todo until the tanda that fixes each one ----------

const I3A = { todo: "se arregla en la tanda I3a" };
const I3B = { todo: "se arregla en la tanda I3b" };
const I3C = { todo: "se arregla en la tanda I3c" };

test("un @número tipeado que el grupo empareja es de quien lo tiene ahora, no de la fila vieja (.mute)", I3A, async () => {
  const { X, VIEJO, NUEVO, porLid } = numeroReciclado(20);
  const texto = `@${digitos(X)}`;
  await P.silenciar.run(mensaje({ sender: unaLid(21), text: texto }), { client: cliente(), text: texto, usedPrefix: ".", command: "mute", participants: porLid, isOwner: true, isWaAdmin: true });
  assert.deepEqual([F.getUser(NUEVO).inGroup[G]?.mute, F.getUser(VIEJO).inGroup[G]?.mute], [true, undefined]);
});

test("una mención por LID de alguien sin fila no inventa un número con los dígitos de la LID", I3A, () => {
  const L = unaLid(22);
  const m = mensaje({ sender: unaLid(23), mentionedJid: [L] });
  assert.equal(I.destinatario(m, `@${digitos(L)}`, [{ id: L, phoneNumber: unNumero(22) }]).jid, unNumero(22), "el del grupo");
  assert.equal(I.destinatario(m, `@${digitos(L)}`, [{ id: L }]).jid, null, "ninguno");
});

test(".id de alguien sin fila no muestra los dígitos de su LID como número", I3A, async () => {
  const L = unaLid(24);
  await P.id.run(mensaje({ sender: unaLid(25), mentionedJid: [L] }), { client: cliente(), text: `@${digitos(L)}`, usedPrefix: ".", command: "id", participants: [{ id: L }], isOwner: true });
  assert.doesNotMatch(ultimoEnviado().msg.text, new RegExp(`\\+${digitos(L)}`));
});

test(".bloquear a alguien sin fila no bloquea un número que no existe", I3A, async (t) => {
  const L = unaLid(26);
  const bloqueos = [];
  cliente().updateBlockStatus = async (jid, accion) => bloqueos.push([jid, accion]);
  t.after(() => delete cliente().updateBlockStatus);
  await P.bloquear.run(mensaje({ sender: unaLid(27), mentionedJid: [L] }), { client: cliente(), text: `@${digitos(L)}`, command: "bloquear", participants: [{ id: L }] });
  assert.deepEqual(bloqueos, []);
});

test(".addowner de alguien sin fila no escribe los dígitos de su LID en config.toml", I3A, async (t) => {
  const L = unaLid(28);
  const antes = globalThis.owners;
  t.after(() => {
    globalThis.owners = antes;
  });
  fs.writeFileSync("config.toml", 'owners = ["59899111222"]\n');
  await P.addowner.run(mensaje({ sender: unaLid(29), mentionedJid: [L] }), { client: cliente(), text: `@${digitos(L)}`, usedPrefix: ".", command: "addowner", participants: [{ id: L }] });
  assert.doesNotMatch(fs.readFileSync("config.toml", "utf8"), new RegExp(digitos(L)));
});

test("lidsMencionados con el grupo: una mención por número es de quien el grupo lista con él", I3A, () => {
  const { X, NUEVO, porNumero } = numeroReciclado(30);
  assert.deepEqual(M.lidsMencionados(mensaje({ mentionedJid: [X] }), `@${digitos(X)}`, porNumero), [NUEVO]);
});

test("estaEnGrupo: quien tuvo el número no está en el grupo por él, si el grupo lo lista con otra LID", I3A, () => {
  const { VIEJO, porNumero } = numeroReciclado(31);
  assert.equal(I.estaEnGrupo(porNumero)(VIEJO), false);
});

test(".kick respondiendo un mensaje de quien ya se fue no saca al que tiene ahora su número", I3A, async (t) => {
  const { X, VIEJO, porNumero } = numeroReciclado(32);
  const sacados = [];
  cliente().groupParticipantsUpdate = async (chat, ids) => (sacados.push(...ids), ids.map(() => ({ status: "200" })));
  t.after(() => delete cliente().groupParticipantsUpdate);
  const MOD = unaLid(33);
  const m = mensaje({ sender: MOD, quoted: { sender: VIEJO, delete: async () => {} } });
  await P.kick.run(m, { client: cliente(), participants: [...porNumero, { id: MOD, admin: "admin" }], text: "", groupMetadata: { owner: unaLid(34) }, usedPrefix: ".", command: "kick", isOwner: true, isWaAdmin: true, isAdmin: true });
  assert.ok(!sacados.includes(X), `sacó a ${sacados.join(", ")}`);
});

test(".regalar @número le llega a quien tiene ahora el número", I3B, async () => {
  const { X, VIEJO, NUEVO, porNumero } = numeroReciclado(40);
  const A = unaLid(41);
  fijarSaldo(F, G, A, 100);
  const texto = `@${digitos(X)} 20`;
  await P.regalar.run(mensaje({ sender: A, mentionedJid: [X] }), { client: cliente(), text: texto, args: texto.split(" "), participants: porNumero });
  assert.deepEqual([F.getSaldoCoins(G, NUEVO), F.getSaldoCoins(G, VIEJO)], [20, 0]);
});

test(".llamar @número arroba a quien tiene ahora el número", I3B, async () => {
  const { X, NUEVO, porNumero } = numeroReciclado(42);
  const C = "llamar@g.us";
  globalThis.enviados = [];
  await P.llamar.run(mensaje({ chat: C, sender: unaLid(43), mentionedJid: [X] }), { client: cliente(), text: `@${digitos(X)}`, command: "llamar", participants: porNumero });
  await esperar(30);
  await P.llamar.run(mensaje({ chat: C, sender: unaLid(43) }), { client: cliente(), text: "", command: "cancelar" });
  assert.equal(globalThis.enviados[0]?.msg.text, `@${digitos(NUEVO)}`);
});

test(".besar al bot nombrado por su número: la respuesta de siempre para el bot", I3C, async () => {
  globalThis.enviados = [];
  await P.besar.run(mensaje({ sender: unaLid(50), mentionedJid: [cliente().user.jid] }), { client: cliente(), text: "@bot", usedPrefix: ".", command: "besar" });
  assert.equal(globalThis.enviados.find((e) => e.msg?.text)?.msg.text, globalThis.txt.besarBot);
});

test(".addowner reconoce al owner escrito con + y espacios", I3C, async (t) => {
  const conFormato = "+598 99 000 051";
  const antes = globalThis.owners;
  globalThis.owners = [conFormato];
  t.after(() => {
    globalThis.owners = antes;
  });
  fs.writeFileSync("config.toml", `owners = ["${conFormato}"]\n`);
  await P.addowner.run(mensaje({ sender: unaLid(52) }), { client: cliente(), text: conFormato, usedPrefix: ".", command: "addowner", participants: [] });
  assert.match(ultimoEnviado().msg.text, /ya es owner/);
});

test("el anti-link saca con la id con que el grupo lista a la persona", I3C, async (t) => {
  const { X, NUEVO, porNumero } = numeroReciclado(53);
  const sacados = [];
  cliente().groupParticipantsUpdate = async (chat, ids, accion) => (sacados.push([ids, accion]), ids.map(() => ({ status: "200" })));
  cliente().groupInviteCode = async () => "OTROCODIGO";
  t.after(() => {
    delete cliente().groupParticipantsUpdate;
    delete cliente().groupInviteCode;
  });
  const m = mensaje({ chat: "antilink@g.us", sender: NUEVO, senderJid: X, text: "entren a chat.whatsapp.com/ABCDEFGH" });
  await P.antiLink.before(m, { client: cliente(), participants: porNumero, isMod: false, isBotAdmin: true, isOwner: false, chat: { antiGroups: true, antiDelete: false } });
  assert.deepEqual(sacados, [[[X], "remove"]]);
});

test(".adminbot no se le da a quien no está en el grupo, aunque la base lo conozca", I3C, async () => {
  const C = "adminbot@g.us";
  const L = unaLid(54);
  F.initDataDB({ chat: C, sender: L, senderJid: "", pushName: "Afuera" });
  const DUENO = unaLid(55);
  const texto = `@${digitos(L)}`;
  await P.roles.run(mensaje({ chat: C, sender: DUENO, mentionedJid: [L] }), { client: cliente(), command: "adminbot", args: [texto], text: texto, participants: [{ id: DUENO, admin: "superadmin" }], isOwner: true, isWaAdmin: true, isAdmin: true });
  assert.equal(F.rolGrupo(C, L), null);
});

test(".config muestra una sola vez a quien tiene un rol bajo cada una de sus ids", I3C, async () => {
  const C = "config@g.us";
  const [L, X] = [unaLid(56), unNumero(56)];
  db.prepare(`INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, 'Doble', 1)`).run(L, X);
  const rol = db.prepare(`INSERT INTO roles_grupo (chat, usuario, rol, fecha) VALUES (?, ?, ?, 1)`);
  rol.run(C, X, "mod"); // from before giving a role went by both identities
  rol.run(C, L, "admin");
  await P.config.run(mensaje({ chat: C, sender: unaLid(57) }), { client: cliente(), groupMetadata: { subject: "Grupo", id: C }, chat: {} });
  assert.equal((ultimoEnviado().msg.text.match(new RegExp(`@(${digitos(L)}|${digitos(X)})`, "g")) || []).length, 1);
});

test("al irse quien tiene ahora un número, el que lo tuvo antes no pierde su rol", I3C, () => {
  const C = "salida@g.us";
  const { X, VIEJO, NUEVO } = numeroReciclado(58);
  F.setRolGrupo(C, VIEJO, "mod");
  R.limpiarRolesAlSalir(C, [{ id: X, lid: NUEVO }]);
  assert.equal(F.rolGrupo(C, VIEJO), "mod");
});
