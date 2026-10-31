import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import Database from "better-sqlite3";
import { prepararBase, G, fijarSaldo, ultimoEnviado, esperar } from "./helpers.mjs";
import { numeroReciclado, filaVieja, soloPorNumero, owner, botEnGrupo, usyncFalso, mensaje, unaLid, unNumero, digitos } from "./identidad-escenarios.mjs";

// Who is who (lib/identidad.js, lib/menciones.js and the database's rows): what was right and had no test of its own,
// and what was wrong and got fixed. Each of those was a todo until its tanda of the identity frontier plan, and failed
// first against the code before it.

let F, I, M, R, S, P;
before(async () => {
  ({ F } = await prepararBase("identidad"));
  globalThis.txt = (await import("../lib/strings.js")).default;
  I = await import("../lib/identidad.js");
  // A round of the owners' questions that leaves one of them without an answer asks again REINTENTO_MS later: from a
  // test, an hour later, past the end of the file. At 60 s, on a slow machine, that was still this file, and the
  // question went to whatever test ran then. The tests of the retries set their own, and leave every owner answered.
  I.OWNERS.REINTENTO_MS = 60 * 60 * 1000;
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
  assert.deepEqual(sin(I.identidadesDe(NUEVO, porLid)), { jid: X, lid: NUEVO, participante: NUEVO, lidDeLaBase: false, desmentida: false }, "el número, del grupo");
  assert.deepEqual(sin(I.identidadesDe(X, porNumero)), { jid: X, lid: NUEVO, participante: X, lidDeLaBase: false, desmentida: false }, "la LID, de quien el grupo lista con el número");
  assert.deepEqual(sin(I.identidadesDe(X, [])), { jid: X, lid: VIEJO, participante: null, lidDeLaBase: true, desmentida: false }, "sin grupo, la de la base: una suposición");
  assert.deepEqual(sin(I.identidadesDe(X, porNumeroSinLid)), { jid: X, lid: VIEJO, participante: X, lidDeLaBase: true, desmentida: false });
  const conOtroNumero = [{ id: VIEJO, phoneNumber: unNumero(190), admin: null }];
  assert.deepEqual(sin(I.identidadesDe(X, conOtroNumero)), { jid: X, lid: null, participante: null, lidDeLaBase: false, desmentida: true }, "una suposición que el grupo desmiente no vale");
  assert.equal(I.lidDe(X, conOtroNumero), X, "ni para lidDe");
  assert.equal(I.identidadesDe([X, NUEVO], [{ id: NUEVO, phoneNumber: unNumero(198) }]).jid, X, "el número dado, el que dijo WhatsApp, no lo cambia el grupo");
  assert.deepEqual(I.identidadesDe([], porLid), { jid: null, lid: null, participante: null, lidDeLaBase: false, desmentida: false });
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

// Whose data it is: with WhatsApp's answer, the row it led to (destinatario's "quien"), the number's own for someone
// the bot knows by it alone; without one, the LID the group pairs the number with, even with no row: the row the
// number has may be whoever had it before.
test("deQuienEsActual: con la respuesta de WhatsApp, la fila a la que lleva; sin ella, la LID que da el grupo", async (t) => {
  const { X, L } = soloPorNumero(415);
  usyncFalso(t, { [X]: L });
  assert.equal(await I.deQuienEsActual(cliente(), mensaje({ mentionedJid: [X] }), `@${digitos(X)}`, [{ id: X, admin: null }]), X, "la del número, para quien el bot conoce por él");
  const [Y, VIEJO, N] = [unNumero(416), unaLid(416, 1), unaLid(416, 2)];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(VIEJO, Y, "Viejo", 1);
  assert.equal(await I.deQuienEsActual(cliente(), mensaje({ mentionedJid: [Y] }), `@${digitos(Y)}`, [{ id: Y, lid: N, admin: null }]), N, "sin preguntar, la del grupo, y no la fila vieja del número");
});

test("destinatarioActual le pregunta a WhatsApp solo si el grupo no empareja el número", async (t) => {
  const { X, NUEVO, porNumero } = numeroReciclado(10);
  const consultas = usyncFalso(t, { [X]: NUEVO });
  assert.equal((await I.destinatarioActual(cliente(), mensaje({ mentionedJid: [X] }), "", porNumero)).lid, NUEVO);
  assert.equal(consultas.length, 0, "el grupo ya lo dice");
  assert.equal((await I.destinatarioActual(cliente(), mensaje({ mentionedJid: [X] }), "", [])).lid, NUEVO, "y la base decía VIEJO");
  assert.equal(consultas.length, 1);
});

// Two rows with a LID: the owner's, and someone else's that still has the number (filaAjena). For being left alone,
// one too many is no harm.
test("idsDeOwners: el número de cada owner y las LID de todas sus filas", (t) => {
  const o = owner(t, 11, { filaAjena: true });
  db.prepare(`INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, '', 1)`).run(o.X, o.X); // the one from before LIDs
  assert.deepEqual([...F.idsDeOwners()].sort(), [o.X, o.LID, o.AJENA].sort());
});

test("esOwner: con el owner escrito en config.toml con + y espacios", (t) => {
  const o = owner(t, 12, { comoEnConfig: `+598 99 ${digitos(unNumero(12)).slice(5, 8)} ${digitos(unNumero(12)).slice(8)}` });
  assert.ok(F.esOwner(o.X));
  assert.ok(F.esOwner(o.LID));
  assert.ok(!F.esOwner(unaLid(13)));
});

// A row with an owner's number gave its LID the owner's powers until the owner wrote with the number again: .backup
// sent it the whole database, and .addowner made it stay. The powers go by the LID WhatsApp says has the number now;
// for being left alone (moderation, notices, ranks) the row still counts, where one too many is no harm.
test("una fila con el número del owner no le da sus poderes a esa LID: solo a la que WhatsApp dice que lo tiene", async (t) => {
  const o = owner(t, 14, { filaAjena: true });
  usyncFalso(t, { [o.X]: o.LID });
  t.after(() => I.ownersConfirmados.clear());
  assert.deepEqual([I.esOwnerConfirmado(o.AJENA), I.esOwnerConfirmado(o.LID), I.esOwnerConfirmado(o.X)], [false, false, true], "sin respuesta de WhatsApp, solo su número");
  await I.confirmarOwners(cliente());
  assert.deepEqual([I.esOwnerConfirmado(o.AJENA), I.esOwnerConfirmado(o.LID)], [false, true]);
  assert.equal(I.esOwnerDe(o.AJENA), true, "para dejarla en paz, la fila sigue contando");
});

// One question per owner, by the digits however config.toml writes them. An answer that doesn't come, or comes without
// a LID, leaves the last one there was; a number that's another LID's now goes to that one.
test("confirmarOwners: le pregunta a WhatsApp por cada owner y se queda con lo que contesta", async (t) => {
  const o = owner(t, 180, { comoEnConfig: `+598 99 ${digitos(unNumero(180)).slice(5, 8)} ${digitos(unNumero(180)).slice(8)}` });
  t.after(() => I.ownersConfirmados.clear());
  const consultas = usyncFalso(t, { [o.X]: o.LID });
  await I.confirmarOwners(cliente());
  assert.deepEqual(consultas.flatMap((c) => c.users.map((u) => u.id)), [o.X], "una pregunta, por el número sin el + ni los espacios");
  for (const [ids, poderes] of [[o.LID, true], [[null, o.LID], true], [[unaLid(181), unNumero(181)], false], [[], false], [null, false]]) {
    assert.equal(I.esOwnerConfirmado(ids), poderes, JSON.stringify(ids));
  }
  usyncFalso(t, {});
  await I.confirmarOwners(cliente());
  assert.ok(I.esOwnerConfirmado(o.LID), "una respuesta sin LID no borra la que había");
  const otra = unaLid(180, 3);
  usyncFalso(t, { [o.X]: otra });
  await I.confirmarOwners(cliente());
  assert.deepEqual([I.esOwnerConfirmado(o.LID), I.esOwnerConfirmado(otra)], [false, true], "el número es de otra LID ahora");
});

test("el bot le pregunta a WhatsApp por los owners al conectarse, y .addowner por el que agrega", async (t) => {
  const main = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
  assert.match(main, /connection === "open"\) \{[\s\S]*?confirmarOwnersCadaTanto\(\);/);
  const antes = globalThis.owners;
  t.after(() => {
    globalThis.owners = antes;
    I.ownersConfirmados.clear();
  });
  const [X, L] = [unNumero(182), unaLid(182)];
  usyncFalso(t, { [X]: L });
  fs.writeFileSync("config.toml", 'owners = ["59899111222"]\n');
  await P.addowner.run(mensaje({ sender: unaLid(183) }), { client: cliente(), text: `+${digitos(X)}`, usedPrefix: ".", command: "addowner", participants: [] });
  assert.ok(I.esOwnerConfirmado(L), "su LID tiene los poderes enseguida");
  I.ownersConfirmados.clear();
  await I.confirmarOwnersCadaTanto();
  assert.ok(I.esOwnerConfirmado(L), "al conectarse");
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

// A number the group lists alone, with no LID, is asked of WhatsApp however the message names it: mentioned, typed or
// as the quoted message's author. Where the group pairs it, no question; with no answer, the database's guess.
test("lidMencionadoActual y lidsMencionadosActual le preguntan a WhatsApp por un número que el grupo no empareja", async (t) => {
  const { X, VIEJO, NUEVO, porNumero, porNumeroSinLid } = numeroReciclado(340);
  const consultas = usyncFalso(t, { [X]: NUEVO });
  for (const [forma, m, texto] of [
    ["mencionado", mensaje({ mentionedJid: [X] }), `@${digitos(X)}`],
    ["tipeado", mensaje({}), `@${digitos(X)}`],
    ["citado", mensaje({ quoted: { sender: X } }), ""],
  ]) {
    assert.equal(await I.lidMencionadoActual(cliente(), m, texto, porNumeroSinLid), NUEVO, forma);
    assert.deepEqual(await I.lidsMencionadosActual(cliente(), m, texto, porNumeroSinLid), [NUEVO], forma);
  }
  assert.equal(consultas.length, 6);
  assert.equal(await I.lidMencionadoActual(cliente(), mensaje({ mentionedJid: [X] }), `@${digitos(X)}`, porNumero), NUEVO, "el grupo lo empareja");
  assert.equal(consultas.length, 6, "y no pregunta");
  usyncFalso(t, {});
  assert.equal(await I.lidMencionadoActual(cliente(), mensaje({ mentionedJid: [X] }), `@${digitos(X)}`, porNumeroSinLid), VIEJO, "sin respuesta, la suposición de la base");
});

// The commands go through the versions that ask (lidMencionadoActual, lidsMencionadosActual, deQuienEsActual,
// destinatarioActual, dosPersonasActual): one with a version that only guesses brought back, in a group that lists
// people by number alone, whoever had the number before.
test("ningún plugin resuelve a quién nombra un mensaje sin preguntarle a WhatsApp", () => {
  const carpeta = new URL("../plugins/", import.meta.url);
  const usan = [];
  for (const archivo of fs.readdirSync(carpeta).filter((f) => f.endsWith(".js"))) {
    const codigo = fs.readFileSync(new URL(archivo, carpeta), "utf8").split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
    for (const [, nombre] of codigo.matchAll(/\b(lidMencionado|lidsMencionados|deQuienEs|destinatario|dosPersonas|lidDeDigitos)\s*\(/g)) usan.push(`${archivo}: ${nombre}`);
  }
  assert.deepEqual(usan, []);
});

// One way only: lib/menciones.js and the rest import lib/identidad.js, which imports nothing of the bot's but the
// database. When it imported lib/menciones.js, whatever both needed had to live there, where it didn't belong.
// Whichever way the import is written: with names or without, as a re-export, through import() or require, with either
// quote or a template. Read as `from "…"` and `import("…")` only, `import "./menciones.js"` got past, and so did
// `from './urucoins.js'`.
test("lib/identidad.js no importa nada del bot más que la base", () => {
  const modulos = (fuente) => [...fuente.matchAll(/\b(?:from|import|require)\s*\(?\s*(["'`])([^"'`]+)\1/g)].map((r) => r[2]);
  const formas = ['import "./a.js";', "import { b } from './b.js';", 'export * from "./c.js";', "await import(`./d.js`);", "require('./e.js');", "import.meta.url;"];
  assert.deepEqual(modulos(formas.join("\n")), ["./a.js", "./b.js", "./c.js", "./d.js", "./e.js"]);
  const fuente = fs.readFileSync(new URL("../lib/identidad.js", import.meta.url), "utf8");
  const codigo = fuente.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
  assert.deepEqual([...new Set(modulos(codigo).filter((de) => de.startsWith(".")))], ["../database-functions.js"]);
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

// In a group that lists people by number alone, .id @number shows whoever WhatsApp says has the number now: with the
// database's guess, the name and the LID of whoever had it before.
test(".id @número en un grupo que lista solo por número muestra a quien lo tiene ahora", async (t) => {
  const { X, NUEVO, porNumeroSinLid } = numeroReciclado(352);
  usyncFalso(t, { [X]: NUEVO });
  await P.id.run(mensaje({ sender: unaLid(353), mentionedJid: [X] }), { client: cliente(), text: `@${digitos(X)}`, usedPrefix: ".", command: "id", participants: porNumeroSinLid, isOwner: true });
  assert.match(ultimoEnviado().msg.text, new RegExp(`Nombre actual: Nuevo[^]*Lid: ${NUEVO}`));
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

// The number form is only for typed digits nothing is known of. A mentioned or quoted LID is real, and typed digits of
// a LID the bot knows or the group lists are that LID: none of them makes up a number.
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

// In a group that lists people by number alone, whoever WhatsApp says has it.
test(".llamar @número arroba a quien tiene ahora el número", async (t) => {
  for (const [forma, n] of [["porNumero", 42], ["porNumeroSinLid", 320]]) {
    const escenario = numeroReciclado(n);
    const { X, NUEVO } = escenario;
    usyncFalso(t, { [X]: NUEVO });
    const C = `llamar-${n}@g.us`;
    globalThis.enviados = [];
    await P.llamar.run(mensaje({ chat: C, sender: unaLid(n + 1), mentionedJid: [X] }), { client: cliente(), text: `@${digitos(X)}`, command: "llamar", participants: escenario[forma] });
    await esperar(30);
    await P.llamar.run(mensaje({ chat: C, sender: unaLid(n + 1) }), { client: cliente(), text: "", command: "cancelar" });
    assert.equal(globalThis.enviados[0]?.msg.text, `@${digitos(NUEVO)}`, forma);
  }
});

// The commands that name someone with lidMencionadoActual, and .parentesco with lidsMencionadosActual: in a group that
// lists people by LID, with the number typed by hand, in one that lists them by number, where the mention comes by
// number, and in one that lists them by number alone, where WhatsApp is asked who has it, and only there. Whoever has
// the number now, never whoever the database still has it on, and tagged by LID: the "@" and its digits in the text,
// which client.sendText turns into the mention (parseMention, lib/wa-socket.js). The three of POR_SU_NOMBRE name them
// by their name instead. Each one runs with a sender of its own, so what one leaves behind (a request, a duel) doesn't
// reach the next.
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
const POR_SU_NOMBRE = ["familia", "desheredar", "parentesco"];
test("los comandos que nombran a alguien van a quien tiene el número ahora, y lo arroban por su LID, o lo nombran", async (t) => {
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
  // Each form with numbers of its own. In the group that lists people by number alone, WhatsApp says who has it.
  for (const [forma, desde] of [["porLid", 100], ["porNumero", 117], ["porNumeroSinLid", 300]]) {
    let n = desde;
    const escenario = numeroReciclado(n);
    const { X, VIEJO, NUEVO } = escenario;
    const consultas = usyncFalso(t, { [X]: NUEVO });
    const [deVIEJO, deNUEVO] = [`VIEJO-${n}`, `NUEVO-${n}`]; // names that no other text has
    F.updateUser(VIEJO, { pushName: deVIEJO });
    F.updateUser(NUEVO, { pushName: deNUEVO });
    for (const [archivo, command, resto = "", necesita = null, extra = {}] of COMANDOS_QUE_NOMBRAN) {
      const [A, B] = [unaLid(++n, 1), unaLid(n, 2)];
      F.initDataDB({ chat: G, sender: A, senderJid: "", pushName: "Quien pide" });
      if (necesita) preparar[necesita](A, B);
      const texto = `@${digitos(X)}${resto}`;
      const m = mensaje({ sender: A, text: `.${command} ${texto}`, mentionedJid: forma === "porLid" ? [] : [X] });
      globalThis.enviados = [];
      const plugin = (await import(`../plugins/${archivo}.js`)).default;
      await plugin.run(m, { client: cliente(), text: texto, args: texto.split(" "), command, usedPrefix: ".", participants: escenario[forma], chat: {}, ...extra });
      const enviados = globalThis.enviados.map((e) => e.msg).filter((msg) => msg?.text);
      const arroba = (id) => enviados.some((msg) => msg.text.includes(`@${digitos(id)}`));
      const nombra = (nombre) => enviados.some((msg) => msg.text.includes(nombre));
      const caso = `${forma}, .${command}: ${enviados.map((msg) => msg.text).join(" | ")}`;
      assert.ok(POR_SU_NOMBRE.includes(command) ? nombra(deNUEVO) : arroba(NUEVO), caso);
      assert.ok(!arroba(VIEJO) && !nombra(deVIEJO) && !enviados.some((msg) => msg.mentions?.includes(VIEJO)), `nombró a VIEJO: ${caso}`);
      assert.ok(!enviados.some((msg) => msg.mentions?.includes(X) || msg.text.includes(`@${digitos(X)}`)), `arrobó por el número: ${caso}`);
    }
    assert.equal(consultas.length, forma === "porNumeroSinLid" ? COMANDOS_QUE_NOMBRAN.length : 0, `${forma}: le pregunta a WhatsApp solo si el grupo no empareja el número`);
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

// .setpareja and .setmarry go through dosPersonasActual: in a group that lists people by number alone, each number is
// whoever WhatsApp says has it, as for any command that names someone; with the database's guess, whoever had it.
test("dosPersonasActual le pregunta a WhatsApp por los números que el grupo no empareja", async (t) => {
  const Par = await import("../lib/parejas.js");
  const [a, b] = [numeroReciclado(350), numeroReciclado(351)];
  const consultas = usyncFalso(t, { [a.X]: a.NUEVO, [b.X]: b.NUEVO });
  const participants = [...a.porNumeroSinLid, ...b.porNumeroSinLid];
  for (const [forma, m, texto] of [
    ["mencionados", mensaje({ mentionedJid: [a.X, b.X] }), `@${digitos(a.X)} @${digitos(b.X)}`],
    ["tipeados con @", mensaje({}), `@${digitos(a.X)} @${digitos(b.X)}`],
    ["tipeados con +", mensaje({}), `+${digitos(a.X)} +${digitos(b.X)}`],
  ]) {
    assert.deepEqual(await Par.dosPersonasActual(cliente(), m, texto, participants), [a.NUEVO, b.NUEVO], forma);
  }
  assert.ok(consultas.length > 0);
  assert.deepEqual(Par.dosPersonas(mensaje({ mentionedJid: [a.X, b.X] }), "", participants), [a.VIEJO, b.VIEJO], "sin preguntar, la suposición de la base");
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

// Whichever way the import is written: by name, the whole module, handed on, or through import() or require, with the
// file's name in the path as a string, a template or a sum; and a row's LID or number read off getUser, which is
// lidDeNumero or jidDeLid by another name. A path or a row kept in a variable is out of the lint's sight.
// lib/identidad.js asks; the tests look into the database freely; and the rest of the database is open to everyone.
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
    ["export const base = () => import(`../database-functions.js`);\n", "no-restricted-syntax"],
    ["export const base = (dir) => import(`${dir}/database-functions.js`);\n", "no-restricted-syntax"],
    ['import { createRequire } from "node:module";\nexport const F = createRequire(import.meta.url)("../database-functions.js");\n', "no-restricted-syntax"],
    ['import { getUser } from "../database-functions.js";\nexport const numero = (lid) => getUser(lid)?.jid;\n', "no-restricted-syntax"],
  ];
  for (const [codigo, regla] of pedidos) {
    for (const archivo of ["plugins/x.js", "lib/x.js", "x.js"]) assert.deepEqual(await reglas(codigo, archivo), [regla], `${archivo}: ${codigo.split("\n")[0]}`);
    assert.deepEqual(await reglas(codigo, "test/x.test.mjs"), [], `en un test: ${codigo.split("\n")[0]}`);
  }
  assert.deepEqual(await reglas('import { lidDeNumero, jidDeLid } from "../database-functions.js";\nlidDeNumero(jidDeLid("x"));\n', "lib/identidad.js"), []);
  assert.deepEqual(await reglas('import { getUser } from "../database-functions.js";\nexport const numero = (lid) => getUser(lid)?.jid;\n', "lib/identidad.js"), []);
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

// A device's row is its person's: into the row of the LID without the device, adding up what each counted in a group
// and keeping the earliest seniority, or as that row when there's none. On the connection it's handed, as
// soloUnaFilaPorNumero: loadDatabase runs it on the one it's opening.
test("las filas de dispositivo se juntan con la de su LID, o pasan a serlo, en la base que les pasan", () => {
  const otra = new Database(":memory:");
  S.ponerAlDia(otra);
  const [L, M] = [unaLid(175), unaLid(176)];
  const dispositivo = (lid, n) => lid.replace("@lid", `:${n}@lid`);
  const fila = otra.prepare("INSERT INTO users (lid, jid, pushName, inGroup, banned, timestamp) VALUES (?, '', ?, ?, ?, ?)");
  fila.run(L, "Persona", JSON.stringify({ g1: { messageCount: 5, desde: 2000, warn: 1, mute: false } }), 0, 10); // as getUser sets a group up
  fila.run(dispositivo(L, 12), "", JSON.stringify({ g1: { messageCount: 2, desde: 1000, mute: true }, g2: { messageCount: 3, desde: 1500 } }), 1, 5);
  fila.run(dispositivo(L, 3), "Otro nombre", JSON.stringify({ g2: { messageCount: 1, desde: 1200 } }), 0, 6);
  fila.run(dispositivo(M, 7), "Sola", JSON.stringify({ g1: { messageCount: 4 } }), 0, 7);
  const delBot = db.prepare(`SELECT COUNT(*) AS n FROM users`).get().n;
  assert.deepEqual(F.juntarFilasDeDispositivo(otra), { juntadas: 2, pasadas: 1 });
  const filas = otra.prepare("SELECT lid, pushName, inGroup, banned FROM users ORDER BY lid").all().map((f) => [f.lid, f.pushName, JSON.parse(f.inGroup), f.banned]);
  assert.deepEqual(filas, [
    [L, "Persona", { g1: { messageCount: 7, desde: 1000, warn: 1, mute: true }, g2: { messageCount: 4, desde: 1200 } }, 1],
    [M, "Sola", { g1: { messageCount: 4 } }, 0],
  ]);
  assert.deepEqual(F.juntarFilasDeDispositivo(otra), { juntadas: 0, pasadas: 0 }, "la vez siguiente no hay nada");
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM users`).get().n, delBot, "la del bot, intacta");
  otra.close();
});

// What .inactivos noted under a number goes when the number changes hands, and to nobody: a join, a warning and a late
// message go under every id the person comes with, so each one's is under their LID too. Left under the number, it was
// the next owner's: in the same group their first message was a "Volvió", with the prize, for someone else's warning,
// and silent they were warned already, so nobody tagged them and .k inactivos could remove them. Passed on to whoever
// had the number, what was the next owner's (a join, a late message, a warning from before aviso_de) became theirs.
test("lo que .inactivos anotó bajo un número se borra cuando el número cambia de dueño, sin pasárselo a nadie", async () => {
  const Inactivos = await import("../lib/inactivos.js");
  const DIA = 24 * 60 * 60 * 1000;
  const [C, C2] = ["presencia-reciclada@g.us", "presencia-reciclada-2@g.us"];
  const ahora = Date.now();
  const hace = (dias) => (dias === null ? null : ahora - dias * DIA);
  const anotado = (chat, usuario, ingreso, ultimo, avisado) =>
    db.prepare("INSERT INTO presencia_grupo (chat, usuario, ingreso, ultimo_mensaje, avisado) VALUES (?, ?, ?, ?, ?)").run(chat, usuario, hace(ingreso), hace(ultimo), hace(avisado));
  const presencia = (chat, usuario) => {
    const r = F.presenciaDelGrupo(chat).find((p) => p.usuario === usuario);
    return r ? [r.ingreso, r.ultimo_mensaje, r.avisado] : null;
  };
  const escribe = async (sender, senderJid) => {
    const m = { chat: C, sender, senderJid, pushName: "x", isGroup: true };
    F.initDataDB(m);
    F.syncUserInfo(m);
    await Inactivos.registrarPresencia(cliente(), m); // after syncUserInfo, as handle-message runs them
  };
  db.prepare("INSERT INTO presencia_inicio (chat, desde) VALUES (?, ?)").run(C, hace(60)); // the bot keeps track there

  // The number's next owner writes first. Under each id, in two groups: VIEJO's rows stay as they were.
  const a = numeroReciclado(185);
  anotado(C, a.VIEJO, 40, 20, 6);
  anotado(C, a.X, 30, null, 4);
  anotado(C2, a.VIEJO, 45, 25, 5);
  anotado(C2, a.X, null, 10, null);
  globalThis.enviados = [];
  await escribe(a.NUEVO, a.X);
  assert.deepEqual(globalThis.enviados.map((e) => e.msg?.text), [], "ningún «Volvió» para NUEVO");
  assert.equal(F.getSaldoCoins(C, a.NUEVO), 0);
  assert.deepEqual([presencia(C, a.VIEJO), presencia(C2, a.VIEJO)], [[hace(40), hace(20), hace(6)], [hace(45), hace(25), hace(5)]]);
  assert.deepEqual([presencia(C, a.X), presencia(C2, a.X)], [null, null]);

  // The one who had it writes from another number first, and the number's next owner never writes.
  const b = numeroReciclado(186);
  F.marcarAvisoInactivo(C, [b.VIEJO, b.X], hace(4));
  await escribe(b.VIEJO, unNumero(187));
  assert.equal(presencia(C, b.X), null, "lo del número se borró");
  const { listos, enPlazo } = Inactivos.paraSacar(C, b.porLid, cliente());
  assert.deepEqual([...listos, ...enPlazo], [], "NUEVO no figura avisado");
});

// ---------- the owners: their number, their protection, and asking WhatsApp ----------

// A LID's number, for what needs it (.addowner writes it into config.toml, .bloquear blocks it), is the one the group
// lists them with, who has it now: the one their row has stays until a message brings another. With a number that
// moved on to someone else, ".addowner @persona" made that someone an owner, and ".bloquear @persona" blocked them.
test(".addowner y .bloquear toman el número con que el grupo lista a la persona, no el viejo de su fila", async (t) => {
  const [VIEJO, NUEVO, X, Y] = [unaLid(191, 1), unaLid(191, 2), unNumero(191), unNumero(192)];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(VIEJO, X, "Viejo", 1);
  const antes = globalThis.owners;
  t.after(() => {
    globalThis.owners = antes;
    I.ownersConfirmados.clear();
  });
  usyncFalso(t, { [X]: NUEVO, [Y]: VIEJO });
  fs.writeFileSync("config.toml", 'owners = ["59899111222"]\n');
  const grupo = [{ id: VIEJO, phoneNumber: Y, admin: null }, { id: NUEVO, phoneNumber: X, admin: null }];
  const nombrado = { sender: unaLid(193), mentionedJid: [VIEJO] };
  await P.addowner.run(mensaje(nombrado), { client: cliente(), text: `@${digitos(VIEJO)}`, usedPrefix: ".", command: "addowner", participants: grupo });
  assert.deepEqual(globalThis.owners, ["59899111222", digitos(Y)]);
  assert.deepEqual([I.esOwnerConfirmado(VIEJO), I.esOwnerConfirmado([NUEVO, X])], [true, false]);
  const bloqueos = [];
  cliente().updateBlockStatus = async (jid, accion) => bloqueos.push([jid, accion]);
  t.after(() => delete cliente().updateBlockStatus);
  await P.bloquear.run(mensaje(nombrado), { client: cliente(), text: `@${digitos(VIEJO)}`, command: "bloquear", participants: grupo });
  assert.deepEqual(bloqueos, [[Y, "block"]]);
});

// Whoever has an owner's powers is left alone too: an owner whose row has no number, confirmed by WhatsApp, could be
// muted, warned, removed or blacklisted by any admin, .inactivos protected whatever row had the number instead, and
// an entry from before kept them out of every group they came into.
test("al owner que WhatsApp confirma se lo deja en paz, aunque su fila no tenga el número", async (t) => {
  const [OL, X] = [unaLid(194), unNumero(194)];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, '', 'Owner', 1)").run(OL);
  const antes = globalThis.owners;
  globalThis.owners = [digitos(X)];
  const expulsiones = [];
  cliente().groupParticipantsUpdate = async (chat, ids, accion) => (expulsiones.push([ids[0], accion]), ids.map((jid) => ({ status: "200", jid })));
  t.after(() => {
    globalThis.owners = antes;
    I.ownersConfirmados.clear();
    delete cliente().groupParticipantsUpdate;
  });
  usyncFalso(t, { [X]: OL });
  await I.confirmarOwners(cliente());
  assert.deepEqual([I.esOwnerConfirmado(OL), I.esOwnerDe(OL), I.idsDeOwners().has(OL)], [true, true, true]);
  const enElGrupo = [{ id: OL, admin: null }];
  await P.silenciar.run(mensaje({ mentionedJid: [OL] }), { client: cliente(), text: `@${digitos(OL)}`, command: "mute", usedPrefix: ".", participants: enElGrupo, isOwner: false, isWaAdmin: true, isAdmin: true });
  assert.notEqual(F.getUser(OL, G).inGroup[G]?.mute, true, ".mute no lo silencia");
  F.addToBlacklist(OL, "de antes", "admin", G, OL);
  const { expulsarDeListaNegra } = await import("../lib/lista-negra.js");
  await expulsarDeListaNegra(cliente(), G, enElGrupo, enElGrupo);
  assert.deepEqual(expulsiones, [], "al entrar no lo echa la lista negra");
});

// The owners' question waits longer than a command's, nobody being on the other end, and while an owner is left
// without an answer it's asked again soon, each time twice as late: right after connecting WhatsApp may be slow, and
// waiting for the next round left an owner whose messages bring only their LID without powers for hours.
test("si WhatsApp tarda o falla al confirmar a los owners, se les vuelve a preguntar pronto", async (t) => {
  const [OL, X] = [unaLid(195), unNumero(195)];
  const antes = { owners: globalThis.owners, tope: I.OWNERS.TOPE_MS, reintento: I.OWNERS.REINTENTO_MS, consulta: I.IDENTIDAD.CONSULTA_MS };
  globalThis.owners = [digitos(X)];
  Object.assign(I.OWNERS, { TOPE_MS: 400, REINTENTO_MS: 20 });
  I.IDENTIDAD.CONSULTA_MS = 20;
  t.after(() => {
    globalThis.owners = antes.owners;
    Object.assign(I.OWNERS, { TOPE_MS: antes.tope, REINTENTO_MS: antes.reintento });
    I.IDENTIDAD.CONSULTA_MS = antes.consulta;
    I.ownersConfirmados.clear();
    delete cliente().executeUSyncQuery;
  });
  const responde = (lid) => ({ list: [{ id: X, lid }] });
  cliente().executeUSyncQuery = async () => (await esperar(60), responde(OL)); // later than a command waits
  assert.equal(await I.lidSegunWhatsApp(cliente(), X), null, "un comando no la espera");
  await I.confirmarOwners(cliente());
  assert.ok(I.esOwnerConfirmado(OL), "la consulta de los owners sí");

  I.ownersConfirmados.clear();
  let preguntas = 0;
  cliente().executeUSyncQuery = async () => {
    if (++preguntas === 1) throw new Error("timed out");
    return responde(OL);
  };
  await I.confirmarOwnersCadaTanto();
  assert.ok(!I.esOwnerConfirmado(OL), "la primera falló");
  await esperar(150);
  assert.deepEqual([I.esOwnerConfirmado(OL), preguntas], [true, 2], "y al rato se le volvió a preguntar, una vez");
});

// A number removed from the owners and added again doesn't give the powers to the LID WhatsApp said had it before: an
// answer that doesn't come keeps the last one there was, and by then the number may be someone else's.
test(".removeowner olvida la LID que WhatsApp había confirmado para el número", async (t) => {
  const [A, X] = [unaLid(196), unNumero(196)];
  const antes = globalThis.owners;
  t.after(() => {
    globalThis.owners = antes;
    I.ownersConfirmados.clear();
  });
  fs.writeFileSync("config.toml", `owners = ["59899111222", "${digitos(X)}"]\n`);
  globalThis.owners = ["59899111222", digitos(X)];
  usyncFalso(t, { [X]: A });
  await I.confirmarOwners(cliente());
  assert.ok(I.esOwnerConfirmado(A));
  const comoOwner = (command) => P.addowner.run(mensaje({ sender: unaLid(197) }), { client: cliente(), text: `+${digitos(X)}`, usedPrefix: ".", command, participants: [] });
  await comoOwner("removeowner");
  usyncFalso(t, {}); // WhatsApp says nothing of the number now
  await comoOwner("addowner");
  assert.deepEqual([I.esOwnerConfirmado(A), I.esOwnerConfirmado(X)], [false, true]);
});

// ---------- what the bot keeps under a number ----------

// Someone the bot knows by their number alone (a group listed by number, whose messages bring no LID) has their row and
// their role under the number. Once WhatsApp says which LID has it, that LID has nothing: .adv and .mute had no record
// of them, .moderador said they weren't in the group and couldn't take away a role given by the number, and a moderator
// could remove another one whose role was under the number.
test("a quien el bot conoce solo por su número lo encuentran los comandos aunque WhatsApp diga su LID", async (t) => {
  const C = "solo-por-numero@g.us";
  const [X, L, MOD, ADMIN] = [unNumero(200), unaLid(200), unNumero(201), unaLid(202)];
  for (const n of [X, MOD]) F.initDataDB({ chat: C, sender: n, senderJid: n, pushName: "Por número" });
  F.setRolGrupo(C, X, "mod", ADMIN);
  F.setRolGrupo(C, MOD, "mod", ADMIN);
  usyncFalso(t, { [X]: L });
  const expulsiones = [];
  cliente().groupParticipantsUpdate = async (chat, ids) => (expulsiones.push(ids[0]), ids.map((jid) => ({ status: "200", jid })));
  t.after(() => delete cliente().groupParticipantsUpdate);
  const grupo = [{ id: X, admin: null }, { id: MOD, admin: null }, botEnGrupo().porNumeroSinLid];
  const Warn = (await import("../plugins/grupo-advertir.js")).default;
  const correr = (P, command, texto, { sender = ADMIN, esAdmin = true } = {}) =>
    P.run(mensaje({ chat: C, sender, mentionedJid: [X] }), { client: cliente(), text: texto, args: texto.split(" "), command, usedPrefix: ".", participants: grupo, groupMetadata: { owner: "100@lid", participants: grupo }, isOwner: false, isWaAdmin: esAdmin, isAdmin: esAdmin });
  const arrobaX = `@${digitos(X)}`;
  await correr(Warn, "advertir", `${arrobaX} spam`);
  assert.equal(F.advertenciasDe(X, C), 1, ".adv");
  await correr(P.silenciar, "mute", arrobaX);
  assert.equal(F.getUser(X, C).inGroup[C].mute, true, ".mute");
  await correr(P.kick, "kick", arrobaX, { sender: MOD, esAdmin: false });
  assert.deepEqual(expulsiones, [], "un moderador no saca a otro");
  await correr(P.roles, "moderador", `quitar ${arrobaX}`);
  assert.equal(F.rolGrupo(C, X), null, ".moderador quitar");
  F.setRolGrupo(C, X, "mod", ADMIN);
  await correr(P.roles, "adminbot", arrobaX);
  assert.deepEqual([F.rolGrupo(C, L), F.rolGrupo(C, X)], ["admin", null], ".adminbot, bajo la LID que dijo WhatsApp, y el rol por número se va");
  const Rd = (await import("../plugins/owner-restaurar-usuario.js")).default;
  await Rd.run(mensaje({ chat: C, sender: ADMIN, mentionedJid: [X] }), { client: cliente(), text: arrobaX, command: "rd", usedPrefix: ".", participants: grupo });
  assert.equal(db.prepare("SELECT 1 FROM users WHERE lid = ?").get(X), undefined, ".rd borra la fila guardada bajo el número");

  // The role under exactly the number, and not the one of the LID the database has for it: that's whoever had the
  // number before, once it moved on.
  const r = numeroReciclado(206);
  F.setRolGrupo(C, r.VIEJO, "mod", ADMIN);
  assert.equal(R.rango(C, { lid: r.NUEVO, jid: r.X }), 0);
});

// And the commands that only name them, which go to whoever WhatsApp says has the number too: by the LID it gave, which
// had nothing, ".regalar @598…" answered how to use it, ".bal" showed 0, ".perfil", ".calificar" and ".parentesco"
// didn't know them, and ".setpareja" couldn't find the two. Tagging them goes by that LID all the same: a number's
// digits after the "@" make a LID nobody has (parseMention, lib/wa-socket.js).
test("a quien el bot conoce solo por su número lo encuentran también los comandos que solo lo nombran", async (t) => {
  const [a, b] = [soloPorNumero(400), soloPorNumero(401)];
  const A = unaLid(402);
  F.initDataDB({ chat: G, sender: A, senderJid: "", pushName: "Quien pide" });
  fijarSaldo(F, G, a.X, 300);
  fijarSaldo(F, G, A, 100);
  usyncFalso(t, { [a.X]: a.L, [b.X]: b.L });
  const grupo = [...a.porNumeroSinLid, ...b.porNumeroSinLid, { id: A, admin: null }];
  // In a group listed by number, a mention comes by number.
  const correr = async (archivo, command, texto, extra = {}) => {
    globalThis.enviados = [];
    const mentionedJid = [...texto.matchAll(/@(\d+)/g)].map(([, d]) => `${d}@s.whatsapp.net`);
    const plugin = (await import(`../plugins/${archivo}.js`)).default;
    await plugin.run(mensaje({ sender: A, mentionedJid, text: `.${command} ${texto}` }), { client: cliente(), text: texto, args: texto.split(" "), command, usedPrefix: ".", participants: grupo, chat: {}, ...extra });
    return globalThis.enviados.map((e) => e.msg?.text).filter(Boolean).join(" | ");
  };
  const [arrobaA, arrobaB] = [a, b].map((p) => `@${digitos(p.X)}`);
  const Par = await import("../lib/parejas.js");
  const visto = {};
  await correr("coins-regalar", "regalar", `${arrobaA} 20`);
  visto.regalar = F.getSaldoCoins(G, a.X);
  visto.bal = /320 UruCoins/.test(await correr("coins-saldo", "bal", arrobaA));
  visto.perfil = /Perfil de/.test(await correr("perfil", "perfil", arrobaA));
  visto.calificar = /Calificaste/.test(await correr("calificar", "calificar", `${arrobaA} 5 buena gente`));
  visto.parentesco = !/No conozco/.test(await correr("familia-parentesco", "parentesco", arrobaA));
  await correr("pareja-set-pareja", "setpareja", `${arrobaA} ${arrobaB}`, { isOwner: true });
  visto.setpareja = Par.parejaDe(a.X)?.pareja === b.X;
  assert.deepEqual(visto, { regalar: 320, bal: true, perfil: true, calificar: true, parentesco: true, setpareja: true });

  const C = "llamar-solo-por-numero@g.us";
  globalThis.enviados = [];
  await P.llamar.run(mensaje({ chat: C, sender: A, mentionedJid: [a.X] }), { client: cliente(), text: arrobaA, command: "llamar", participants: grupo });
  await esperar(30);
  await P.llamar.run(mensaje({ chat: C, sender: A }), { client: cliente(), text: "", command: "cancelar" });
  assert.equal(globalThis.enviados[0]?.msg.text, `@${digitos(a.L)}`, ".llamar lo arroba por la LID");
});

// With a row of its own, though, the LID WhatsApp gives is who has the number now, as the bot knows them, as for the
// moderation (destinatario): the number's row may be whoever had it before, known by it alone, and going by it
// ".regalar @598…" paid them.
test("si la LID que da WhatsApp tiene fila, los comandos van a ella aunque el número tenga la suya", async (t) => {
  const { X, L, porNumeroSinLid } = soloPorNumero(417);
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(L, "", "Tiene el número", 2);
  const A = unaLid(418);
  fijarSaldo(F, G, A, 100);
  usyncFalso(t, { [X]: L });
  const texto = `@${digitos(X)} 20`;
  await P.regalar.run(mensaje({ sender: A, mentionedJid: [X] }), { client: cliente(), text: texto, args: texto.split(" "), participants: porNumeroSinLid });
  assert.deepEqual([F.getSaldoCoins(G, L), F.getSaldoCoins(G, X)], [20, 0]);
});

// A quoted message's author, which a group that lists people by number brings by number, is whoever the group lists
// with it, as a mention by number is: the row that still had the number was whoever's had it before, and ".regalar"
// answering their message paid them.
test("el autor de un mensaje citado por número es quien el grupo lista con ese número", async (t) => {
  const { X, VIEJO, NUEVO, porNumero, porNumeroSinLid } = numeroReciclado(204);
  const A = unaLid(205);
  fijarSaldo(F, G, A, 100);
  await P.regalar.run(mensaje({ sender: A, quoted: { sender: X } }), { client: cliente(), text: "20", args: ["20"], participants: porNumero });
  assert.deepEqual([F.getSaldoCoins(G, NUEVO), F.getSaldoCoins(G, VIEJO)], [20, 0]);
  assert.deepEqual(I.lidsMencionados(mensaje({ quoted: { sender: X } }), "", porNumero), [NUEVO], "y lidsMencionados igual");
  // A command that does something to the person asks WhatsApp who has the number, if the group doesn't pair it.
  usyncFalso(t, { [X]: NUEVO });
  await P.silenciar.run(mensaje({ sender: A, quoted: { sender: X } }), { client: cliente(), text: "", command: "mute", usedPrefix: ".", participants: porNumeroSinLid, isOwner: false, isWaAdmin: true, isAdmin: true });
  assert.deepEqual([NUEVO, VIEJO].map((id) => Boolean(F.getUser(id, G).inGroup[G]?.mute)), [true, false]);
});


// "@<digits>" typed by hand, with WhatsApp giving no LID for them and the database still having the number on whoever
// had it before, whom the group lists with another number by now: lidDeDigitos took the database's guess all the
// same, which lidDe doesn't. ".kick" removed them, ".mute" silenced them, ".moderador quitar" took their role, and
// ".addowner" wrote their new number into config.toml and made them an owner, which ".bloquear" blocked.
test("un @número tipeado no es de quien lo tuvo, si el grupo lo lista con otro número", async (t) => {
  const { X, VIEJO, NUEVO } = numeroReciclado(403);
  const [Y, ADMIN] = [unNumero(404), unaLid(405)];
  const C = "tipeado-desmentido@g.us";
  F.initDataDB({ chat: C, sender: ADMIN, senderJid: "", pushName: "Admin" });
  F.setRolGrupo(C, VIEJO, "mod", ADMIN);
  usyncFalso(t, {});
  const grupo = [{ id: VIEJO, phoneNumber: Y, admin: null }, { id: NUEVO, admin: null }, { id: ADMIN, admin: "admin" }, botEnGrupo().porLid];
  const expulsiones = [];
  cliente().groupParticipantsUpdate = async (chat, ids) => (expulsiones.push(ids[0]), ids.map((jid) => ({ status: "200", jid })));
  t.after(() => delete cliente().groupParticipantsUpdate);
  const tipeado = `@${digitos(X)}`;
  const correr = (plugin, command, texto = tipeado) => plugin.run(mensaje({ chat: C, sender: ADMIN, text: `.${command} ${texto}` }), { client: cliente(), text: texto, args: texto.split(" "), command, usedPrefix: ".", participants: grupo, groupMetadata: { owner: unaLid(406), participants: grupo }, isOwner: true, isWaAdmin: true, isAdmin: true, isBotAdmin: true });
  await correr(P.kick, "kick");
  await correr(P.silenciar, "mute");
  await correr(P.roles, "moderador", `quitar ${tipeado}`);
  const antes = globalThis.owners;
  t.after(() => {
    globalThis.owners = antes;
    I.ownersConfirmados.clear();
  });
  fs.writeFileSync("config.toml", 'owners = ["59899111222"]\n');
  await P.addowner.run(mensaje({ sender: ADMIN, text: `.addowner ${tipeado}` }), { client: cliente(), text: tipeado, usedPrefix: ".", command: "addowner", participants: grupo });
  const bloqueos = [];
  cliente().updateBlockStatus = async (jid, accion) => bloqueos.push([jid, accion]);
  t.after(() => delete cliente().updateBlockStatus);
  await P.bloquear.run(mensaje({ sender: ADMIN, text: `.bloquear ${tipeado}` }), { client: cliente(), text: tipeado, command: "bloquear", participants: grupo });
  const visto = { lid: I.lidDeDigitos(digitos(X), grupo), expulsado: expulsiones.includes(VIEJO), silenciado: Boolean(F.getUser(VIEJO, C).inGroup[C]?.mute), rol: F.rolGrupo(C, VIEJO), owners: globalThis.owners, bloqueos };
  // The digits are nobody the bot knows: not VIEJO, and the number typed is what's written down and blocked.
  assert.deepEqual(visto, { lid: `${digitos(X)}@lid`, expulsado: false, silenciado: false, rol: "mod", owners: ["59899111222", digitos(X)], bloqueos: [[X, "block"]] });
});

// The same number, given to a role: the database's LID for it counted as the person's, through rolGrupo, quitarRolGrupo
// and setRolGrupo, though the group lists that LID with another number. ".moderador @598…" said the one named was a
// moderator already, ".moderador quitar +598…" took the role from whoever had the number before, a moderator's ".kick
// +598…" was refused for their role, and whoever writes from the number had it (handle-message.test.mjs).
test("los roles no le llegan por el número a quien lo tuvo, si el grupo lo lista con otro", async (t) => {
  const C = "roles-desmentidos@g.us";
  const { X, VIEJO } = numeroReciclado(407);
  const [Y, ADMIN, MOD] = [unNumero(408), unaLid(409), unaLid(410)];
  F.setRolGrupo(C, VIEJO, "mod", ADMIN);
  F.setRolGrupo(C, MOD, "mod", ADMIN);
  usyncFalso(t, {});
  const expulsiones = [];
  cliente().groupParticipantsUpdate = async (chat, ids) => (expulsiones.push(ids[0]), ids.map((jid) => ({ status: "200", jid })));
  t.after(() => delete cliente().groupParticipantsUpdate);
  const grupo = [{ id: Y, lid: VIEJO, admin: null }, { id: X, admin: null }, { id: ADMIN, admin: "admin" }, { id: MOD, admin: null }, botEnGrupo().porNumero];
  const correr = (plugin, command, texto, { sender = ADMIN, mentionedJid = [], esAdmin = true } = {}) => plugin.run(mensaje({ chat: C, sender, mentionedJid, text: `.${command} ${texto}` }), { client: cliente(), command, text: texto, args: texto.split(" "), usedPrefix: ".", participants: grupo, groupMetadata: { owner: unaLid(411), participants: grupo }, isOwner: false, isWaAdmin: esAdmin, isAdmin: esAdmin });
  const bajo = (id) => F.rolesGrupo(C).find((r) => r.usuario === id)?.rol || null;
  const visto = {};
  await correr(P.roles, "moderador", `@${digitos(X)}`, { mentionedJid: [X] });
  visto.dar = [bajo(X), bajo(VIEJO)];
  await correr(P.roles, "moderador", `quitar +${digitos(X)}`);
  visto.quitar = [bajo(X), bajo(VIEJO)];
  F.setRolGrupo(C, VIEJO, "admin", ADMIN);
  await correr(P.kick, "kick", `+${digitos(X)}`, { sender: MOD, esAdmin: false });
  visto.kick = expulsiones.includes(X);
  globalThis.enviados = [];
  await correr((await import("../plugins/grupo-advertir.js")).default, "advertir", `+${digitos(X)} spam`, { sender: MOD, esAdmin: false });
  visto.advertir = !globalThis.enviados.some((e) => /es admin del bot/.test(e.msg?.text || ""));
  visto.escribe = R.permisosDe(C, X, { participants: grupo }).isMod;
  assert.deepEqual(visto, { dar: ["mod", "mod"], quitar: [null, "mod"], kick: true, advertir: true, escribe: false });
});

// The bot's own number isn't asked about: it's the bot. Replying to a casino result or to another of its messages, in
// a group that lists it by number alone, ".bal", ".besar" and ".kick" waited on WhatsApp for it. And ".calificaciones
// borrar 3" worked out whom the message named before seeing it goes by the rating's number, asking about whoever it
// replied to.
test("al bot no se le pregunta a WhatsApp por su número, y .calificaciones borrar no pregunta por nadie", async (t) => {
  const A = unaLid(412);
  F.initDataDB({ chat: G, sender: A, senderJid: "", pushName: "Pide" });
  const consultas = usyncFalso(t, {});
  const grupo = [{ id: A, admin: "admin" }, { id: unNumero(414), admin: null }, botEnGrupo().porNumeroSinLid];
  const alBot = mensaje({ sender: A, quoted: { sender: cliente().user.jid, fromMe: true } });
  for (const [archivo, command] of [["coins-saldo", "bal"], ["fun-besar", "besar"], ["grupo-kick", "kick"]]) {
    const plugin = (await import(`../plugins/${archivo}.js`)).default;
    await plugin.run(alBot, { client: cliente(), text: "", args: [], command, usedPrefix: ".", participants: grupo, groupMetadata: { owner: unaLid(413), participants: grupo }, isOwner: true, isWaAdmin: true, isAdmin: true });
  }
  const Calificar = (await import("../plugins/calificar.js")).default;
  await Calificar.run(mensaje({ sender: A, quoted: { sender: unNumero(414) } }), { client: cliente(), command: "calificaciones", args: ["borrar", "3"], text: "borrar 3", isAdmin: true, isOwner: false, participants: grupo });
  assert.deepEqual(consultas.map((c) => c.users.map((u) => u.id)), []);
});

// ".addowner @persona", ".removeowner" and ".bloquear" named by LID, with no number the message or the group gives for
// them: the one their row has stays until a message brings another, and may be someone else's by then. With it,
// ".addowner" made whoever has it now an owner, ".bloquear" blocked them, and ".removeowner" took away their powers;
// replying to an old message of whoever left did too. WhatsApp is asked: theirs if it says so, and otherwise the number
// is asked for, typed.
test(".addowner, .removeowner y .bloquear con @persona confirman con WhatsApp el número de su fila, o lo piden escrito", async (t) => {
  const antes = globalThis.owners;
  const bloqueos = [];
  cliente().updateBlockStatus = async (jid) => bloqueos.push(jid);
  t.after(() => {
    globalThis.owners = antes;
    I.ownersConfirmados.clear();
    delete cliente().updateBlockStatus;
  });
  // VIEJO wrote long ago with X, and WhatsApp says X is NUEVO's now (deOtro), says nothing (sinRespuesta), or says X is
  // still VIEJO's (suyo). In a group that lists people by LID, without their numbers.
  const escenario = (n, quienLoTiene, owners = ["59899111222"]) => {
    const [VIEJO, NUEVO, X] = [unaLid(n, 1), unaLid(n, 2), unNumero(n)];
    db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(VIEJO, X, "Viejo", 1);
    usyncFalso(t, quienLoTiene ? { [X]: quienLoTiene === "NUEVO" ? NUEVO : VIEJO } : {});
    globalThis.owners = owners.map((o) => (o === "X" ? digitos(X) : o));
    fs.writeFileSync("config.toml", `owners = [${globalThis.owners.map((o) => JSON.stringify(o)).join(", ")}]\n`);
    globalThis.enviados = [];
    bloqueos.length = 0;
    return { VIEJO, NUEVO, X };
  };
  const correr = (plugin, command, m, participants) => plugin.run(mensaje({ sender: unaLid(419), ...m }), { client: cliente(), text: m.mentionedJid ? `@${digitos(m.mentionedJid[0])}` : "", usedPrefix: ".", command, participants });
  const visto = {};
  for (const [caso, n, quienLoTiene] of [["deOtro", 420, "NUEVO"], ["sinRespuesta", 421, null], ["suyo", 422, "VIEJO"]]) {
    const { VIEJO, NUEVO } = escenario(n, quienLoTiene);
    await correr(P.addowner, "addowner", { mentionedJid: [VIEJO] }, [{ id: VIEJO, admin: null }, { id: NUEVO, admin: null }]);
    await correr(P.bloquear, "bloquear", { mentionedJid: [VIEJO] }, [{ id: VIEJO, admin: null }, { id: NUEVO, admin: null }]);
    visto[caso] = { owners: globalThis.owners.slice(1).length, bloqueos: bloqueos.length, VIEJOconPoderes: I.esOwnerConfirmado(VIEJO), respuesta: globalThis.enviados[0]?.msg.text };
  }
  // NUEVO, an owner by X: ".removeowner @VIEJO".
  const r = escenario(423, "NUEVO", ["59899111222", "X"]);
  await correr(P.addowner, "removeowner", { mentionedJid: [r.VIEJO] }, [{ id: r.VIEJO, admin: null }, { id: r.NUEVO, admin: null }]);
  visto.removeowner = globalThis.owners.includes(digitos(r.X));
  // Replying to an old message of VIEJO, who left: the group lists NUEVO with the number VIEJO's row still has.
  const c = escenario(424, "NUEVO");
  await correr(P.addowner, "addowner", { quoted: { sender: c.VIEJO, text: "hola" } }, [{ id: c.NUEVO, phoneNumber: c.X, admin: null }]);
  visto.citado = globalThis.owners.length;
  const pideElNumero = (comienzo) => `${comienzo} Escribilo: .addowner +598 99 999 999`;
  assert.deepEqual(visto, {
    deOtro: { owners: 0, bloqueos: 0, VIEJOconPoderes: false, respuesta: pideElNumero("No sé qué número tiene ahora esa persona: el que tengo anotado ya es de otra.") },
    sinRespuesta: { owners: 0, bloqueos: 0, VIEJOconPoderes: false, respuesta: pideElNumero("No pude confirmar con WhatsApp el número de esa persona, y el que tengo anotado puede ser viejo.") },
    suyo: { owners: 1, bloqueos: 1, VIEJOconPoderes: true, respuesta: `✅ El numero *${digitos(unNumero(422))}* fué añadido como owner.` },
    removeowner: true,
    citado: 1,
  });
});

// .id shows the number as they have it now, the one the message names, or the group lists them with, or WhatsApp gives,
// ahead of the one their row still has; and only a LID as the LID.
test(".id muestra el número que tiene ahora, no el viejo de su fila, y solo una LID como LID", async (t) => {
  const [VIEJO, NUEVO, X, Y] = [unaLid(425, 1), unaLid(425, 2), unNumero(425), unNumero(426)];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(VIEJO, X, "Viejo", 1);
  const a = soloPorNumero(427);
  usyncFalso(t, { [X]: NUEVO, [Y]: VIEJO, [a.X]: a.L });
  const id = async (m, opciones) => {
    await P.id.run(mensaje({ sender: unaLid(428), ...m }), { client: cliente(), usedPrefix: ".", command: "id", isOwner: false, ...opciones });
    return ultimoEnviado().msg.text.split("\n\n").slice(0, 3).join(" · ");
  };
  const visto = {
    tipeado: await id({ chat: "dueno@s.whatsapp.net" }, { text: `+${digitos(Y)}`, participants: [], isOwner: true }),
    delGrupo: await id({ mentionedJid: [VIEJO] }, { text: `@${digitos(VIEJO)}`, participants: [{ id: VIEJO, phoneNumber: Y, admin: null }] }),
    soloPorNumero: await id({ mentionedJid: [a.X] }, { text: `@${digitos(a.X)}`, participants: a.porNumeroSinLid }),
  };
  assert.deepEqual(visto, {
    tipeado: `Usuario: +${digitos(Y)} · Nombre actual: Viejo · Lid: ${VIEJO}`,
    delGrupo: `Usuario: +${digitos(Y)} · Nombre actual: Viejo · Lid: ${VIEJO}`,
    soloPorNumero: `Usuario: +${digitos(a.X)} · Nombre actual: Por número · Lid: ${a.L}`,
  });
});

// .addowner waits on WhatsApp as a command does, and whoever it adds is asked again while there's no answer: it waited
// TOPE_MS for one question, and with WhatsApp slow the owner heard back 18 s later; and asked once, the new owner had
// no powers by their LID until the next round, 6 hours later.
test(".addowner no espera la ronda entera, y al owner nuevo se le vuelve a preguntar", async (t) => {
  const [L, X] = [unaLid(429), unNumero(429)];
  const antes = { owners: globalThis.owners, tope: I.OWNERS.TOPE_MS, reintento: I.OWNERS.REINTENTO_MS, consulta: I.IDENTIDAD.CONSULTA_MS };
  Object.assign(I.OWNERS, { TOPE_MS: 600, REINTENTO_MS: 20 });
  I.IDENTIDAD.CONSULTA_MS = 50;
  t.after(() => {
    globalThis.owners = antes.owners;
    Object.assign(I.OWNERS, { TOPE_MS: antes.tope, REINTENTO_MS: antes.reintento });
    I.IDENTIDAD.CONSULTA_MS = antes.consulta;
    I.ownersConfirmados.clear();
    delete cliente().executeUSyncQuery;
  });
  // WhatsApp doesn't answer until it does, about the only owner: once it answers, the retries end.
  let responde = false;
  cliente().executeUSyncQuery = (consulta) => (responde ? Promise.resolve({ list: consulta.users.map((u) => ({ id: u.id, lid: L })) }) : new Promise(() => {}));
  fs.writeFileSync("config.toml", "owners = []\n");
  const t0 = Date.now();
  await P.addowner.run(mensaje({ sender: unaLid(430) }), { client: cliente(), text: `+${digitos(X)}`, usedPrefix: ".", command: "addowner", participants: [] });
  const tardo = Date.now() - t0;
  responde = true;
  for (let i = 0; i < 100 && !I.esOwnerConfirmado(L); i++) await esperar(20);
  assert.deepEqual({ antesDelTope: tardo < I.OWNERS.TOPE_MS, suLid: I.esOwnerConfirmado(L) }, { antesDelTope: true, suLid: true });
});

// And an answer about the number asked for before .removeowner, which came in after: kept, it came back with the number
// added again, and with WhatsApp saying nothing of it then, the LID it had before had the powers.
test(".removeowner olvida también la respuesta que llega después, de una pregunta de antes", async (t) => {
  const [A, X] = [unaLid(431), unNumero(431)];
  const antes = globalThis.owners;
  t.after(() => {
    globalThis.owners = antes;
    I.ownersConfirmados.clear();
    delete cliente().executeUSyncQuery;
  });
  fs.writeFileSync("config.toml", `owners = ["59899111222", "${digitos(X)}"]\n`);
  globalThis.owners = ["59899111222", digitos(X)];
  // A round asking, with WhatsApp slow to answer that X is A's; then WhatsApp says nothing of X.
  let suelta;
  const lenta = new Promise((resolve) => (suelta = resolve));
  let enVuelo = true;
  const preguntas = [];
  cliente().executeUSyncQuery = async (consulta) => {
    const deAntes = enVuelo;
    preguntas.push(consulta);
    if (deAntes) await lenta;
    return { list: consulta.users.map((u) => ({ id: u.id, lid: deAntes && u.id === X ? A : undefined })) };
  };
  const ronda = I.confirmarOwners(cliente());
  for (let i = 0; i < 100 && !preguntas.length; i++) await esperar(5);
  enVuelo = false;
  const comoOwner = (command) => P.addowner.run(mensaje({ sender: unaLid(432) }), { client: cliente(), text: `+${digitos(X)}`, usedPrefix: ".", command, participants: [] });
  await comoOwner("removeowner");
  suelta();
  await ronda;
  await comoOwner("addowner");
  assert.deepEqual([I.esOwnerConfirmado(A), I.esOwnerConfirmado(X)], [false, true]);
});

// A round calls off the one before, its retry waiting and its question in flight: one that came with a question in
// flight left two chains of retries, each asking on its own.
test("una ronda nueva deja una sola cadena de reintentos, aunque llegue con una pregunta en vuelo", async (t) => {
  const [X, L] = [unNumero(433), unaLid(433)];
  const antes = { owners: globalThis.owners, tope: I.OWNERS.TOPE_MS, reintento: I.OWNERS.REINTENTO_MS };
  globalThis.owners = [digitos(X)];
  Object.assign(I.OWNERS, { TOPE_MS: 2000, REINTENTO_MS: 30 });
  // Each question waits until the test answers it.
  const pendientes = [];
  cliente().executeUSyncQuery = () => new Promise((resolve) => pendientes.push(resolve));
  t.after(async () => {
    // Every question answered with the LID: the chain ends.
    for (const responder of pendientes) responder({ list: [{ id: X, lid: L }] });
    await esperar(50);
    globalThis.owners = antes.owners;
    Object.assign(I.OWNERS, { TOPE_MS: antes.tope, REINTENTO_MS: antes.reintento });
    I.ownersConfirmados.clear();
    delete cliente().executeUSyncQuery;
  });
  const hasta = async (n) => {
    for (let i = 0; i < 200 && pendientes.length < n; i++) await esperar(5);
  };
  I.confirmarOwnersCadaTanto();
  await hasta(1);
  I.confirmarOwnersCadaTanto(); // the next round, with the first question in flight
  await hasta(2);
  for (const responder of pendientes.slice(0, 2)) responder({ list: [{ id: X }] }); // both without a LID
  await esperar(200); // the retries go out REINTENTO_MS later
  assert.equal(pendientes.length, 3, "las dos preguntas y un solo reintento");
});
