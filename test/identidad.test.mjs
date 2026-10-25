import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import Database from "better-sqlite3";
import { prepararBase, G, fijarSaldo, ultimoEnviado, esperar } from "./helpers.mjs";
import { numeroReciclado, filaVieja, owner, botEnGrupo, usyncFalso, mensaje, unaLid, unNumero, digitos } from "./identidad-escenarios.mjs";

// Who is who (lib/identidad.js, lib/menciones.js and the database's rows): what was right and had no test of its own,
// and what was wrong and got fixed. Each of those was a todo until its tanda of the identity frontier plan, and failed
// first against the code before it.

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
  assert.equal(I.lidEnElGrupo(porLid, X), NUEVO);
  assert.equal(I.lidEnElGrupo(porNumero, X), NUEVO);
  assert.equal(I.lidEnElGrupo(porNumeroSinLid, X), null);
  assert.equal(I.lidEnElGrupo(null, X), null);
});

test("lidDeDigitos: una LID conocida, un número conocido, o se toma como LID", () => {
  const { X, LID } = filaVieja(8);
  assert.equal(I.lidDeDigitos(digitos(LID)), LID);
  assert.equal(I.lidDeDigitos(digitos(X)), LID, "el número, a la fila de la LID y no a la vieja");
  assert.equal(I.lidDeDigitos("123456789"), "123456789@lid");
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

// ---------- one function per question, answering what each caller asked by hand ----------

test("esElBot responde lo mismo que las comparaciones que reemplaza", () => {
  const { lid, jid } = cliente().user;
  const otros = [unaLid(60), unNumero(60), "", null, undefined];
  const b = botEnGrupo();
  // An id: id === lid || id === jid (deQuienEs, nombreDe, .roles, _auto-ia, reactions to Claudia).
  for (const id of [lid, jid, ...otros]) assert.equal(I.esElBot(id), Boolean(id) && (id === lid || id === jid), String(id));
  // A participant: esParticipante(p, { lid, jid }) (.tagall, .inactivos, the ban roulette, the song queue).
  for (const p of [b.porLid, b.porNumero, b.porNumeroSinLid, { id: unaLid(61) }, { id: unNumero(61), lid: unaLid(61) }, null]) {
    assert.equal(I.esElBot(p), I.esParticipante(p, { lid, jid }), JSON.stringify(p));
  }
  // A person's two ids: lid === bot's LID || jid === bot's number (.kick, .advertir, .mute, .demote, .ban, .ln).
  for (const [l, j] of [[lid, null], [null, jid], [lid, jid], [unaLid(62), unNumero(62)], [null, null]]) assert.equal(I.esElBot([l, j]), l === lid || j === jid, `${l} ${j}`);
  assert.equal(I.esElBot(lid, { user: { lid: unaLid(63) } }), false, "con otro cliente, el suyo");
});

test("esOwnerDe es esOwner por cada id, venga una o varias", (t) => {
  const o = owner(t, 64, { comoEnConfig: `+598 99 ${digitos(unNumero(64)).slice(5, 8)} ${digitos(unNumero(64)).slice(8)}` });
  for (const ids of [o.X, o.LID, unaLid(65), null, [null, o.LID], [unaLid(65), unNumero(65)], [], [o.X, null]]) {
    const lista = Array.isArray(ids) ? ids : [ids];
    assert.equal(I.esOwnerDe(ids), lista.some((id) => F.esOwner(id)), JSON.stringify(ids));
  }
});

test("lidDe: la LID tal cual; un número, a quien el grupo lista con él, y si no a la de la base", () => {
  const { X, VIEJO, NUEVO, porNumero } = numeroReciclado(66);
  assert.equal(I.lidDe(NUEVO), NUEVO);
  assert.equal(I.lidDe(X, porNumero), NUEVO);
  assert.equal(I.lidDe(X), VIEJO, "sin el grupo, la de la base");
  assert.equal(I.lidDe(unNumero(67)), unNumero(67), "con ninguna, el número mismo");
  assert.equal(I.lidDe(unNumero(67), null, { oElMismo: false }), null);
  assert.equal(I.lidDe(null), null);
});

test("idsDelGrupo: las ids que trae un participante, sin preguntarle a la base", () => {
  const { X, NUEVO } = numeroReciclado(68);
  assert.deepEqual(I.idsDelGrupo({ id: X, lid: NUEVO, admin: null }), [X, NUEVO]);
  assert.deepEqual(I.idsDelGrupo({ id: NUEVO, phoneNumber: X }), [NUEVO, X]);
  assert.deepEqual(I.idsDelGrupo(X), [X]);
  assert.deepEqual(I.idsDelGrupo(null), []);
  assert.deepEqual(I.idsDeParticipante({ id: X }), [X, unaLid(68, 1)], "idsDeParticipante le suma la LID de la base");
});

test("un @ con tres dígitos o más ya es una mención tipeada, y lidsMencionados pasa los números a su LID", () => {
  assert.equal(I.lidMencionado(mensaje({}), "@123"), "123@lid");
  assert.equal(I.lidMencionado(mensaje({}), "@12"), null);
  const { X, LID } = filaVieja(69);
  assert.deepEqual(I.lidsMencionados(mensaje({ mentionedJid: [X] }), `@${digitos(X)}`), [LID]);
});

// The moderation commands check both of the bot's ids: in a group that lists it by number alone, with no row that ties
// that number to its LID, the number is all there is to recognize it by.
test(".kick al bot nombrado por su número, en un grupo que lo lista así, no lo saca", async (t) => {
  const sacados = [];
  cliente().groupParticipantsUpdate = async (chat, ids) => (sacados.push(...ids), ids.map(() => ({ status: "200" })));
  t.after(() => delete cliente().groupParticipantsUpdate);
  const MOD = unaLid(70);
  const m = mensaje({ sender: MOD, mentionedJid: [cliente().user.jid] });
  await P.kick.run(m, { client: cliente(), participants: [botEnGrupo().porNumeroSinLid, { id: MOD, admin: "admin" }], text: "@bot", groupMetadata: { owner: unaLid(71) }, usedPrefix: ".", command: "kick", isOwner: true, isWaAdmin: true, isAdmin: true });
  assert.equal(ultimoEnviado().msg.text, "No me quiero ir 😔😭");
  assert.deepEqual(sacados, []);
});

// Someone who joins comes with the ids the event brings, and the group's metadata may not list them yet: an entry kept
// by number has to match the event's phoneNumber.
test("lista negra: al entrar, el número que trae el aviso alcanza aunque la lista del grupo venga atrasada", async (t) => {
  const C = "ln-atrasada@g.us";
  const [L, X] = [unaLid(72), unNumero(72)];
  F.addToBlacklist(X, "estafa", unaLid(73), C);
  const sacados = [];
  cliente().groupParticipantsUpdate = async (chat, ids) => (sacados.push(...ids), ids.map(() => ({ status: "200" })));
  t.after(() => delete cliente().groupParticipantsUpdate);
  const LN = await import("../lib/lista-negra.js");
  await LN.expulsarDeListaNegra(cliente(), C, [{ id: L, phoneNumber: X }], []);
  assert.deepEqual(sacados, [L]);
});

// Only there: lib/menciones.js handed them on while the plugins asked it for them, and none does now.
test("a quién nombra un mensaje es solo de lib/identidad.js", () => {
  for (const nombre of ["lidDeDigitos", "lidEnElGrupo", "lidMencionado", "lidsMencionados"]) {
    assert.equal(typeof I[nombre], "function", nombre);
    assert.equal(M[nombre], undefined, nombre);
  }
});

// One way only: lib/menciones.js and the rest import lib/identidad.js, which imports nothing of the bot's but the
// database. When it imported lib/menciones.js, whatever both needed had to live there, where it didn't belong.
test("lib/identidad.js no importa nada del bot más que la base", () => {
  const fuente = fs.readFileSync(new URL("../lib/identidad.js", import.meta.url), "utf8");
  const deDonde = [...fuente.matchAll(/\bfrom\s+"([^"]+)"|\bimport\s*\(\s*"([^"]+)"/g)].map(([, a, b]) => a || b);
  assert.deepEqual([...new Set(deDonde.filter((de) => de.startsWith(".")))], ["../database-functions.js"]);
});

// ---------- whom a command names: who has the number now, and no number made up ----------

test("un @número tipeado que el grupo empareja es de quien lo tiene ahora, no de la fila vieja (.mute)", async () => {
  const { X, VIEJO, NUEVO, porLid } = numeroReciclado(20);
  const texto = `@${digitos(X)}`;
  await P.silenciar.run(mensaje({ sender: unaLid(21), text: texto }), { client: cliente(), text: texto, usedPrefix: ".", command: "mute", participants: porLid, isOwner: true, isWaAdmin: true });
  assert.deepEqual([F.getUser(NUEVO).inGroup[G]?.mute, F.getUser(VIEJO).inGroup[G]?.mute], [true, undefined]);
});

test("una mención por LID de alguien sin fila no inventa un número con los dígitos de la LID", () => {
  const L = unaLid(22);
  const m = mensaje({ sender: unaLid(23), mentionedJid: [L] });
  assert.equal(I.destinatario(m, `@${digitos(L)}`, [{ id: L, phoneNumber: unNumero(22) }]).jid, unNumero(22), "el del grupo");
  assert.equal(I.destinatario(m, `@${digitos(L)}`, [{ id: L }]).jid, null, "ninguno");
});

test(".id de alguien sin fila no muestra los dígitos de su LID como número", async () => {
  const L = unaLid(24);
  await P.id.run(mensaje({ sender: unaLid(25), mentionedJid: [L] }), { client: cliente(), text: `@${digitos(L)}`, usedPrefix: ".", command: "id", participants: [{ id: L }], isOwner: true });
  assert.doesNotMatch(ultimoEnviado().msg.text, new RegExp(`\\+${digitos(L)}`));
});

test(".bloquear a alguien sin fila no bloquea un número que no existe", async (t) => {
  const L = unaLid(26);
  const bloqueos = [];
  cliente().updateBlockStatus = async (jid, accion) => bloqueos.push([jid, accion]);
  t.after(() => delete cliente().updateBlockStatus);
  await P.bloquear.run(mensaje({ sender: unaLid(27), mentionedJid: [L] }), { client: cliente(), text: `@${digitos(L)}`, command: "bloquear", participants: [{ id: L }] });
  assert.deepEqual(bloqueos, []);
});

test(".addowner de alguien sin fila no escribe los dígitos de su LID en config.toml", async (t) => {
  const L = unaLid(28);
  const antes = globalThis.owners;
  t.after(() => {
    globalThis.owners = antes;
  });
  fs.writeFileSync("config.toml", 'owners = ["59899111222"]\n');
  await P.addowner.run(mensaje({ sender: unaLid(29), mentionedJid: [L] }), { client: cliente(), text: `@${digitos(L)}`, usedPrefix: ".", command: "addowner", participants: [{ id: L }] });
  assert.doesNotMatch(fs.readFileSync("config.toml", "utf8"), new RegExp(digitos(L)));
});

test("lidsMencionados con el grupo: un número, mencionado o tipeado, es de quien el grupo lista con él", () => {
  const { X, NUEVO, porNumero } = numeroReciclado(30);
  assert.deepEqual(I.lidsMencionados(mensaje({ mentionedJid: [X] }), `@${digitos(X)}`, porNumero), [NUEVO]);
  assert.deepEqual(I.lidsMencionados(mensaje({}), `@${digitos(X)}`, porNumero), [NUEVO], "tipeado");
});

test("estaEnGrupo: quien tuvo el número no está en el grupo por él, si el grupo lo lista con otra LID", () => {
  const { VIEJO, porNumero } = numeroReciclado(31);
  assert.equal(I.estaEnGrupo(porNumero)(VIEJO), false);
});

test(".kick respondiendo un mensaje de quien ya se fue no saca al que tiene ahora su número", async (t) => {
  const { X, VIEJO, porNumero } = numeroReciclado(32);
  const sacados = [];
  cliente().groupParticipantsUpdate = async (chat, ids) => (sacados.push(...ids), ids.map(() => ({ status: "200" })));
  t.after(() => delete cliente().groupParticipantsUpdate);
  const MOD = unaLid(33);
  const m = mensaje({ sender: MOD, quoted: { sender: VIEJO, delete: async () => {} } });
  await P.kick.run(m, { client: cliente(), participants: [...porNumero, { id: MOD, admin: "admin" }], text: "", groupMetadata: { owner: unaLid(34) }, usedPrefix: ".", command: "kick", isOwner: true, isWaAdmin: true, isAdmin: true });
  assert.ok(!sacados.includes(X), `sacó a ${sacados.join(", ")}`);
});

// By the number, only someone the group doesn't list with another LID: VIEJO is in none of these groups, though VIEJO's
// row still has the number NUEVO has now. A group that brings no LID can't tell them apart.
test("buscarEnGrupo: por el número, nunca a quien el grupo lista con otra LID", () => {
  const { X, VIEJO, NUEVO, porLid, porNumero, porNumeroSinLid, sinParear } = numeroReciclado(80);
  for (const grupo of [porLid, porNumero, sinParear]) assert.equal(I.buscarEnGrupo(grupo, { lid: VIEJO, jid: X }), null, JSON.stringify(grupo));
  assert.equal(I.buscarEnGrupo(porNumeroSinLid, { lid: VIEJO, jid: X }), porNumeroSinLid[0], "sin la LID no se sabe");
  assert.equal(I.buscarEnGrupo(porNumero, { lid: NUEVO.replace("@lid", ":12@lid"), jid: X }), porNumero[0], "la LID de un dispositivo es la suya");
  assert.equal(I.buscarEnGrupo(porLid, { lid: X, jid: X }), porLid[0], "lo que no es una LID no dice nada");
});

// Typed digits, with the group at hand: whoever it lists with that number now comes before the database's guess. Digits
// the group lists as a LID are that LID, though the database has a row with a number of the same digits.
test("lidDeDigitos con el grupo: quien tiene el número ahora, y la LID que el grupo lista", () => {
  const { X, VIEJO, NUEVO, porLid, porNumero, porNumeroSinLid } = numeroReciclado(81);
  for (const grupo of [porLid, porNumero]) assert.equal(I.lidDeDigitos(digitos(X), grupo), NUEVO, JSON.stringify(grupo));
  assert.equal(I.lidDeDigitos(digitos(X), porNumeroSinLid), VIEJO, "si el grupo no trae la LID, la de la base");
  const comoLid = `${digitos(X)}@lid`;
  assert.equal(I.lidDeDigitos(digitos(X), [{ id: comoLid }]), comoLid);
  assert.equal(I.lidDeDigitos(digitos(unNumero(82)), []), `${digitos(unNumero(82))}@lid`, "de nadie, se toma como LID");
});

// The number form is only for typed digits nothing is known of. A mentioned or quoted LID is real, and typed digits of a
// LID the bot knows or the group lists are that LID: none of them makes up a number.
test("destinatario no inventa un número para una LID mencionada, citada o tipeada", () => {
  const L = unaLid(83);
  assert.equal(I.destinatario(mensaje({ mentionedJid: [L] }), `@${digitos(L)}`, []).jid, null, "mencionada, de alguien que el grupo no lista");
  assert.equal(I.destinatario(mensaje({ quoted: { sender: L } }), "", []).jid, null, "citada");
  assert.equal(I.destinatario(mensaje({}), `@${digitos(L)}`, [{ id: L }]).jid, null, "tipeada, y el grupo la lista");
  const { X, LID } = filaVieja(84);
  assert.equal(I.destinatario(mensaje({}), `@${digitos(LID)}`, []).jid, X, "tipeada, de alguien con fila: su número");
});

// And typed digits nothing is known of may be the number of someone who never wrote, listed by number alone.
test("un @número tipeado de alguien que nunca escribió es ese número, si el grupo lo lista así", () => {
  const X = unNumero(88);
  const { participante, objetivo } = I.destinatario(mensaje({}), `@${digitos(X)}`, [{ id: X, admin: null }]);
  assert.deepEqual([participante?.id, objetivo], [X, X]);
});

// Digits the group lists as a LID are that LID: asked about as a number, WhatsApp only kept the command waiting.
test(".kick @<dígitos de una LID que el grupo lista> no le pregunta a WhatsApp", async (t) => {
  const consultas = usyncFalso(t, {});
  const sacados = [];
  cliente().groupParticipantsUpdate = async (chat, ids) => (sacados.push(...ids), ids.map(() => ({ status: "200" })));
  t.after(() => delete cliente().groupParticipantsUpdate);
  const [L, MOD] = [unaLid(85), unaLid(86)];
  const texto = `@${digitos(L)}`;
  await P.kick.run(mensaje({ sender: MOD, text: texto }), { client: cliente(), participants: [{ id: L, admin: null }, { id: MOD, admin: "admin" }], text: texto, groupMetadata: { owner: unaLid(87) }, usedPrefix: ".", command: "kick", isOwner: true, isWaAdmin: true, isAdmin: true });
  assert.deepEqual([consultas.length, sacados], [0, [L]]);
});

test(".regalar @número le llega a quien tiene ahora el número", async () => {
  const { X, VIEJO, NUEVO, porNumero } = numeroReciclado(40);
  const A = unaLid(41);
  fijarSaldo(F, G, A, 100);
  const texto = `@${digitos(X)} 20`;
  await P.regalar.run(mensaje({ sender: A, mentionedJid: [X] }), { client: cliente(), text: texto, args: texto.split(" "), participants: porNumero });
  assert.deepEqual([F.getSaldoCoins(G, NUEVO), F.getSaldoCoins(G, VIEJO)], [20, 0]);
});

test(".llamar @número arroba a quien tiene ahora el número", async () => {
  const { X, NUEVO, porNumero } = numeroReciclado(42);
  const C = "llamar@g.us";
  globalThis.enviados = [];
  await P.llamar.run(mensaje({ chat: C, sender: unaLid(43), mentionedJid: [X] }), { client: cliente(), text: `@${digitos(X)}`, command: "llamar", participants: porNumero });
  await esperar(30);
  await P.llamar.run(mensaje({ chat: C, sender: unaLid(43) }), { client: cliente(), text: "", command: "cancelar" });
  assert.equal(globalThis.enviados[0]?.msg.text, `@${digitos(NUEVO)}`);
});

// The commands that name someone with lidMencionado, and .parentesco with lidsMencionados: in a group that lists people
// by LID, with the number typed by hand, and in one that lists them by number, where the mention comes by number. Whoever
// the group lists with the number now, never whoever the database still has it on, and tagged by LID. Each one runs with
// a sender of its own, so what one leaves behind (a request, a duel) doesn't reach the next.
const COMANDOS_QUE_NOMBRAN = [
  // [plugin, command, what follows the mention, what the sender needs, more of what the handler passes]
  ["fun-besar", "besar"],
  ["pareja-elegir", "pareja"],
  ["pareja-aceptar", "aceptar"],
  ["pareja-rechazar", "rechazar"],
  ["pareja-exs", "ex"],
  ["coins-regalar", "regalar", " 20", "saldo"],
  ["coins-economia", "ajustar", " 50", null, { isOwner: true }],
  ["perfil", "perfil"],
  ["coins-duelo", "duelo", " 20", "saldo"],
  ["fun-calcular-juegos", "love"],
  ["familia-adoptar", "adoptar", "", "casamiento"],
  ["calificar", "calificar", " 5 buena gente"],
  ["familia-familia", "familia"],
  ["familia-emancipar", "desheredar"],
  ["rango", "rango"],
  ["familia-parentesco", "parentesco"],
];
test("los comandos que nombran a alguien van a quien tiene el número ahora, y lo arroban por su LID", async (t) => {
  const Par = await import("../lib/parejas.js");
  const D = await import("../lib/duelos.js");
  t.after(() => {
    for (const d of D.duelos.values()) clearTimeout(d.timeout);
    D.duelos.clear();
  });
  const preparar = {
    saldo: (A) => fijarSaldo(F, G, A, 1000),
    casamiento: (A, B) => {
      fijarSaldo(F, G, A, 1000);
      F.initDataDB({ chat: G, sender: B, senderJid: "", pushName: "Cónyuge" });
      Par.fijarPareja(A, B);
      Par.fijarCasamiento(A, B);
    },
  };
  let n = 100;
  for (const forma of ["porLid", "porNumero"]) {
    const escenario = numeroReciclado(n);
    const { X, VIEJO, NUEVO } = escenario;
    const [deVIEJO, deNUEVO] = [`VIEJO-${n}`, `NUEVO-${n}`]; // names that no other text has
    F.updateUser(VIEJO, { pushName: deVIEJO });
    F.updateUser(NUEVO, { pushName: deNUEVO });
    for (const [archivo, command, resto = "", necesita = null, extra = {}] of COMANDOS_QUE_NOMBRAN) {
      const [A, B] = [unaLid(++n, 1), unaLid(n, 2)];
      F.initDataDB({ chat: G, sender: A, senderJid: "", pushName: "Quien pide" });
      if (necesita) preparar[necesita](A, B);
      const texto = `@${digitos(X)}${resto}`;
      const m = mensaje({ sender: A, text: `.${command} ${texto}`, mentionedJid: forma === "porNumero" ? [X] : [] });
      globalThis.enviados = [];
      const plugin = (await import(`../plugins/${archivo}.js`)).default;
      await plugin.run(m, { client: cliente(), text: texto, args: texto.split(" "), command, usedPrefix: ".", participants: escenario[forma], chat: {}, ...extra });
      const enviados = globalThis.enviados.map((e) => e.msg).filter((msg) => msg?.text);
      const nombra = (id, nombre) => enviados.some((msg) => msg.text.includes(`@${digitos(id)}`) || msg.text.includes(nombre) || msg.mentions?.includes(id));
      const caso = `${forma}, .${command}: ${enviados.map((msg) => msg.text).join(" | ")}`;
      assert.ok(nombra(NUEVO, deNUEVO) && !nombra(VIEJO, deVIEJO), caso);
      assert.ok(!enviados.some((msg) => msg.mentions?.includes(X) || msg.text.includes(`@${digitos(X)}`)), `arrobó por el número: ${caso}`);
    }
    n++;
  }
});

test("idsDe: de un número, también la LID de la base; de una LID, su número solo si se pide", () => {
  const { X, LID } = filaVieja(160);
  assert.deepEqual(I.idsDe(X), [X, LID]);
  assert.deepEqual(I.idsDe([LID, null, ""]), [LID]);
  assert.deepEqual(I.idsDe(LID, { conSuNumero: true }), [LID, X]);
});

// .setpareja @a @b by the owner, in a group that lists people by number: each number is whoever the group lists with
// it, as for any command that names someone.
test("dosPersonas con el grupo: un número es de quien el grupo lista con él", async () => {
  const Par = await import("../lib/parejas.js");
  const [a, b] = [numeroReciclado(161), numeroReciclado(162)];
  const participants = [...a.porNumero, ...b.porNumero];
  assert.deepEqual(Par.dosPersonas(mensaje({ mentionedJid: [a.X, b.X] }), `@${digitos(a.X)} @${digitos(b.X)}`, participants), [a.NUEVO, b.NUEVO]);
  assert.deepEqual(Par.dosPersonas(mensaje({}), `@${digitos(a.X)} @${digitos(b.X)}`, participants), [a.NUEVO, b.NUEVO], "tipeados con @");
  assert.deepEqual(Par.dosPersonas(mensaje({}), `+${digitos(a.X)} +${digitos(b.X)}`, participants), [a.NUEVO, b.NUEVO], "tipeados con +");
});

test(".setpareja y .setmarry le pasan el grupo: forman y casan a quienes tienen los números ahora", async () => {
  const Par = await import("../lib/parejas.js");
  const plugin = async (archivo) => (await import(`../plugins/${archivo}.js`)).default;
  const [a, b] = [numeroReciclado(165), numeroReciclado(166)];
  const participants = [...a.porNumero, ...b.porNumero];
  const m = mensaje({ sender: unaLid(167), mentionedJid: [a.X, b.X] });
  const texto = `@${digitos(a.X)} @${digitos(b.X)}`;
  await (await plugin("pareja-set-pareja")).run(m, { client: cliente(), text: texto, participants });
  assert.equal(Par.parejaDe(a.NUEVO)?.pareja, b.NUEVO, ".setpareja");
  await (await plugin("pareja-set-marry")).run(m, { client: cliente(), text: texto, participants });
  assert.ok(Par.parejaDe(a.NUEVO)?.casadosDesde > 0, ".setmarry");
});

// The saint is the second owner in config.toml: by the LID the group lists their number with, the same way the person
// named is read. By the database alone, a saint with no row there wasn't one.
test("el santo de .gay2 es quien el grupo lista con el número del segundo owner", async (t) => {
  const antes = globalThis.owners;
  t.after(() => {
    globalThis.owners = antes;
  });
  const [S, SANTO] = [unNumero(163), unaLid(163)];
  globalThis.owners = ["59899111222", digitos(S)];
  globalThis.enviados = [];
  const Juegos = (await import("../plugins/fun-calcular-juegos.js")).default;
  await Juegos.run(mensaje({ sender: unaLid(164), mentionedJid: [S] }), { client: cliente(), command: "gay2", text: `@${digitos(S)}`, participants: [{ id: S, lid: SANTO, admin: null }] });
  assert.match(globalThis.enviados.find((e) => e.msg?.text)?.msg.text, /es un santo/);
});

// ---------- the boundary: only lib/identidad.js asks the database who is who ----------

// Whichever way the import is written: by name, the whole module, handed on, or through import(), which the lint can't
// read and so is stopped whole. lib/identidad.js asks; the tests look into the database freely; and the rest of the
// database is open to everyone.
test("pedirle a la base quién es quién fuera de lib/identidad.js no pasa el lint", async () => {
  const eslint = new ESLint({ cwd: fileURLToPath(new URL("..", import.meta.url)) });
  const reglas = async (codigo, filePath) => (await eslint.lintText(codigo, { filePath }))[0].messages.map((m) => m.ruleId);
  const pedidos = [
    ['import { lidDeNumero } from "../database-functions.js";\nlidDeNumero("x");\n', "no-restricted-imports"],
    ['import { getUser, esOwner as owner } from "../database-functions.js";\nowner(getUser("x"));\n', "no-restricted-imports"],
    ['import * as F from "../database-functions.js";\nF.getUser("x");\n', "no-restricted-imports"],
    ['export { jidDeLid } from "../database-functions.js";\n', "no-restricted-imports"],
    ['export * from "./database-functions.js";\n', "no-restricted-imports"],
    ['export const base = () => import("../database-functions.js");\n', "no-restricted-syntax"],
  ];
  for (const [codigo, regla] of pedidos) {
    for (const archivo of ["plugins/x.js", "lib/x.js", "x.js"]) assert.deepEqual(await reglas(codigo, archivo), [regla], `${archivo}: ${codigo.split("\n")[0]}`);
    assert.deepEqual(await reglas(codigo, "test/x.test.mjs"), [], `en un test: ${codigo.split("\n")[0]}`);
  }
  assert.deepEqual(await reglas('import { lidDeNumero, jidDeLid } from "../database-functions.js";\nlidDeNumero(jidDeLid("x"));\n', "lib/identidad.js"), []);
  assert.deepEqual(await reglas('import { getUser } from "../database-functions.js";\ngetUser("x");\n', "plugins/x.js"), [], "lo demás de la base, sí");
});

// A name on the list that database-functions.js no longer exports stops nothing: renamed, the function would be open to
// every file again.
test("cada nombre de SOLO_IDENTIDAD sigue exportado por database-functions.js", async () => {
  const { SOLO_IDENTIDAD } = await import("../eslint.config.js");
  assert.ok(SOLO_IDENTIDAD.length > 0);
  for (const nombre of SOLO_IDENTIDAD) assert.equal(typeof F[nombre], "function", nombre);
});

// ---------- whom it protects and whom it acts on: the bot, the owners, and the id the group gives ----------

test(".besar al bot nombrado por su número: la respuesta de siempre para el bot", async () => {
  globalThis.enviados = [];
  await P.besar.run(mensaje({ sender: unaLid(50), mentionedJid: [cliente().user.jid] }), { client: cliente(), text: "@bot", usedPrefix: ".", command: "besar" });
  assert.equal(globalThis.enviados.find((e) => e.msg?.text)?.msg.text, globalThis.txt.besarBot);
});

test(".addowner reconoce al owner escrito con + y espacios", async (t) => {
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

test("el anti-link saca con la id con que el grupo lista a la persona", async (t) => {
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

test(".adminbot no se le da a quien no está en el grupo, aunque la base lo conozca", async () => {
  const C = "adminbot@g.us";
  const L = unaLid(54);
  F.initDataDB({ chat: C, sender: L, senderJid: "", pushName: "Afuera" });
  const DUENO = unaLid(55);
  const texto = `@${digitos(L)}`;
  await P.roles.run(mensaje({ chat: C, sender: DUENO, mentionedJid: [L] }), { client: cliente(), command: "adminbot", args: [texto], text: texto, participants: [{ id: DUENO, admin: "superadmin" }], isOwner: true, isWaAdmin: true, isAdmin: true });
  assert.equal(F.rolGrupo(C, L), null);
});

test(".config muestra una sola vez a quien tiene un rol bajo cada una de sus ids", async () => {
  const C = "config@g.us";
  const [L, X] = [unaLid(56), unNumero(56)];
  db.prepare(`INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, 'Doble', 1)`).run(L, X);
  const rol = db.prepare(`INSERT INTO roles_grupo (chat, usuario, rol, fecha) VALUES (?, ?, ?, 1)`);
  rol.run(C, X, "mod"); // from before giving a role went by both identities
  rol.run(C, L, "admin");
  await P.config.run(mensaje({ chat: C, sender: unaLid(57) }), { client: cliente(), groupMetadata: { subject: "Grupo", id: C }, chat: {} });
  assert.equal((ultimoEnviado().msg.text.match(new RegExp(`@(${digitos(L)}|${digitos(X)})`, "g")) || []).length, 1);
});

test("al irse quien tiene ahora un número, el que lo tuvo antes no pierde su rol", () => {
  const C = "salida@g.us";
  const { X, VIEJO, NUEVO } = numeroReciclado(58);
  F.setRolGrupo(C, VIEJO, "mod");
  R.limpiarRolesAlSalir(C, [{ id: X, lid: NUEVO }]);
  assert.equal(F.rolGrupo(C, VIEJO), "mod");
});

test("identidadDelGrupo: la LID y el número como los trae el grupo; idsDeParticipante va a la base solo sin LID", () => {
  const { X, VIEJO, NUEVO, porLid, porNumero, porNumeroSinLid, sinParear } = numeroReciclado(140);
  assert.deepEqual(I.identidadDelGrupo(porLid[0]), { lid: NUEVO, jid: X });
  assert.deepEqual(I.identidadDelGrupo(porNumero[0]), { lid: NUEVO, jid: X });
  assert.deepEqual(I.identidadDelGrupo(porNumeroSinLid[0]), { lid: null, jid: X });
  assert.deepEqual(I.identidadDelGrupo(sinParear[0]), { lid: NUEVO, jid: null });
  assert.deepEqual(I.idsDeParticipante(porNumero[0]), [X, NUEVO], "trajo la LID: la de la base para el número es la de VIEJO");
  assert.deepEqual(I.idsDeParticipante(porNumeroSinLid[0]), [X, VIEJO], "sin LID, la de la base");
});

// The bot named by its number, as a group that lists people by number names it, with an old row the database may keep
// under that number: each command that has an answer for the bot gives it. They looked at its LID alone.
test("el bot nombrado por su número tiene la respuesta de siempre para el bot", async (t) => {
  const { jid } = cliente().user;
  db.prepare(`INSERT OR IGNORE INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, 'Claudia', 1)`).run(jid, jid);
  // A duel taken against her would keep its timer going for minutes, and the test with it.
  const D = await import("../lib/duelos.js");
  t.after(() => {
    db.prepare(`DELETE FROM users WHERE lid = ?`).run(jid);
    for (const d of D.duelos.values()) clearTimeout(d.timeout);
    D.duelos.clear();
  });
  const casos = [
    ["pareja-elegir", "pareja", () => globalThis.txt.parejaWhoBot],
    ["pareja-aceptar", "aceptar", () => globalThis.txt.parejaWhoBotNull(".", "aceptar", jid)],
    ["pareja-rechazar", "rechazar", () => globalThis.txt.parejaWhoBotNull(".", "rechazar", jid)],
    ["familia-adoptar", "adoptar", () => "A mí no me adopta nadie: yo los adopté a todos ustedes 😌"],
    ["coins-duelo", "duelo", () => "❌ Conmigo no, que la banca soy yo."],
  ];
  const A = unaLid(141);
  fijarSaldo(F, G, A, 100);
  for (const [archivo, command, esperado] of casos) {
    globalThis.enviados = [];
    const texto = `@${digitos(jid)} 20`;
    const plugin = (await import(`../plugins/${archivo}.js`)).default;
    await plugin.run(mensaje({ sender: A, mentionedJid: [jid] }), { client: cliente(), text: texto, args: texto.split(" "), command, usedPrefix: ".", participants: [] });
    assert.equal(globalThis.enviados.find((e) => e.msg?.text)?.msg.text, esperado(), `.${command}`);
  }
});

test(".r de un mensaje de Claudia citado por su número no lo recupera", async () => {
  const Recuperar = (await import("../plugins/recuperar-vista-unica.js")).default;
  let reaccion = null;
  const m = { ...mensaje({ sender: unaLid(142), quoted: { sender: cliente().user.jid, mimetype: "image/jpeg" } }), msg: {}, react: async (e) => (reaccion = e) };
  await Recuperar.run(m, { client: cliente(), isAdmin: true, isOwner: false });
  assert.equal(reaccion, "❌");
});

test(".removeowner saca al owner escrito con + y espacios", async (t) => {
  const conFormato = "+598 99 000 143";
  const antes = globalThis.owners;
  t.after(() => {
    globalThis.owners = antes;
  });
  fs.writeFileSync("config.toml", `owners = ["${conFormato}", "59899000144"]\n`);
  await P.addowner.run(mensaje({ sender: unaLid(145) }), { client: cliente(), text: conFormato, usedPrefix: ".", command: "removeowner", participants: [] });
  assert.match(ultimoEnviado().msg.text, /fué removido/);
  assert.match(fs.readFileSync("config.toml", "utf8"), /^owners = \["59899000144"\]/m);
});

// In a group that lists people by number, by the id the group lists them under; and when WhatsApp refuses, they say so.
test("el anti-link, .suicidarse, .aa y .ad actúan sobre la id del grupo, y avisan si WhatsApp no los deja", async (t) => {
  const { X, NUEVO, porNumero } = numeroReciclado(146);
  const pedidos = [];
  cliente().groupParticipantsUpdate = async (chat, ids, accion) => (pedidos.push([ids[0], accion]), ids.map(() => ({ status: "403" })));
  cliente().groupInviteCode = async () => "OTROCODIGO";
  t.after(() => {
    delete cliente().groupParticipantsUpdate;
    delete cliente().groupInviteCode;
  });
  const plugin = async (archivo) => (await import(`../plugins/${archivo}.js`)).default;
  const m = (extra = {}) => ({ ...mensaje({ sender: NUEVO, senderJid: X }), ...extra });
  const casos = [
    ["el anti-link", "remove", "No pude sacarlo (error 403).", () => P.antiLink.before(m({ text: "entren a chat.whatsapp.com/ABCDEFGH" }), { client: cliente(), participants: porNumero, isMod: false, isBotAdmin: true, isOwner: false, chat: { antiGroups: true } })],
    [".suicidarse", "remove", "No pude sacarte (error 403).", async () => (await plugin("fun-suicidarse")).run(m(), { client: cliente(), text: "", isOwner: false, participants: porNumero })],
    [".aa", "promote", "No pude darte el admin (error 403).", async () => (await plugin("auto-admin")).run(m(), { client: cliente(), isOwner: true, participants: porNumero })],
    [".ad", "demote", "No pude sacarte el admin (error 403).", async () => (await plugin("auto-demote")).run(m(), { client: cliente(), isAdmin: true, participants: porNumero })],
  ];
  for (const [nombre, accion, aviso, correr] of casos) {
    pedidos.length = 0;
    globalThis.enviados = [];
    await correr();
    assert.deepEqual(pedidos, [[X, accion]], nombre);
    assert.equal(ultimoEnviado()?.msg.text, aviso, nombre);
  }
});

// The owner as config.toml has them may come with "+" and spaces: the mention was no id at all. And the removal goes by
// the id the group lists the person under, saying so when WhatsApp refuses, as the others.
test("el anti-mención de estados menciona al owner por su LID, saca con la id del grupo y avisa si no puede", async (t) => {
  const { X, NUEVO, porNumero } = numeroReciclado(147);
  const o = owner(t, 148, { comoEnConfig: "+598 99 000 148" });
  const pedidos = [];
  cliente().groupParticipantsUpdate = async (chat, ids, accion) => (pedidos.push([ids[0], accion]), ids.map(() => ({ status: "403" })));
  t.after(() => delete cliente().groupParticipantsUpdate);
  globalThis.enviados = [];
  const Estados = (await import("../plugins/grupo-anti-group-mention-status.js")).default;
  const m = { ...mensaje({ sender: NUEVO, senderJid: X }), message: { groupStatusMentionMessage: { message: { protocolMessage: {} } } } };
  await Estados.before(m, { client: cliente(), participants: porNumero, isMod: false, isOwner: false, isBotAdmin: true, chat: { antiStatus: true } });
  assert.deepEqual(globalThis.enviados[0]?.msg.mentions, [NUEVO, o.LID]);
  await esperar(3100); // the removal comes three seconds after the warning
  assert.deepEqual(pedidos, [[X, "remove"]]);
  assert.equal(ultimoEnviado().msg.text, "No pude sacarlo (error 403).");
});

test(".adminbot sin la lista del grupo dice que no pudo verla, y no da el rol", async () => {
  const C = "adminbot-sin-lista@g.us";
  const L = unaLid(149);
  F.initDataDB({ chat: C, sender: L, senderJid: "", pushName: "Alguien" });
  const texto = `@${digitos(L)}`;
  await P.roles.run(mensaje({ chat: C, sender: unaLid(150), mentionedJid: [L] }), { client: cliente(), command: "adminbot", args: [texto], text: texto, participants: [], isOwner: true, isWaAdmin: true, isAdmin: true });
  assert.equal(ultimoEnviado().msg.text, "No pude ver la lista de miembros del grupo; probá de nuevo en un rato.");
  assert.equal(F.rolGrupo(C, L), null);
});

// A moderator listed by number, in a group that doesn't bring their LID: the ban roulette spun by another moderator
// leaves them out, as it does a moderator listed by LID. Each participant goes by how the group gives them, and
// without the LID, rango read no role.
test("rango lee el rol por el número si no hay LID, y la ruleta del ban no elige a un moderador listado así", async () => {
  const C = "ruleta@g.us";
  const { X, LID } = filaVieja(151);
  F.setRolGrupo(C, LID, "mod");
  assert.equal(R.rango(C, { jid: X }), 1);
  const GIRA = unaLid(152);
  F.setRolGrupo(C, GIRA, "mod");
  const Ruleta = (await import("../plugins/fun-ruleta-del-ban.js")).default;
  const participants = [{ id: X, admin: null }, { id: GIRA, admin: null }, botEnGrupo().porNumeroSinLid];
  await Ruleta.run(mensaje({ chat: C, sender: GIRA }), { client: cliente(), groupMetadata: { participants }, isOwner: false, isWaAdmin: false });
  assert.match(ultimoEnviado().msg.text, /No se encontraron candidatos/);
});

test("al irse quien tiene ahora un número, las ventas del que lo tuvo antes siguen", async () => {
  const C = "ventas-salida@g.us";
  const { X, VIEJO, NUEVO } = numeroReciclado(153);
  F.crearPublicacion({ chat: C, usuario: VIEJO, tipo: "vendo", texto: "una bici" });
  F.crearPublicacion({ chat: C, usuario: NUEVO, tipo: "vendo", texto: "una tele" });
  const { limpiarVentasAlSalir } = await import("../lib/compraventa.js");
  limpiarVentasAlSalir(C, [{ id: X, lid: NUEVO }]);
  const estado = (usuario) => db.prepare(`SELECT estado FROM publicaciones WHERE chat = ? AND usuario = ?`).get(C, usuario)?.estado;
  assert.deepEqual([estado(VIEJO), estado(NUEVO)], ["activa", "cerrada"]);
});

// ---------- what the database keeps of someone ----------

// .rd resets someone: their row, and the old one keyed by their number, from before LIDs. Left behind, it was the
// number's row again, with its warnings, its silence and its ban of back then, and it showed in the listings. With
// another LID on the number, the old row may be theirs, and it stays.
test(".rd borra también la fila vieja del número, si ninguna otra LID lo tiene", async () => {
  const Rd = (await import("../plugins/owner-restaurar-usuario.js")).default;
  const rd = (L) => Rd.run(mensaje({ sender: unaLid(170), mentionedJid: [L] }), { client: cliente(), text: `@${digitos(L)}`, usedPrefix: ".", command: "rd", participants: [] });
  const a = filaVieja(171);
  db.prepare("UPDATE users SET banned = 1 WHERE lid = ?").run(a.X);
  await rd(a.LID);
  assert.deepEqual([F.getUser(a.LID), F.getUser(a.X)], [null, null]);
  assert.ok(!F.getAllUsers().some((u) => [a.LID, a.X].includes(u.lid)), "ni en las listas");
  const b = filaVieja(172);
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, 'Otra', 3)").run(unaLid(172, 2), b.X);
  await rd(b.LID);
  assert.ok(db.prepare("SELECT 1 FROM users WHERE lid = ?").get(b.X), "con otra LID en el número, la fila vieja sigue");
});

