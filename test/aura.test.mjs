import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { prepararBase, esperar } from "./helpers.mjs";

// The aura duel (lib/aura.js, plugins/fun-aura.js, plugins/fun-noaura.js): .aura @persona challenges, .aura si opens
// Claudia's ballot, and for five minutes the group votes reacting with 🔵 or 🔴; whoever gets more votes adds 1.000
// of aura of the month. Votes reach the bot as reactions (lib/reacciones.js), where a reaction taken back, or
// switched, used to die before counting anything.

let F, A, R, Aura, NoAura, mesDe, MESES, juegoDelMensaje, secciones, seccionesDelMenu;
const BOT = "bot@lid"; // clienteFalso's
const BOT_JID = "bot@s.whatsapp.net";
const lid = (n) => `7${String(n).padStart(9, "0")}@lid`;
const num = (n) => `598990${String(n).padStart(5, "0")}@s.whatsapp.net`;
const at = (n) => `@${lid(n).split("@")[0]}`;
const nombre = (n) => `Persona ${n}`;
// A group that lists people by LID, with their number apart, and Claudia.
const grupo = (...ns) => [...ns.map((n) => ({ id: lid(n), phoneNumber: num(n), admin: null })), { id: BOT, admin: "admin" }];
const TODOS = grupo(1, 2, 3, 4, 5, 6, 7, 8);
let k = 0;
const nuevoChat = () => `aura-${++k}@g.us`;

before(async () => {
  ({ F } = await prepararBase("aura"));
  A = await import("../lib/aura.js");
  R = await import("../lib/reacciones.js");
  Aura = (await import("../plugins/fun-aura.js")).default;
  NoAura = (await import("../plugins/fun-noaura.js")).default;
  ({ mesDe, MESES } = await import("../lib/hashtags.js"));
  ({ juegoDelMensaje } = await import("../lib/mensajes-de-juego.js"));
  ({ secciones } = await import("../lib/secciones.js"));
  ({ seccionesDelMenu } = await import("../lib/menu.js"));
  for (let n = 1; n <= 20; n++) F.initDataDB({ chat: "aura@g.us", sender: lid(n), senderJid: num(n), pushName: nombre(n) });
});

// A command as handle-message runs it, by person n (their LID, with their number) in chat C. Returns what the bot
// sent for it. globalThis.enviados is never emptied here: clienteFalso numbers its messages by it, and each one keeps
// its id.
async function correr(plugin, C, n, { command = "aura", texto = "", mentionedJid = [], quoted = null, participants = TODOS, sender = lid(n), senderJid = num(n), client = globalThis.client } = {}) {
  const antes = globalThis.enviados.length;
  const m = { chat: C, isGroup: true, sender, senderJid, pushName: nombre(n), text: `.${command} ${texto}`.trim(), mentionedJid, quoted, key: { id: `CMD${++k}` } };
  await plugin.run(m, { client, text: texto, args: texto.split(" ").filter(Boolean), command, usedPrefix: ".", participants });
  return globalThis.enviados.slice(antes).map((e) => e.msg);
}
const desafiar = (C, n, a, opciones = {}) => correr(Aura, C, n, { texto: at(a), mentionedJid: [lid(a)], ...opciones });
const contestar = (C, n, respuesta, opciones = {}) => correr(Aura, C, n, { texto: respuesta, ...opciones });
const texto = (enviados) => enviados.map((msg) => msg?.text).join(" | ");

// A reaction as Baileys hands it over (main.js -> contarReaccion): the key of the message reacted to, and who reacted,
// by participant and, when the group brings it, participantAlt.
const reaccionar = (C, mensajeId, reactor, emoji, { alt, fromMe = false } = {}) =>
  R.contarReaccion(globalThis.client, { key: { remoteJid: C, id: mensajeId, participant: BOT, fromMe: true }, reaction: { text: emoji, key: { participant: reactor, participantAlt: alt, fromMe } } });
const boleta = (C) => A.votaciones[C]?.mensajeId;
const votosDe = (C) => [...A.votaciones[C].votos.values()].map((v) => v.lado).sort();

// The timers in milliseconds instead of minutes, put back afterwards, and nothing left running.
function rapido(t, { respuesta = 0.002, votacion = 0.002 } = {}) {
  const antes = { ...A.AURA };
  Object.assign(A.AURA, { MINUTOS_RESPUESTA: respuesta, MINUTOS_VOTACION: votacion });
  t.after(() => Object.assign(A.AURA, antes));
}
const limpio = (t) => t.after(() => A.olvidarDuelosDeAura());

test("el desafío y la votación, con sus textos, y los mensajes quedan como de juego", async (t) => {
  limpio(t);
  const C = nuevoChat();
  const [desafio] = await desafiar(C, 1, 2);
  assert.equal(desafio.text, `✨ ${at(1)} desafía a ${at(2)} a una *batalla de aura*: si acepta, el grupo vota quién tiene más.\n${at(2)}: .aura si para aceptar o .aura no para pasar (tenés 5 minutos).`);
  assert.deepEqual(desafio.mentions, [lid(1), lid(2)]);
  assert.equal(juegoDelMensaje(`MSG${globalThis.enviados.length}`), "aura", "las respuestas al desafío no son para Claudia");
  const [votacion] = await contestar(C, 2, "si");
  assert.equal(votacion.text, `🗳️ *Batalla de aura*\n🔵 ${at(1)}  vs  🔴 ${at(2)}\nReaccioná a este mensaje con 🔵 o 🔴: ¿quién tiene más aura? Cierra en 5 minutos.`);
  assert.deepEqual(votacion.mentions, [lid(1), lid(2)]);
  assert.equal(juegoDelMensaje(boleta(C)), "aura");
});

test("la batalla entera: gana quien saca más votos, suma 1.000 del mes, y votar no paga UruCoins ni suma al ranking", async (t) => {
  rapido(t);
  limpio(t);
  const C = nuevoChat();
  await desafiar(C, 1, 2);
  await contestar(C, 2, "si");
  const id = boleta(C);
  reaccionar(C, id, lid(3), "🔵");
  reaccionar(C, id, lid(4), "🔵");
  reaccionar(C, id, lid(5), "🔴");
  // An ordinary reaction to one of Claudia's messages in the same group still pays: votes are the exception.
  reaccionar(C, "OTRO", lid(6), "😂");
  const antes = globalThis.enviados.length;
  await esperar(300);
  const [resultado] = globalThis.enviados.slice(antes).map((e) => e.msg);
  assert.equal(resultado.text, `🏆 *Batalla de aura*: 🔵 ${at(1)} 2 votos · 🔴 ${at(2)} 1 voto\n${at(1)} tiene más aura y suma *+1.000* este mes.`);
  assert.deepEqual(resultado.mentions, [lid(1), lid(2)]);
  assert.deepEqual(F.auraDe(C, mesDe(), lid(1)), { delMes: 1000, puesto: 1, total: 1000, ganados: 1, perdidos: 0 });
  assert.deepEqual(F.auraDe(C, mesDe(), lid(2)), { delMes: 0, puesto: null, total: 0, ganados: 0, perdidos: 1 });
  for (const n of [3, 4, 5]) {
    assert.equal(F.getSaldoCoins(C, lid(n)), 0, `votar no paga (${n})`);
    assert.equal(F.puestoRankingMensual(mesDe(), C, lid(n)), null, `ni suma al ranking de reacciones (${n})`);
  }
  assert.equal(F.getSaldoCoins(C, lid(6)), 1, "la reacción común paga");
  assert.equal(A.dueloDeAuraEn(C), null, "el grupo queda libre");
});

test("el voto: vale la última reacción, quitarla o cambiarla por otro emoji lo saca, y los que juegan y Claudia no votan", async (t) => {
  limpio(t);
  const C = nuevoChat();
  await desafiar(C, 1, 2);
  await contestar(C, 2, "si");
  const id = boleta(C);
  reaccionar(C, id, lid(3), "🔵");
  reaccionar(C, id, lid(3), "🔴");
  assert.deepEqual(votosDe(C), ["retado"], "cambia el voto: la reacción repetida no la frena lo que cuenta las comunes");
  reaccionar(C, id, lid(3), "");
  assert.deepEqual(votosDe(C), [], "quitada, no vota");
  reaccionar(C, id, lid(4), "🔵");
  reaccionar(C, id, lid(4), "😂");
  assert.deepEqual(votosDe(C), [], "otro emoji saca el voto");
  reaccionar(C, id, lid(5), "🔵\uFE0F");
  assert.deepEqual(votosDe(C), ["retador"], "con el selector de variante también");
  // The two playing, as the group lists them and from their number, with and without the LID beside it.
  reaccionar(C, id, lid(1), "🔵");
  reaccionar(C, id, num(2), "🔴", { alt: lid(2) });
  reaccionar(C, id, num(1), "🔵");
  reaccionar(C, id, BOT, "🔴", { fromMe: true });
  reaccionar(C, id, BOT_JID, "🔴");
  assert.deepEqual(votosDe(C), ["retador"], "ni los que juegan ni Claudia");
  // The same person by their number and their LID, either way round, votes once.
  reaccionar(C, id, num(6), "🔴", { alt: lid(6) });
  reaccionar(C, id, lid(6), "🔵");
  reaccionar(C, id, num(7), "🔴");
  reaccionar(C, id, lid(7), "🔴");
  assert.deepEqual(votosDe(C), ["retado", "retador", "retador"], "por su número solo y después por su LID: la base dice que es suyo");
  reaccionar(C, id, num(7), "🔵", { alt: lid(7) });
  assert.deepEqual(votosDe(C), ["retador", "retador", "retador"]);
  // A reaction to another message in the group is no vote.
  reaccionar(C, "OTRO", lid(8), "🔴");
  assert.equal(A.votaciones[C].votos.size, 3);

  // Whoever challenged, whom the group lists by the LID alone and whose message brought no number, reacting from their
  // number alone: the database says the number is theirs, and it's no vote either.
  const D = nuevoChat();
  const porLidSolo = [{ id: lid(3), admin: null }, ...grupo(4)];
  await desafiar(D, 3, 4, { senderJid: "", participants: porLidSolo });
  await contestar(D, 4, "si", { participants: porLidSolo });
  reaccionar(D, boleta(D), num(3), "🔵");
  assert.equal(A.votaciones[D].votos.size, 0);
});

test("empate o sin votos: nadie suma ni se anota nada, y una reacción tardía tampoco paga", async (t) => {
  rapido(t);
  limpio(t);
  const C = nuevoChat();
  await desafiar(C, 1, 2);
  await contestar(C, 2, "si");
  const id = boleta(C);
  reaccionar(C, id, lid(3), "🔵");
  reaccionar(C, id, lid(4), "🔴");
  let antes = globalThis.enviados.length;
  await esperar(300);
  assert.equal(globalThis.enviados[antes]?.msg.text, `🤝 *Batalla de aura*: 🔵 ${at(1)} 1 voto · 🔴 ${at(2)} 1 voto\nEmpate: nadie suma aura.`);
  for (const n of [1, 2]) assert.deepEqual(F.auraDe(C, mesDe(), lid(n)), { delMes: 0, puesto: null, total: 0, ganados: 0, perdidos: 0 });
  reaccionar(C, id, lid(5), "🔵");
  assert.equal(F.getSaldoCoins(C, lid(5)), 0, "la boleta cerrada no paga como una reacción común");

  const D = nuevoChat();
  await desafiar(D, 3, 4);
  await contestar(D, 4, "si");
  antes = globalThis.enviados.length;
  await esperar(300);
  assert.equal(globalThis.enviados[antes]?.msg.text, `🦗 *Batalla de aura*: nadie votó entre ${at(3)} y ${at(4)}, así que nadie suma aura.`);
  assert.deepEqual(F.auraDe(D, mesDe(), lid(3)).ganados + F.auraDe(D, mesDe(), lid(4)).perdidos, 0);
});

test("rechazar, retirar, contestar sin nada pendiente y el desafío que vence: el grupo queda libre", async (t) => {
  rapido(t, { respuesta: 0.002, votacion: 5 });
  limpio(t);
  const C = nuevoChat();
  await desafiar(C, 1, 2);
  assert.equal(texto(await contestar(C, 2, "no")), `🏳️ ${at(2)} no aceptó la batalla de aura de ${at(1)}.`);
  assert.equal(A.dueloDeAuraEn(C), null);
  await desafiar(C, 1, 3);
  assert.equal(texto(await contestar(C, 1, "no")), `↩️ ${at(1)} retiró su desafío de aura.`, "quien desafió lo retira");
  assert.equal(A.dueloDeAuraEn(C), null);
  assert.equal(texto(await contestar(C, 4, "si")), "❌ No tenés ningún desafío de aura pendiente. Para desafiar a alguien: .aura @persona");
  await desafiar(C, 6, 5);
  const antes = globalThis.enviados.length;
  await esperar(300);
  const [aviso] = globalThis.enviados.slice(antes).map((e) => e.msg);
  assert.equal(aviso?.text, `⌛ La batalla de aura de ${at(6)} contra ${at(5)} venció sin respuesta.`);
  assert.deepEqual(aviso.mentions, [lid(6), lid(5)]);
  assert.equal(A.dueloDeAuraEn(C), null);
  assert.equal(texto(await contestar(C, 5, "si")), "❌ No tenés ningún desafío de aura pendiente. Para desafiar a alguien: .aura @persona", "vencido, ya no se acepta");
});

test("los chequeos del desafío: a quién, Claudia, de otro grupo, a sí mismo (también desde su número) y sin la lista", async (t) => {
  limpio(t);
  const C = nuevoChat();
  assert.equal(texto(await correr(Aura, C, 1, { texto: "dale" })), "❌ ¿A quién desafiás? Elegí a la persona de la lista que aparece al escribir @, o respondé un mensaje suyo con .aura");
  assert.equal(texto(await correr(Aura, C, 1, { texto: `@${BOT.split("@")[0]}`, mentionedJid: [BOT] })), "❌ Conmigo no: yo el aura la traigo de fábrica 😌");
  assert.equal(texto(await desafiar(C, 1, 9)), "❌ Solo podés desafiar a alguien de este grupo.");
  assert.equal(texto(await desafiar(C, 1, 1)), "❌ Desafiarte a vos mismo no cuenta 😅");
  // From their number alone, naming their own LID: the group lists both as the same participant, and with them not
  // listed, the database says the number is that LID's.
  assert.equal(texto(await desafiar(C, 1, 1, { sender: num(1), senderJid: num(1) })), "❌ Desafiarte a vos mismo no cuenta 😅");
  assert.equal(texto(await desafiar(C, 1, 1, { sender: num(1), senderJid: num(1), participants: [{ id: lid(1), admin: null }, { id: BOT, admin: "admin" }] })), "❌ Desafiarte a vos mismo no cuenta 😅");
  const otraVez = await desafiar(C, 2, 1, { sender: num(2), senderJid: num(2), participants: [{ id: lid(1), phoneNumber: num(1), admin: null }, { id: BOT, admin: "admin" }] });
  assert.match(texto(otraVez), /desafía a/, "desde su número, a otra persona sí");
  A.olvidarDuelosDeAura();
  assert.equal(texto(await desafiar(C, 1, 2, { participants: [] })), "❌ No pude ver la lista de miembros del grupo; probá de nuevo en un rato.");
  assert.equal(A.dueloDeAuraEn(C), null, "nada de eso abre un desafío");
});

test("una batalla a la vez por grupo, mientras se espera la respuesta y mientras se vota", async (t) => {
  limpio(t);
  const C = nuevoChat();
  await desafiar(C, 1, 2);
  assert.equal(texto(await desafiar(C, 3, 4)), `❌ Ya hay una batalla de aura en curso (${nombre(1)} contra ${nombre(2)}): esperá a que termine.`);
  assert.equal(texto(await desafiar(C, 2, 3)), "❌ Ya te desafiaron: respondé .aura si o .aura no.");
  await contestar(C, 2, "si");
  assert.equal(texto(await desafiar(C, 3, 4)), `❌ Ya hay una batalla de aura en curso (${nombre(1)} contra ${nombre(2)}): esperá a que termine.`);
  assert.match(texto(await desafiar(nuevoChat(), 3, 4)), /desafía a/, "en otro grupo, sí");
});

test("los topes: tres desafíos por día por persona, contados igual si no se juegan, y una batalla jugada por día por pareja", async (t) => {
  rapido(t, { respuesta: 5, votacion: 0.002 });
  limpio(t);
  const C = nuevoChat();
  const ahora = Date.now();
  const manana = ahora + 24 * 3600e3;
  const desafio = (de, a, cuando = ahora) => A.desafiarAura(C, { retador: lid(de), retadorJid: num(de), retado: lid(a), participants: TODOS, ahora: cuando });
  for (const a of [2, 3, 4]) {
    assert.equal(desafio(1, a).ok, true, `el desafío a ${a}`);
    A.rechazarAura(C, { quien: lid(a) });
  }
  assert.deepEqual(desafio(1, 5), { ok: false, error: "Ya hiciste 3 desafíos de aura hoy en este grupo: mañana podés de nuevo." });

  // A pair that played: neither of the two challenges the other again that day, the other way round neither.
  await desafiar(C, 6, 7);
  await contestar(C, 7, "si");
  await esperar(300);
  assert.deepEqual(desafio(6, 7), { ok: false, error: `${nombre(7)} y vos ya tuvieron una batalla de aura hoy: mañana pueden de nuevo.` });
  assert.deepEqual(desafio(7, 6), { ok: false, error: `${nombre(6)} y vos ya tuvieron una batalla de aura hoy: mañana pueden de nuevo.` });
  // One that wasn't played doesn't count for the pair.
  assert.equal(desafio(8, 2).ok, true);
  A.rechazarAura(C, { quien: lid(2) });
  assert.equal(desafio(8, 2).ok, true, "rechazado, la pareja puede de nuevo");
  A.rechazarAura(C, { quien: lid(2) });
  assert.equal(desafio(6, 7, manana).ok, true, "al otro día, la pareja de nuevo");
  A.rechazarAura(C, { quien: lid(7) });
  assert.equal(desafio(1, 5, manana).ok, true, "y el tope de desafíos, también");
});

test("si la votación no sale, la batalla queda sin efecto, el grupo libre y la pareja sin gastar", async (t) => {
  limpio(t);
  const base = globalThis.client;
  const falla = (como) => Object.create(base, { sendMessage: { value: async (chat, msg, ...resto) => (String(msg?.text).startsWith("🗳️") ? como() : base.sendMessage(chat, msg, ...resto)) } });
  const logReal = console.error;
  console.error = () => {};
  t.after(() => (console.error = logReal));
  for (const [caso, cliente] of [["tira un error", falla(() => Promise.reject(new Error("se cayó")))], ["no devuelve nada", falla(() => undefined)]]) {
    const C = nuevoChat();
    await desafiar(C, 1, 2);
    assert.equal(texto(await contestar(C, 2, "si", { client: cliente })), "❌ No pude abrir la votación, así que la batalla queda sin efecto. Probá de nuevo en un rato.", caso);
    assert.equal(A.dueloDeAuraEn(C), null, caso);
    assert.match(texto(await desafiar(C, 1, 2)), /desafía a/, `${caso}: la pareja no jugó`);
  }
});

test("si quien desafió ya no está en el grupo, aceptar no abre la votación", async (t) => {
  limpio(t);
  const C = nuevoChat();
  await desafiar(C, 1, 2);
  assert.equal(texto(await contestar(C, 2, "si", { participants: grupo(2, 3) })), "❌ Quien te desafió ya no está en el grupo: la batalla queda sin efecto.");
  assert.equal(A.dueloDeAuraEn(C), null);
});

test(".noaura y .siaura: los cuatro estados, nadie desafía ni es desafiado afuera, y anda siempre", async (t) => {
  rapido(t, { respuesta: 0.002, votacion: 5 });
  limpio(t);
  const C = nuevoChat();
  const pedir = async (n, command) => texto(await correr(NoAura, C, n, { command }));
  F.updateUserInGroup(lid(3), C, { sinTagall: true });
  assert.equal(await pedir(3, "siaura"), "✨ Ya estás en las batallas de aura de este grupo. Con .noaura te salís.");
  assert.equal(await pedir(3, "noaura"), "🚫 Listo: en este grupo ya no te pueden desafiar a batallas de aura, ni vos podés desafiar a nadie. El aura que ganaste sigue en el ranking. Con .siaura volvés.");
  assert.equal(await pedir(3, "noaura"), "🚫 Ya estabas fuera de las batallas de aura de este grupo. Con .siaura volvés.");
  assert.equal(F.getUser(lid(3)).inGroup[C].sinTagall, true, "lo demás del grupo, como estaba");
  const contra = await desafiar(C, 1, 3);
  assert.equal(texto(contra), `❌ ${nombre(3)} no juega batallas de aura en este grupo.`);
  assert.ok(!texto(contra).includes(at(3)) && !contra.some((msg) => msg.mentions?.length), "sin arrobarlo");
  assert.equal(texto(await desafiar(C, 3, 1)), "❌ Estás fuera de las batallas de aura de este grupo. Con .siaura volvés.");
  assert.equal(await pedir(3, "siaura"), "✨ Listo: volvés a las batallas de aura de este grupo.");
  assert.match(texto(await desafiar(C, 1, 3)), /desafía a/);

  // Out with a challenge waiting for their answer: it goes, and nothing expires later.
  const sale = await pedir(3, "noaura");
  assert.match(sale, /\nEl desafío que estaba pendiente queda sin efecto\.$/);
  assert.equal(A.dueloDeAuraEn(C), null);
  const antes = globalThis.enviados.length;
  await esperar(300);
  assert.equal(globalThis.enviados.length, antes, "sin aviso de vencimiento");
  // Out while their duel is being voted: it ends as it is.
  await desafiar(C, 4, 5);
  await contestar(C, 5, "si");
  assert.match(await pedir(5, "noaura"), /\nLa batalla que ya se está votando termina igual\.$/);
  assert.ok(A.votaciones[C], "la votación sigue");

  // Getting out is always possible: no game (.juegos off doesn't stop it) and no section (.bladd can't take it).
  assert.equal(Aura.juego, true);
  assert.ok(!NoAura.juego && NoAura.fueraDelModoAdmin && NoAura.onlyGroup);
  assert.ok(secciones.juegos.includes("aura"));
  assert.doesNotMatch(fs.readFileSync(new URL("../lib/secciones.js", import.meta.url), "utf8"), /noaura|siaura/);
});

test(".aura muestra el ranking del mes por nombre, sin arrobar, con la corona, el desempate y cómo te va", async (t) => {
  limpio(t);
  const C = nuevoChat();
  const ahora = Date.now();
  const mes = mesDe(ahora);
  const anterior = mesDe(new Date(new Date(ahora).getFullYear(), new Date(ahora).getMonth() - 1, 15).getTime());
  // 2 wins twice, 3 once early and 4 once later (tied with 3: 3 got there first), 5 once last month.
  F.anotarDueloDeAura(mes, C, lid(2), lid(9), 1000, ahora - 5000);
  F.anotarDueloDeAura(mes, C, lid(3), lid(2), 1000, ahora - 4000);
  F.anotarDueloDeAura(mes, C, lid(2), lid(9), 1000, ahora - 3000);
  F.anotarDueloDeAura(mes, C, lid(4), lid(9), 1000, ahora - 2000);
  F.anotarDueloDeAura(anterior, C, lid(5), lid(9), 1000, ahora - 40 * 24 * 3600e3);
  const ranking = (n, opciones) => correr(Aura, C, n, opciones);
  const [deDos] = await ranking(2);
  const lista = `👑 ${nombre(2)} — *2.000* (el aura del mes)\n2. ${nombre(3)} — *1.000*\n3. ${nombre(4)} — *1.000*`;
  assert.equal(deDos.text, `✨ *Ranking de aura — ${MESES[Number(mes.slice(5)) - 1]}*\n\n${lista}\n\nVos: *2.000* este mes (puesto 1) · *2.000* en total · 2 batallas ganadas y 1 perdida.`);
  assert.ok(!deDos.mentions?.length && !/@\d/.test(deDos.text), "por nombre, sin arrobar a nadie");
  assert.match(texto(await ranking(4)), /\n\nVos: \*1\.000\* este mes \(puesto 3\) · \*1\.000\* en total · 1 batalla ganada y 0 perdidas\.$/);
  assert.match(texto(await ranking(5)), /\n\nVos: nada este mes · \*1\.000\* en total · 1 batalla ganada y 0 perdidas\.$/);
  assert.match(texto(await ranking(6)), /\n\nVos: todavía no ganaste ni perdiste ninguna batalla de aura\.$/);
  assert.match(texto(await ranking(6, { quoted: { sender: BOT } })), /^✨ \*Ranking de aura/, "respondiendo a Claudia, también el ranking");
  // With "nombres" or "numeros" (lib/menciones.js): by WhatsApp name with the nickname in brackets, or by number.
  F.updateUser(lid(2), { apodo: "Dos" });
  assert.match(texto(await ranking(6)), /\n👑 Dos — \*2\.000\*/);
  assert.match(texto(await ranking(6, { texto: "nombres" })), /\n👑 Persona 2 \(Dos\) — \*2\.000\* \(el aura del mes\)\n2\. Persona 3 — \*1\.000\*/);
  const [porNumero] = await ranking(6, { texto: "numeros" });
  assert.match(porNumero.text, /\n👑 \+59899000002 \(Dos\) — \*2\.000\* \(el aura del mes\)\n2\. \+59899000003 \(Persona 3\) — \*1\.000\*/);
  assert.ok(!porNumero.mentions?.length, "sin arrobar");
  F.updateUser(lid(2), { apodo: "" });
  // Ten at most.
  for (let n = 10; n <= 20; n++) F.anotarDueloDeAura(mes, C, lid(n), lid(9), 3000, ahora - 1000 + n);
  const largo = texto(await ranking(6));
  assert.equal(largo.split("\n").filter((l) => /^(👑|\d+\.) /.test(l)).length, 10);
  // An empty month invites to play.
  assert.match(texto(await correr(Aura, nuevoChat(), 6)), /\n\nEste mes nadie sumó aura todavía: desafiá a alguien con \.aura @persona, el grupo vota y el que gana suma 1\.000\.\n\n/);
});

test("el menú lo ofrece entre los juegos, con el premio que da lib/aura.js", () => {
  const juegos = seccionesDelMenu(".").find((s) => s.clave === "juegos");
  assert.match(juegos.lineas, /\n▸ \.aura @mención ✨ – `Batalla de aura: si acepta \(\.aura si\), el grupo vota con 🔵 o 🔴 y el que gana suma 1\.000 de aura del mes\. \.aura sola muestra el ranking \(con nombres o numeros al final, por nombre de WhatsApp o por número\); \.noaura te saca de las batallas y \.siaura te vuelve a poner\.`\n/);
});
