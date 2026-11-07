// Someone who writes from their number alone in a group that lists people by number, and whose LID has a row of its
// own (conDosFilas): the bot names them by the LID (lib/identidad.js, comoLoConoce), and their messages there bring the
// number, which has its own row. What the bot reads off the row of whoever writes goes on both rows (.mute, .banuser,
// and .rd, which clears them), and what waits on their answer (.pareja, .duelo, .adoptar) can be answered from the
// number.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, G, fijarSaldo } from "./helpers.mjs";
import { conDosFilas, soloPorNumero, filaVieja, numeroReciclado, usyncFalso, mensaje, unaLid, unNumero, digitos } from "./identidad-escenarios.mjs";

let F, I, Par, Fam, D, handleMessage;
const P = {};
before(async () => {
  ({ F } = await prepararBase("desde-su-numero"));
  globalThis.baileys = "@whiskeysockets/baileys";
  (await import("../lib/wa-socket.js")).serialize(); // what turns Baileys' message into the bot's m
  ({ handleMessage } = await import("../handle-message.js"));
  I = await import("../lib/identidad.js");
  Par = await import("../lib/parejas.js");
  Fam = await import("../lib/familia.js");
  D = await import("../lib/duelos.js");
  const archivos = { silenciar: "grupo-silenciar", banuser: "owner-banuser", rd: "owner-restaurar-usuario", pareja: "pareja-elegir", aceptar: "pareja-aceptar", rechazar: "pareja-rechazar", duelo: "coins-duelo", aura: "fun-aura", adoptar: "familia-adoptar", si: "pareja-casamiento-aceptar", no: "pareja-casamiento-rechazar" };
  for (const [k, archivo] of Object.entries(archivos)) P[k] = (await import(`../plugins/${archivo}.js`)).default;
});

const cliente = () => globalThis.client;

// A command as handle-message runs it, in group G. Returns what the bot answered.
async function correr(plugin, { sender, command, texto = "", mentionedJid = [], participants }) {
  globalThis.enviados = [];
  const m = mensaje({ sender, senderJid: sender.endsWith("@s.whatsapp.net") ? sender : "", text: `.${command} ${texto}`.trim(), mentionedJid });
  await P[plugin].run(m, { client: cliente(), text: texto, args: texto.split(" ").filter(Boolean), command, usedPrefix: ".", participants, chat: {} });
  return globalThis.enviados.map((e) => e.msg?.text).filter(Boolean).join(" | ");
}

// The challenges and fights left behind, with their timers.
function limpiarDuelos() {
  for (const d of D.duelos.values()) clearTimeout(d.timeout);
  D.duelos.clear();
  for (const pelea of new Set(D.peleas.values())) clearTimeout(pelea.timeout);
  D.peleas.clear();
}

// ---------- every row of theirs ----------

test("destinatario da las dos filas de quien escribe desde su número, si el número es de su LID", async (t) => {
  const [a, b, c, f] = [conDosFilas(900), conDosFilas(901), soloPorNumero(902), { X: unNumero(905), L: unaLid(905) }];
  usyncFalso(t, { [a.X]: a.L, [c.X]: c.L, [f.X]: f.L });
  const filas = async (id, participants) => (await I.destinatarioActual(cliente(), mensaje({ mentionedJid: [id] }), `@${digitos(id)}`, participants)).filas;
  assert.deepEqual(await filas(a.X, a.porNumeroSinLid), [a.L, a.X], "WhatsApp dice que el número es de la LID");
  assert.deepEqual(await filas(b.X, b.porNumero), [b.L, b.X], "el grupo los empareja, listándolo por número");
  assert.deepEqual(await filas(b.L, b.porLid), [b.L, b.X], "el grupo los empareja, listándolo por LID");
  // One row only: someone the bot knows by the number alone, whose LID has none; the old row of a number a LID row
  // has, which the number doesn't stand for (FILA_DEL_NUMERO); and a number that went to someone else, whose row still
  // has whoever had it before.
  assert.deepEqual(await filas(c.X, c.porNumeroSinLid), [c.X], "solo por su número");
  const d = filaVieja(903);
  assert.deepEqual(await filas(d.X, [{ id: d.X, admin: null }]), [d.LID], "la fila vieja del número");
  const e = numeroReciclado(904);
  assert.deepEqual(await filas(e.X, e.porNumero), [e.NUEVO], "el número reciclado");
  // None: nobody named, and someone named with no row.
  assert.deepEqual(I.destinatario(mensaje({}), "", []).filas, [], "nadie");
  assert.deepEqual(await filas(f.X, [{ id: f.X, admin: null }]), [], "sin fila");
});

const BOT = { id: "59800000001:5@s.whatsapp.net", lid: "200000000000001@lid", jid: "59800000001@s.whatsapp.net", name: "Claudia" };
// A connected socket, as far as handle-message goes (as in handle-message.test.mjs), in a group that lists people by
// number.
function clientePorNumero(t, participants) {
  const antes = globalThis.client;
  const base = clienteFalso();
  const client = {
    ...base,
    user: BOT,
    decodeJid: (j) => (typeof j === "string" ? j.replace(/:\d+@/, "@") : j),
    pushMessage: async () => {},
    readMessages: async () => {},
    ev: { emit() {}, on() {} },
    groupMetadata: async (id) => ({ id, subject: "Por número", addressingMode: "pn", participants }),
    sendPresenceUpdate: async () => {},
  };
  globalThis.client = client;
  t.after(() => {
    globalThis.client = antes;
  });
  return client;
}

let n = 0;
// What Baileys hands over for a text message in a group that lists people by number, from someone whose messages bring
// the number alone (no participantAlt).
const llega = (client, chat, participant, texto, mentionedJid = null) =>
  handleMessage.call(client, {
    key: { remoteJid: chat, fromMe: false, id: `DESDENUM${String(++n).padStart(8, "0")}`, participant, addressingMode: "pn" },
    message: mentionedJid ? { extendedTextMessage: { text: texto, contextInfo: { mentionedJid } } } : { conversation: texto },
    messageTimestamp: Math.floor(Date.now() / 1000),
    pushName: "Alguien",
    _upsertType: "notify",
    _llegada: Date.now(),
  });

// The whole of handle-message: their messages there read the row kept under the number. ".mute @598…" silenced the
// LID's row and their messages weren't deleted; ".banuser" banned a row their commands didn't read.
test("a quien escribe desde su número, .mute, .banuser y .rd le llegan aunque su LID tenga fila", async (t) => {
  const C = "120363000000000910@g.us";
  const { X, L, porNumeroSinLid } = conDosFilas(910);
  const [ADMIN, OWNER] = [unNumero(911), `${globalThis.owners[0]}@s.whatsapp.net`];
  const client = clientePorNumero(t, [...porNumeroSinLid, { id: ADMIN, admin: "admin" }, { id: OWNER, admin: null }, { id: BOT.jid, admin: "admin" }]);
  usyncFalso(t, { [X]: L }, client);
  const antes = globalThis.plugins;
  t.after(() => {
    globalThis.plugins = antes;
  });
  const corrieron = [];
  globalThis.plugins = { "grupo-silenciar.js": P.silenciar, "owner-banuser.js": P.banuser, "owner-restaurar-usuario.js": P.rd, "espia.js": { cmd: ["espia"], run: async (m) => corrieron.push(m.sender) } };
  const arrobaX = `@${digitos(X)}`;
  const silencio = () => [L, X].map((id) => Boolean(F.getUser(id, C).inGroup[C]?.mute));
  const borrados = async () => {
    globalThis.enviados = [];
    await llega(client, C, X, "sigo hablando");
    return globalThis.enviados.filter((e) => e.msg?.delete).length;
  };
  await llega(client, C, ADMIN, `.mute ${arrobaX}`, [X]);
  assert.deepEqual([silencio(), await borrados()], [[true, true], 1], ".mute");
  await llega(client, C, ADMIN, `.unmute ${arrobaX}`, [X]);
  assert.deepEqual([silencio(), await borrados()], [[false, false], 0], ".unmute");

  const baneo = () => [L, X].map((id) => Boolean(F.getUser(id).banned));
  await llega(client, C, OWNER, `.banuser ${arrobaX}`, [X]);
  await llega(client, C, X, ".espia");
  assert.deepEqual([baneo(), corrieron], [[true, true], []], ".banuser");
  await llega(client, C, OWNER, `.unbanuser ${arrobaX}`, [X]);
  await llega(client, C, X, ".espia");
  assert.deepEqual([baneo(), corrieron], [[false, false], [X]], ".unbanuser");
  // .rd clears both rows: left behind, the number's kept the ban.
  await llega(client, C, OWNER, `.banuser ${arrobaX}`, [X]);
  await llega(client, C, OWNER, `.rd ${arrobaX}`, [X]);
  assert.deepEqual([L, X].map((id) => F.getUser(id)), [null, null], ".rd");
  await llega(client, C, X, ".espia");
  assert.deepEqual(corrieron, [X, X], "después de .rd");
});

// An owner resets themselves from their number alone: both rows are theirs.
test(".rd de un owner a sí mismo desde su número borra sus dos filas", async (t) => {
  const X = `${globalThis.owners[0]}@s.whatsapp.net`;
  const L = unaLid(915);
  db.prepare("INSERT OR IGNORE INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(X, X, "Owner por número", 1);
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(L, "", "Owner por LID", 2);
  usyncFalso(t, { [X]: L });
  const responde = await correr("rd", { sender: X, command: "rd", texto: `@${digitos(X)}`, mentionedJid: [X], participants: [{ id: X, admin: null }] });
  assert.deepEqual([L, X].map((id) => F.getUser(id)), [null, null], responde);
});

// ---------- what waits on their answer ----------

// R asks by the LID, as the bot knows them, and they answer from the number their messages bring. The couple is the
// LID's, as everything done to them when they're named.
test("quien escribe desde su número acepta o rechaza la pareja que le pidieron por su LID", async (t) => {
  const [a, b] = [conDosFilas(920), conDosFilas(921)];
  const [R, R2] = [unaLid(922), unaLid(923)];
  for (const id of [R, R2]) F.initDataDB({ chat: G, sender: id, senderJid: "", pushName: "Pide" });
  usyncFalso(t, { [a.X]: a.L, [b.X]: b.L });
  const grupo = [...a.porNumeroSinLid, ...b.porNumeroSinLid, { id: R, admin: null }, { id: R2, admin: null }];
  const pide = (de, p) => correr("pareja", { sender: de, command: "pareja", texto: `@${digitos(p.X)}`, mentionedJid: [p.X], participants: grupo });
  const contesta = (command, p, de) => correr(command, { sender: p.X, command, texto: `@${digitos(de)}`, mentionedJid: [de], participants: grupo });
  await pide(R, a);
  assert.equal(Par.solicitudDe(R)?.para, a.L, "se lo piden a la LID");
  const acepta = await contesta("aceptar", a, R);
  assert.deepEqual([Par.parejaDe(a.L)?.pareja, Par.parejaDe(a.X)], [R, null], acepta);
  await pide(R2, b);
  const rechaza = await contesta("rechazar", b, R2);
  assert.deepEqual([Par.solicitudDe(R2), Par.parejaDe(b.L)], [null, null], rechaza);
});

// The challenge is played by whoever accepted, by the number they answered with: the coins they have in this group,
// and the fight they move from it.
test("quien escribe desde su número acepta el duelo que le pidieron por su LID, y lo juega con lo suyo de acá", async (t) => {
  const { X, L, porNumeroSinLid } = conDosFilas(930);
  const [R, R2, R3] = [unaLid(931), unaLid(932), unaLid(933)];
  for (const id of [X, R, R2, R3]) fijarSaldo(F, G, id, 1000);
  usyncFalso(t, { [X]: L });
  const randomInt = D._rng.randomInt;
  t.after(() => {
    D._rng.randomInt = randomInt;
    limpiarDuelos();
  });
  const grupo = [...porNumeroSinLid, ...[R, R2, R3].map((id) => ({ id, admin: null }))];
  const desafia = (retador, resto = "") => correr("duelo", { sender: retador, command: "duelo", texto: `@${digitos(X)} 20${resto}`, mentionedJid: [X], participants: grupo });
  const contesta = (command) => correr("duelo", { sender: X, command, participants: grupo });
  await desafia(R);
  assert.equal(D.duelos.get(`${G}|${L}`)?.retador, R, "lo desafían por la LID");
  const tiradas = [1, 6]; // R's die, then theirs: they win
  D._rng.randomInt = () => tiradas.shift();
  const dado = await contesta("acepto");
  D._rng.randomInt = randomInt;
  assert.deepEqual([F.getSaldoCoins(G, X), F.getSaldoCoins(G, L), F.getSaldoCoins(G, R), D.duelos.size], [1020, 0, 980, 0], dado);
  await desafia(R2, " pelea");
  await contesta("acepto");
  assert.deepEqual([D.peleas.get(`${G}|${X}`)?.orden.includes(R2), D.peleas.has(`${G}|${L}`)], [true, false], "la pelea");
  // Another fight, while they're in that one by the number: it waits, and turned down, the stake goes back.
  await desafia(R3, " pelea");
  const otraPelea = await contesta("acepto");
  assert.ok(/Estás en otra pelea/.test(otraPelea) && D.duelos.has(`${G}|${L}`), otraPelea);
  const rechaza = await contesta("rechazo");
  assert.deepEqual([F.getSaldoCoins(G, R3), D.duelos.size], [1000, 0], rechaza);
});

// The aura duel the same way (lib/aura.js): challenged by the LID, they answer from the number and play the duel by it,
// and their reactions, from either id, aren't votes in it. And from the number, naming their own LID is challenging
// themselves: the group lists both as one participant (.duelo still lets it through).
test("quien escribe desde su número acepta la batalla de aura que le pidieron por su LID, y no vota en el suyo", async (t) => {
  const Aura = await import("../lib/aura.js");
  const R = await import("../lib/reacciones.js");
  t.after(() => Aura.olvidarDuelosDeAura());
  const { X, L, porNumeroSinLid } = conDosFilas(935);
  const R1 = unaLid(936);
  usyncFalso(t, { [X]: L });
  const grupo = [...porNumeroSinLid, { id: R1, admin: null }];
  await correr("aura", { sender: R1, command: "aura", texto: `@${digitos(X)}`, mentionedJid: [X], participants: grupo });
  assert.equal(Aura.desafios.get(G)?.retado, L, "lo desafían por la LID");
  const votacion = await correr("aura", { sender: X, command: "aura", texto: "si", participants: grupo });
  assert.match(votacion, new RegExp(`🔴 @${digitos(X)}\\n`), votacion);
  const id = Aura.votaciones[G].mensajeId;
  const vota = (participant, participantAlt) => R.contarReaccion(cliente(), { key: { remoteJid: G, id, participant: "bot@lid", fromMe: true }, reaction: { text: "🔴", key: { participant, participantAlt } } });
  vota(X, L);
  vota(L);
  vota(X);
  assert.equal(Aura.votaciones[G].votos.size, 0, "desde ninguno de sus ids");
  Aura.olvidarDuelosDeAura();
  const aSiMismo = await correr("aura", { sender: X, command: "aura", texto: `@${digitos(L)}`, mentionedJid: [L], participants: [{ id: X, lid: L, admin: null }] });
  assert.equal(aSiMismo, "❌ Desafiarte a vos mismo no cuenta 😅");

  // In a group that lists them by the LID alone, the number they answered from is only in their answer: from it, their
  // reactions aren't votes either.
  const otro = conDosFilas(937);
  usyncFalso(t, { [otro.X]: otro.L });
  const porLidSolo = [{ id: otro.L, admin: null }, { id: R1, admin: null }];
  await correr("aura", { sender: R1, command: "aura", texto: `@${digitos(otro.L)}`, mentionedJid: [otro.L], participants: porLidSolo });
  await correr("aura", { sender: otro.X, command: "aura", texto: "si", participants: porLidSolo });
  const boleta = Aura.votaciones[G]?.mensajeId;
  assert.ok(boleta, "lo aceptó desde su número");
  R.contarReaccion(cliente(), { key: { remoteJid: G, id: boleta, participant: "bot@lid", fromMe: true }, reaction: { text: "🔴", key: { participant: otro.X } } });
  assert.equal(Aura.votaciones[G].votos.size, 0);
});

// The child is the LID, as everything done to them when they're named.
test("quien escribe desde su número acepta o rechaza la adopción que le pidieron por su LID", async (t) => {
  const [a, b] = [conDosFilas(940), conDosFilas(941)];
  const [A, B, C, E] = [unaLid(942, 1), unaLid(942, 2), unaLid(943, 1), unaLid(943, 2)];
  for (const [uno, otro] of [[A, B], [C, E]]) {
    for (const id of [uno, otro]) F.initDataDB({ chat: G, sender: id, senderJid: "", pushName: "Casados" });
    fijarSaldo(F, G, uno, 1000);
    Par.fijarPareja(uno, otro);
    Par.fijarCasamiento(uno, otro);
  }
  usyncFalso(t, { [a.X]: a.L, [b.X]: b.L });
  const grupo = [...a.porNumeroSinLid, ...b.porNumeroSinLid, ...[A, B, C, E].map((id) => ({ id, admin: null }))];
  const adopta = (padre, p) => correr("adoptar", { sender: padre, command: "adoptar", texto: `@${digitos(p.X)}`, mentionedJid: [p.X], participants: grupo });
  await adopta(A, a);
  assert.equal(Fam.solicitudAdopcionDe(a.L)?.padre_a, A, "se lo piden a la LID");
  const si = await correr("si", { sender: a.X, command: "si", participants: grupo });
  assert.deepEqual([Fam.padresDe(a.L), Fam.padresDe(a.X)], [[A, B], null], si);
  await adopta(C, b);
  const no = await correr("no", { sender: b.X, command: "no", participants: grupo });
  assert.deepEqual([Fam.solicitudAdopcionDe(b.L), Fam.padresDe(b.L), F.getSaldoCoins(G, C)], [null, null, 1000], no);
});

// In a group that lists people by number alone, every answer comes from a number: WhatsApp is asked only when something
// waits on a LID and the group doesn't pair the number with one.
test("al que contesta desde su número le pregunta a WhatsApp solo si algo espera a una LID y el grupo no la da", async (t) => {
  t.after(limpiarDuelos);
  // The group pairs the number with the LID: it says, when asking and when answering.
  const a = conDosFilas(950);
  const R = unaLid(951);
  F.initDataDB({ chat: G, sender: R, senderJid: "", pushName: "Pide" });
  const consultas = usyncFalso(t, {});
  const grupoA = [...a.porNumero, { id: R, admin: null }];
  await correr("pareja", { sender: R, command: "pareja", texto: `@${digitos(a.X)}`, mentionedJid: [a.X], participants: grupoA });
  await correr("aceptar", { sender: a.X, command: "aceptar", texto: `@${digitos(R)}`, mentionedJid: [R], participants: grupoA });
  assert.deepEqual([Par.parejaDe(a.L)?.pareja, consultas.length], [R, 0], "el grupo");

  // Asked by the number itself (someone the bot knows by it alone): WhatsApp is asked when asking, not when answering.
  const b = soloPorNumero(952);
  const R2 = unaLid(953);
  F.initDataDB({ chat: G, sender: R2, senderJid: "", pushName: "Pide" });
  const deB = usyncFalso(t, { [b.X]: b.L });
  const grupoB = [...b.porNumeroSinLid, { id: R2, admin: null }];
  await correr("pareja", { sender: R2, command: "pareja", texto: `@${digitos(b.X)}`, mentionedJid: [b.X], participants: grupoB });
  await correr("aceptar", { sender: b.X, command: "aceptar", texto: `@${digitos(R2)}`, mentionedJid: [R2], participants: grupoB });
  assert.deepEqual([Par.parejaDe(b.X)?.pareja, deB.length], [R2, 1], "por su número");

  // Nothing waits on a LID: a challenge in another group, and an adoption request that expired. What other tests leave
  // pending goes first: another test's adoption request, run before, made this one ask.
  limpiarDuelos();
  db.exec("DELETE FROM solicitudes_adopcion");
  const OTRO_GRUPO = "otro-grupo@g.us";
  fijarSaldo(F, OTRO_GRUPO, R2, 1000);
  D.desafiar(OTRO_GRUPO, R2, unaLid(959), 20, "dado");
  F.guardarSolicitudAdopcion(unaLid(954), unaLid(955, 1), unaLid(955, 2), G, 0, Date.now() - (Fam.FAMILIA.DIAS_SOLICITUD + 1) * 86_400_000);
  await correr("duelo", { sender: b.X, command: "acepto", participants: grupoB });
  await correr("si", { sender: b.X, command: "si", participants: grupoB });
  assert.equal(deB.length, 1, "nada espera a una LID");

  // A challenge for the number itself, and one for a LID: the one for the number, without asking.
  const [R3, R4, OTRA] = [unaLid(956), unaLid(957), unaLid(958)];
  for (const id of [b.X, R3, R4]) fijarSaldo(F, G, id, 1000);
  D.desafiar(G, R3, b.X, 20, "dado");
  D.desafiar(G, R4, OTRA, 20, "dado");
  await correr("duelo", { sender: b.X, command: "rechazo", participants: grupoB });
  assert.deepEqual([D.duelos.has(`${G}|${b.X}`), D.duelos.has(`${G}|${OTRA}`), deB.length], [false, true, 1], "el del número");
});

// The LID the group pairs the number with, or failing that the one WhatsApp says has it now, and no other: not the one
// something was asked of, if it's someone else's, nor the one the database has the number on, which may be whoever had
// it before.
test("desde un número que el grupo o WhatsApp dan a otra LID no se contesta lo que le pidieron a la primera", async (t) => {
  const { X, L } = conDosFilas(960);
  const [OTRA, R] = [unaLid(961), unaLid(962)];
  F.initDataDB({ chat: G, sender: R, senderJid: "", pushName: "Pide" });
  Par.pedirPareja(R, L, G);
  const consultas = usyncFalso(t, { [X]: OTRA });
  const acepta = (deX) => correr("aceptar", { sender: X, command: "aceptar", texto: `@${digitos(R)}`, mentionedJid: [R], participants: [deX, { id: R, admin: null }] });
  await acepta({ id: X, admin: null });
  assert.deepEqual([Par.parejaDe(L), Par.solicitudDe(R)?.para, consultas.length], [null, L, 1], "WhatsApp");
  await acepta({ id: X, lid: OTRA, admin: null });
  assert.deepEqual([Par.parejaDe(L), Par.solicitudDe(R)?.para, consultas.length], [null, L, 1], "el grupo");
  F.updateUser(L, { jid: X }); // the database has the number on L, and WhatsApp says nothing
  usyncFalso(t, {});
  await acepta({ id: X, admin: null });
  assert.deepEqual([Par.parejaDe(L), Par.solicitudDe(R)?.para], [null, L], "la base");
});

// Asked by the LID by themselves, from the number: answering it from the number would duel them against themselves, or
// make them their own child.
test("quien escribe desde su número no contesta lo que se pidió a sí mismo por su LID", async (t) => {
  t.after(limpiarDuelos);
  const [a, b] = [conDosFilas(970), conDosFilas(971)];
  const [S, S2, R, A, B, OTRA] = [unaLid(972), unaLid(973), unaLid(974), unaLid(975, 1), unaLid(975, 2), unaLid(976)];
  for (const id of [S, S2]) F.initDataDB({ chat: G, sender: id, senderJid: "", pushName: "Cónyuge" });
  for (const id of [a.X, S2, R]) fijarSaldo(F, G, id, 1000);
  usyncFalso(t, { [a.X]: a.L, [b.X]: b.L });
  const grupo = [...a.porNumeroSinLid, ...b.porNumeroSinLid, ...[S, S2, R].map((id) => ({ id, admin: null }))];
  // A challenge of their own, and somebody else's in the same group, so that WhatsApp is asked.
  await correr("duelo", { sender: a.X, command: "duelo", texto: `@${digitos(a.X)} 20`, mentionedJid: [a.X], participants: grupo });
  assert.equal(D.duelos.get(`${G}|${a.L}`)?.retador, a.X, "se desafió a sí mismo por la LID");
  D.desafiar(G, R, OTRA, 20, "dado");
  const acepta = await correr("duelo", { sender: a.X, command: "acepto", participants: grupo });
  assert.ok(/No tenés ningún desafío pendiente/.test(acepta) && D.duelos.has(`${G}|${a.L}`), acepta);
  // Adoptions of their own, married by the number: asked by them, or by their spouse. And somebody else's.
  Par.fijarPareja(a.X, S);
  Par.fijarCasamiento(a.X, S);
  Par.fijarPareja(b.X, S2);
  Par.fijarCasamiento(b.X, S2);
  const adopta = (padre, p) => correr("adoptar", { sender: padre, command: "adoptar", texto: `@${digitos(p.X)}`, mentionedJid: [p.X], participants: grupo });
  await adopta(a.X, a);
  await adopta(S2, b);
  assert.deepEqual([Fam.solicitudAdopcionDe(a.L)?.padre_a, Fam.solicitudAdopcionDe(b.L)?.padre_b], [a.X, b.X], "se pidieron por la LID");
  F.guardarSolicitudAdopcion(OTRA, A, B, G, 0, Date.now());
  for (const p of [a, b]) {
    const si = await correr("si", { sender: p.X, command: "si", participants: grupo });
    assert.deepEqual([Fam.padresDe(p.L), Boolean(Fam.solicitudAdopcionDe(p.L))], [null, true], si);
  }
});
