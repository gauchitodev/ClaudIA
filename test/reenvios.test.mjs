import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import Database from "better-sqlite3";
import { prepararBase, nodosQue, G } from "./helpers.mjs";

// The resends the bot couldn't make (lib/reenvios.js): what Baileys asks the bot for when someone wants one of its
// messages again and Baileys no longer has it. The bot keeps none, and counts them by day, by why it was missing and
// by what asked for it, for .estado.

// Who asks: Ana's WhatsApp Web (a linked device: its id has a device in it) and Beto's phone (it has none).
const [ANA, BETO] = ["200000000000001:5@lid", "200000000000002@lid"];
const DIA = 24 * 60 * 60 * 1000;
// A retry's key as Baileys hands it to getMessage (messages-recv.js): the chat, the message, that it's the bot's own,
// and who's asking.
const pedido = (id, participant = ANA, chat = G) => ({ remoteJid: chat, id, fromMe: true, participant });
const dos = (n) => String(n).padStart(2, "0");
const diaDe = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
// What .estado gets but for what asked for them (quienes, below), with what isn't said taken as nothing: counted since
// today, and none of them. And what the bot has counted, the same way.
const cuenta = (lo) => ({ hoy: 0, semana: 0, desde: diaDe(new Date()), antesDeArrancar: 0, tarde: 0, reciente: 0, sinClasificar: 0, ...lo });
const contado = (ahora) => {
  const { hoy, semana, desde, antesDeArrancar, tarde, reciente, sinClasificar } = R.reenviosPerdidos(ahora);
  return { hoy, semana, desde, antesDeArrancar, tarde, reciente, sinClasificar };
};
// The seven days' by why, at a given moment.
const porQue = (ahora = new Date()) => {
  const { antesDeArrancar, tarde, reciente, sinClasificar } = R.reenviosPerdidos(ahora);
  return { antesDeArrancar, tarde, reciente, sinClasificar };
};
// And by what asked for them: how many each kind asked for, and the most of each that asked in one day. The bot
// remembers who asked today from one test to the next, as it does the requests, so each test that counts them has
// devices of its own.
const NADIE = { deTelefono: 0, telefonos: 0, deVinculado: 0, vinculados: 0, dePropio: 0, propios: 0, sinQuien: 0 };
const quienes = (ahora = new Date()) => {
  const { deTelefono, telefonos, deVinculado, vinculados, dePropio, propios, sinQuien } = R.reenviosPerdidos(ahora);
  return { deTelefono, telefonos, deVinculado, vinculados, dePropio, propios, sinQuien };
};
// The table's columns for what asked, with none.
const DE_NADIE = { de_telefono: 0, de_vinculado: 0, de_propio: 0, telefonos: 0, vinculados: 0, propios: 0 };

let F, R, ponerAlDia;
before(async () => {
  ({ F } = await prepararBase("reenvios"));
  R = await import("../lib/reenvios.js");
  ({ ponerAlDia } = await import("../database-schema.js"));
});
// Each test starts as the bot does on its first day with this: the table with today's row, at 0.
beforeEach(() => {
  F.db.exec(`DROP TABLE reenvios_perdidos`);
  ponerAlDia(F.db);
});

test("cuenta una vez cada mensaje del bot que alguien pide de nuevo, por cada uno que lo pide, y no le da nada a Baileys", () => {
  assert.deepEqual(R.reenviosPerdidos(), { ...cuenta(), ...NADIE }, "todo lo que recibe .estado, sin ninguno");
  assert.equal(R.mensajeParaReenviar(pedido("3EB0A1")), undefined, "el bot no guarda lo que manda");
  assert.equal(R.reenviosPerdidos().hoy, 1);
  // The device that doesn't get it asks again, a few times.
  for (let vez = 0; vez < 4; vez++) R.mensajeParaReenviar(pedido("3EB0A1"));
  assert.equal(R.reenviosPerdidos().hoy, 1, "el mismo mensaje para el mismo dispositivo es uno");
  R.mensajeParaReenviar(pedido("3EB0A1", BETO));
  assert.equal(R.reenviosPerdidos().hoy, 2, "a otro que tampoco lo pudo leer le falta también");
  R.mensajeParaReenviar(pedido("3EB0A2"));
  assert.equal(R.reenviosPerdidos().hoy, 3, "y otro mensaje es otro");
  // In a private chat, whoever asks is the chat: with or without the one asking, it's the same request.
  R.mensajeParaReenviar({ remoteJid: BETO, id: "3EB0A3", fromMe: true });
  assert.equal(R.reenviosPerdidos().hoy, 4);
  R.mensajeParaReenviar({ remoteJid: BETO, id: "3EB0A3", fromMe: true, participant: BETO });
  R.mensajeParaReenviar({ remoteJid: BETO, id: "3EB0A3", fromMe: true });
  assert.deepEqual(contado(), cuenta({ hoy: 4, semana: 4, antesDeArrancar: 4 }), "ninguno se mandó desde que arrancó");
});

// Each why says what would have had the message: a store that outlives main.js, one with a longer window than
// Baileys's five minutes, or one of minutes looked up by the id alone (causaDe in lib/reenvios.js).
test("dice por qué faltaba: de antes de arrancar si no lo mandó desde que arrancó, y si no, de más de 5 min o reciente", (t) => {
  const ahoraReal = R._dep.ahora;
  t.after(() => (R._dep.ahora = ahoraReal));
  // Two hours back, so that a time taken off the real clock instead shows.
  const T = Date.now() - 2 * 60 * 60 * 1000;
  let ahora = T;
  R._dep.ahora = () => ahora;
  R.anotarEnviado("3EB0D1");
  assert.equal(R.REENVIOS.EN_BAILEYS_MS, 5 * 60 * 1000, "lo que Baileys guarda lo que manda (message-retry-manager.js)");

  ahora = T + R.REENVIOS.EN_BAILEYS_MS;
  R.mensajeParaReenviar(pedido("3EB0D1"));
  assert.deepEqual(porQue(new Date(ahora)), { antesDeArrancar: 0, tarde: 0, reciente: 1, sinClasificar: 0 }, "a los 5 minutos justos Baileys todavía lo tenía");
  ahora += 1;
  R.mensajeParaReenviar(pedido("3EB0D1", BETO));
  assert.deepEqual(porQue(new Date(ahora)), { antesDeArrancar: 0, tarde: 1, reciente: 1, sinClasificar: 0 }, "un momento después ya no");
  R.mensajeParaReenviar(pedido("3EB0D9"));
  assert.deepEqual(porQue(new Date(ahora)), { antesDeArrancar: 1, tarde: 1, reciente: 1, sinClasificar: 0 }, "uno que no mandó desde que arrancó");
  assert.equal(R.reenviosPerdidos(new Date(ahora)).semana, 3, "y entre las tres suman todos");
});

// Each day but the first, the first one of the day makes its row.
test("el primero de un día sin fila la crea, con su porqué y con lo que lo pidió", (t) => {
  const ahoraReal = R._dep.ahora;
  t.after(() => (R._dep.ahora = ahoraReal));
  const otroDia = new Date(2027, 0, 15, 12);
  R._dep.ahora = () => otroDia.getTime();
  R.anotarEnviado("3EB0I1");
  R.mensajeParaReenviar(pedido("3EB0I1"));
  R.mensajeParaReenviar(pedido("3EB0I2"));
  const fila = { fecha: "2027-01-15", mensajes: 2, antes_de_arrancar: 1, tarde: 0, reciente: 1, ...DE_NADIE, de_vinculado: 2, vinculados: 1 };
  assert.deepEqual(F.db.prepare(`SELECT * FROM reenvios_perdidos WHERE fecha = '2027-01-15'`).get(), fila, "los dos, del WhatsApp Web de Ana");
});

// What asks says what Baileys would do with the message if the bot had it to hand over: to a linked device it would
// send it alone, and to a phone, the whole chat again (quienPide in lib/reenvios.js). A device of the bot's own number
// is no one missing a message.
test("dice qué lo pide: el teléfono de alguien, un dispositivo vinculado o uno del propio número del bot, y cuántos distintos de cada uno", async (t) => {
  const { conexion } = await import("../lib/conexion.js");
  const delBot = conexion.client.user;
  t.after(() => (conexion.client.user = delBot));
  // As the socket leaves them (lib/wa-socket.js): the bot's LID and its number, with no device.
  conexion.client.user = { ...delBot, lid: "200000000000010@lid", jid: "59899000010@s.whatsapp.net" };
  const CARLA = "200000000000011";

  // Carla's phone couldn't read three messages.
  for (const id of ["3EB0J1", "3EB0J2", "3EB0J3"]) R.mensajeParaReenviar(pedido(id, `${CARLA}@lid`));
  assert.deepEqual(quienes(), { ...NADIE, deTelefono: 3, telefonos: 1 }, "tres pedidos, de un teléfono");
  // Nor could her WhatsApp Web two of them, nor her tablet one: each of her devices is one more.
  for (const id of ["3EB0J1", "3EB0J2"]) R.mensajeParaReenviar(pedido(id, `${CARLA}:3@lid`));
  R.mensajeParaReenviar(pedido("3EB0J1", `${CARLA}:14@lid`));
  assert.deepEqual(quienes(), { ...NADIE, deTelefono: 3, telefonos: 1, deVinculado: 3, vinculados: 2 });
  // Someone who comes by their number, in a private chat, where whoever asks is the chat. And a device 0 is the phone:
  // Baileys writes none in a phone's id, and tells a phone by there being none.
  R.mensajeParaReenviar({ remoteJid: "59899000012@s.whatsapp.net", id: "3EB0J4", fromMe: true });
  R.mensajeParaReenviar(pedido("3EB0J4", "59899000013:0@s.whatsapp.net", "59899000013@s.whatsapp.net"));
  assert.deepEqual(quienes(), { ...NADIE, deTelefono: 5, telefonos: 3, deVinculado: 3, vinculados: 2 });

  // The bot's own number: its phone, which comes by the LID, and another device linked to it, by the number.
  R.mensajeParaReenviar(pedido("3EB0J1", "200000000000010@lid"));
  R.mensajeParaReenviar(pedido("3EB0J1", "59899000010:7@s.whatsapp.net"));
  R.mensajeParaReenviar(pedido("3EB0J2", "59899000010:7@s.whatsapp.net"));
  assert.deepEqual(quienes(), { ...NADIE, deTelefono: 5, telefonos: 3, deVinculado: 3, vinculados: 2, dePropio: 3, propios: 2 });
  // Somebody else's LID with the digits of the bot's number, and a number with the digits of its LID, aren't the bot.
  R.mensajeParaReenviar(pedido("3EB0J1", "59899000010@lid"));
  R.mensajeParaReenviar(pedido("3EB0J1", "200000000000010:2@s.whatsapp.net"));
  assert.deepEqual(quienes(), { ...NADIE, deTelefono: 6, telefonos: 4, deVinculado: 4, vinculados: 3, dePropio: 3, propios: 2 });
  assert.equal(R.reenviosPerdidos().semana, 13, "y entre los tres suman todos");

  // When the connection opens, Baileys hands the bot its LID as WhatsApp sends it (socket.js), which may come with the
  // bot's own device in it: its phone is still its.
  conexion.client.user = { ...delBot, lid: "200000000000010:3@lid", jid: "59899000010@s.whatsapp.net" };
  R.mensajeParaReenviar(pedido("3EB0J2", "200000000000010@lid"));
  assert.deepEqual(quienes(), { ...NADIE, deTelefono: 6, telefonos: 4, deVinculado: 4, vinculados: 3, dePropio: 4, propios: 2 });
  // Before the bot knows who it is (no socket yet), nobody is the bot.
  conexion.client.user = undefined;
  R.mensajeParaReenviar(pedido("3EB0J3", "200000000000010@lid"));
  assert.deepEqual(quienes(), { ...NADIE, deTelefono: 7, telefonos: 5, deVinculado: 4, vinculados: 3, dePropio: 4, propios: 2 });
});

// How many of them there are tells a few devices asking for a lot from many people missing a message. A day's count is
// that day's: over the week it's the day with the most, not the days added up, where one that asks every day would
// pass for seven.
test("cuenta los dispositivos por día, y de la semana dice el día en que más pidieron", (t) => {
  const ahoraReal = R._dep.ahora;
  t.after(() => (R._dep.ahora = ahoraReal));
  const dia = (n) => new Date(2026, 10, n, 12);
  let hoy = dia(10);
  R._dep.ahora = () => hoy.getTime();
  const [TEL1, TEL2, WEB1, WEB2] = ["200000000000031@lid", "200000000000032@lid", "200000000000031:4@lid", "200000000000033:9@lid"];
  // The bot's own, by the fake socket's LID (test/helpers.mjs): its phone, and another device linked to its number.
  const [SU_TELEFONO, SU_OTRO] = ["bot@lid", "bot:6@lid"];
  const delDia = (n) => F.db.prepare(`SELECT de_telefono, telefonos, de_vinculado, vinculados, de_propio, propios FROM reenvios_perdidos WHERE fecha = ?`).get(diaDe(dia(n)));

  // The 10th: two phones, one of them for two messages, a linked device, and the bot's phone.
  for (const [id, quien] of [["3EB0K1", TEL1], ["3EB0K2", TEL1], ["3EB0K1", TEL2], ["3EB0K1", WEB1], ["3EB0K1", SU_TELEFONO]]) R.mensajeParaReenviar(pedido(id, quien));
  const el10 = { de_telefono: 3, telefonos: 2, de_vinculado: 1, vinculados: 1, de_propio: 1, propios: 1 };
  assert.deepEqual(delDia(10), el10);
  // The 11th: one of those phones again, which is one that day too, two linked devices, and two of the bot's.
  hoy = dia(11);
  for (const [id, quien] of [["3EB0K3", TEL1], ["3EB0K3", WEB1], ["3EB0K3", WEB2], ["3EB0K4", WEB2], ["3EB0K3", SU_TELEFONO], ["3EB0K3", SU_OTRO]]) R.mensajeParaReenviar(pedido(id, quien));
  assert.deepEqual(delDia(11), { de_telefono: 1, telefonos: 1, de_vinculado: 3, vinculados: 2, de_propio: 2, propios: 2 });
  assert.deepEqual(delDia(10), el10, "y lo del día anterior queda como estaba");

  const losDos = { ...NADIE, deTelefono: 4, telefonos: 2, deVinculado: 4, vinculados: 2, dePropio: 3, propios: 2 };
  assert.deepEqual(quienes(dia(11)), losDos, "los pedidos se suman; de los dispositivos, el día con más");
  assert.deepEqual(quienes(dia(16)), losDos, "el 10 todavía es uno de los siete");
  assert.deepEqual(quienes(dia(17)), { ...NADIE, deTelefono: 1, telefonos: 1, deVinculado: 3, vinculados: 2, dePropio: 2, propios: 2 }, "y al otro día ya no");
  assert.deepEqual(quienes(dia(18)), NADIE);
});

test("recuerda quién ya pidió hoy hasta un tope: pasado el tope, el que pidió primero se olvida y cuenta de nuevo", (t) => {
  const tope = R.REENVIOS.DISPOSITIVOS;
  t.after(() => (R.REENVIOS.DISPOSITIVOS = tope));
  assert.ok(tope >= 2000, "en el bot, más de los que hay en los grupos");
  R.REENVIOS.DISPOSITIVOS = 2;
  const [UNO, DOS, TRES] = ["200000000000041@lid", "200000000000042@lid", "200000000000043@lid"];
  for (const quien of [UNO, DOS, TRES]) R.mensajeParaReenviar(pedido("3EB0L1", quien));
  assert.deepEqual(quienes(), { ...NADIE, deTelefono: 3, telefonos: 3 });
  R.mensajeParaReenviar(pedido("3EB0L2", TRES));
  R.mensajeParaReenviar(pedido("3EB0L2", DOS));
  assert.deepEqual(quienes(), { ...NADIE, deTelefono: 5, telefonos: 3 }, "los dos últimos siguen siendo los mismos");
  R.mensajeParaReenviar(pedido("3EB0L2", UNO));
  assert.deepEqual(quienes(), { ...NADIE, deTelefono: 6, telefonos: 4 }, "el primero ya se había olvidado");
  // The cap is each kind's: a linked device takes no phone's place.
  R.mensajeParaReenviar(pedido("3EB0L1", "200000000000044:2@lid"));
  R.mensajeParaReenviar(pedido("3EB0L3", UNO));
  assert.deepEqual(quienes(), { ...NADIE, deTelefono: 7, telefonos: 4, deVinculado: 1, vinculados: 1 });
});

test("lo que sale por lib/envios.js queda anotado con su id, y pedido enseguida es reciente", async () => {
  const E = await import("../lib/envios.js");
  let enviados = 0;
  const client = { sendMessage: async () => ({ key: { id: `3EB0F${++enviados}` } }) };
  E.envolverEnvios(client);
  await client.sendMessage("reenvios-envios@g.us", { text: "hola" });
  await client.sendMessage("reenvios-envios2@g.us", { react: { text: "🔥", key: { remoteJid: G, id: "X", fromMe: false } } });
  R.mensajeParaReenviar(pedido("3EB0F1", ANA, "reenvios-envios@g.us"));
  R.mensajeParaReenviar(pedido("3EB0F2", ANA, "reenvios-envios2@g.us"));
  assert.deepEqual(porQue(), { antesDeArrancar: 0, tarde: 0, reciente: 2, sinClasificar: 0 }, "un texto y una reacción, los dos del bot");
});

test("recuerda los mensajes que mandó hasta un tope: pasado el tope, los más viejos pasan por mandados antes de arrancar", (t) => {
  const tope = R.REENVIOS.ENVIADOS;
  t.after(() => (R.REENVIOS.ENVIADOS = tope));
  assert.ok(tope >= 10000, "en el bot, de sobra para una semana de envíos");
  R.REENVIOS.ENVIADOS = 2;
  for (const id of ["3EB0G1", "3EB0G2", "3EB0G3"]) R.anotarEnviado(id);
  for (const nada of [undefined, null, ""]) R.anotarEnviado(nada); // with no id there's nothing to note, nor to make room for
  for (const id of ["3EB0G1", "3EB0G2", "3EB0G3"]) R.mensajeParaReenviar(pedido(id));
  assert.deepEqual(porQue(), { antesDeArrancar: 1, tarde: 0, reciente: 2, sinClasificar: 0 });
});

// For a message that isn't the bot's, Baileys asks to read an answer to an event (process-message.js): nobody is
// waiting for a resend.
test("lo que Baileys pide de un mensaje ajeno no es un reenvío, y lo que no es una clave no rompe nada", () => {
  assert.equal(R.mensajeParaReenviar({ remoteJid: G, id: "EVENTO1", fromMe: false, participant: ANA }), undefined);
  for (const rara of [undefined, null, {}, { fromMe: false }, "3EB0"]) assert.equal(R.mensajeParaReenviar(rara), undefined);
  assert.equal(R.reenviosPerdidos().hoy, 0);
});

// Baileys asks in the middle of answering the retry: after it, it sets the session right for whoever asked, so that
// the next messages do arrive. An error here would cut that short.
test("si no puede anotarlo no tira: Baileys sigue con lo suyo, y lo anota cuando se lo vuelven a pedir", () => {
  const errores = [];
  const errorReal = console.error;
  console.error = (...partes) => errores.push(partes.join(" "));
  const SU_WEB = "200000000000021:2@lid";
  try {
    F.db.exec(`DROP TABLE reenvios_perdidos`);
    assert.equal(R.mensajeParaReenviar(pedido("3EB0B1", SU_WEB)), undefined);
  } finally {
    console.error = errorReal;
  }
  assert.equal(errores.length, 1);
  assert.match(errores[0], /^\[reenvios\] no pude anotar un reenvío que no se hizo: no such table/);
  ponerAlDia(F.db);
  R.mensajeParaReenviar(pedido("3EB0B1", SU_WEB));
  assert.equal(R.reenviosPerdidos().hoy, 1, "no quedó como contado sin estarlo");
  assert.deepEqual(quienes(), { ...NADIE, deVinculado: 1, vinculados: 1 }, "ni el dispositivo, como uno que ya había pedido hoy");
});

test("recuerda lo que ya contó hasta un tope: pasado el tope, lo más viejo se olvida", (t) => {
  const tope = R.REENVIOS.RECORDADOS;
  t.after(() => (R.REENVIOS.RECORDADOS = tope));
  assert.ok(tope >= 1000, "en el bot, de sobra para una hora de pedidos");
  R.REENVIOS.RECORDADOS = 2;
  for (const id of ["3EB0C1", "3EB0C2", "3EB0C3"]) R.mensajeParaReenviar(pedido(id));
  assert.equal(R.reenviosPerdidos().hoy, 3);
  R.mensajeParaReenviar(pedido("3EB0C3"));
  R.mensajeParaReenviar(pedido("3EB0C2"));
  assert.equal(R.reenviosPerdidos().hoy, 3, "los dos últimos siguen contados");
  R.mensajeParaReenviar(pedido("3EB0C1"));
  assert.equal(R.reenviosPerdidos().hoy, 4, "el primero ya se había olvidado");
});

test("suma los de hoy y los de los últimos 7 días, también por qué faltaban, y dice desde cuándo cuenta mientras la semana no está entera", () => {
  const dia = (n, hora = 15) => new Date(2026, 10, n, hora, 0);
  F.db.exec(`DELETE FROM reenvios_perdidos`);
  const poner = (n, mensajes, porQue = {}) => F.db.prepare(`INSERT INTO reenvios_perdidos (fecha, mensajes, antes_de_arrancar, tarde, reciente) VALUES (?, ?, ?, ?, ?)`).run(diaDe(dia(n)), mensajes, porQue.antes || 0, porQue.tarde || 0, porQue.reciente || 0);
  // Counted since the 17th, when the table was made: nothing that day, and 4 the next, from before it was told why.
  // Then 2 on the 19th and 3 on the 20th, with why.
  poner(17, 0);
  poner(18, 4);
  poner(19, 2, { tarde: 1, reciente: 1 });
  poner(20, 3, { antes: 3 });
  const desde17 = { desde: "2026-11-17" };
  assert.deepEqual(contado(dia(19)), cuenta({ hoy: 2, semana: 6, ...desde17, tarde: 1, reciente: 1, sinClasificar: 4 }));
  assert.deepEqual(contado(dia(19, 0)), cuenta({ hoy: 2, semana: 6, ...desde17, tarde: 1, reciente: 1, sinClasificar: 4 }), "apenas pasada la medianoche también");
  assert.deepEqual(contado(dia(20)), cuenta({ hoy: 3, semana: 9, ...desde17, antesDeArrancar: 3, tarde: 1, reciente: 1, sinClasificar: 4 }));
  assert.deepEqual(contado(dia(21)), cuenta({ hoy: 0, semana: 9, ...desde17, antesDeArrancar: 3, tarde: 1, reciente: 1, sinClasificar: 4 }), "un día sin ninguno");
  // The 17th is still one of the seven on the 23rd, and it wasn't a whole day.
  assert.deepEqual(contado(dia(23)), cuenta({ semana: 9, ...desde17, antesDeArrancar: 3, tarde: 1, reciente: 1, sinClasificar: 4 }));
  assert.deepEqual(contado(dia(24)), cuenta({ semana: 9, desde: null, antesDeArrancar: 3, tarde: 1, reciente: 1, sinClasificar: 4 }), "con la semana entera ya no hace falta decirlo");
  assert.deepEqual(contado(dia(25)), cuenta({ semana: 5, desde: null, antesDeArrancar: 3, tarde: 1, reciente: 1 }), "y lo de hace más de 7 días no suma, tampoco lo sin clasificar");
  assert.deepEqual(contado(dia(26, 23)), cuenta({ semana: 3, desde: null, antesDeArrancar: 3 }));
  assert.deepEqual(contado(dia(27)), cuenta({ desde: null }));
  // None of these rows says what asked: they're from before the bot told, and go apart for as long as they add up.
  assert.deepEqual(quienes(dia(20)), { ...NADIE, sinQuien: 9 });
  assert.deepEqual(quienes(dia(25)), { ...NADIE, sinQuien: 5 });
  assert.deepEqual(quienes(dia(27)), NADIE);
});

test("la tabla nace con el día en que se crea, en 0, y ponerla al día de nuevo no lo cambia", () => {
  const base = new Database(":memory:");
  const filas = () => base.prepare(`SELECT * FROM reenvios_perdidos ORDER BY fecha`).all();
  const sinNada = { antes_de_arrancar: 0, tarde: 0, reciente: 0, ...DE_NADIE };
  try {
    ponerAlDia(base);
    assert.deepEqual(filas(), [{ fecha: diaDe(new Date()), mensajes: 0, ...sinNada }], "desde hoy se cuenta");
    // Another start, days later, with some counted meanwhile.
    base.exec(`UPDATE reenvios_perdidos SET fecha = '2026-01-05'; INSERT INTO reenvios_perdidos (fecha, mensajes, tarde) VALUES ('2026-01-07', 3, 3)`);
    ponerAlDia(base);
    assert.deepEqual(filas(), [{ fecha: "2026-01-05", mensajes: 0, ...sinNada }, { fecha: "2026-01-07", mensajes: 3, ...sinNada, tarde: 3 }], "el día en que empezó no se pisa ni se agrega otro");
  } finally {
    base.close();
  }
});

// The table was made on 2026-11-20 without the why: the tablet has it so, with what it counted until it's updated, today's
// row too if that version already wrote one.
test("una tabla de antes, sin el porqué, se pone al día: lo que ya había contado queda sin clasificar, y lo que sigue se clasifica", () => {
  const [anteayer, ayer, hoy] = [2, 1, 0].map((n) => diaDe(new Date(Date.now() - n * DIA)));
  F.db.exec(`DROP TABLE reenvios_perdidos; CREATE TABLE reenvios_perdidos (fecha TEXT PRIMARY KEY, mensajes INTEGER NOT NULL DEFAULT 0)`);
  F.db.prepare(`INSERT INTO reenvios_perdidos (fecha, mensajes) VALUES (?, 0), (?, 3), (?, 1)`).run(anteayer, ayer, hoy);
  const dicho = [];
  const logReal = console.log;
  console.log = (...partes) => dicho.push(partes.join(" "));
  try {
    ponerAlDia(F.db);
    const columnas = ["antes_de_arrancar", "tarde", "reciente", "de_telefono", "de_vinculado", "de_propio", "telefonos", "vinculados", "propios"];
    assert.deepEqual(dicho, columnas.map((c) => `🟢 Migración: columna '${c}' agregada a reenvios_perdidos`));
    dicho.length = 0;
    ponerAlDia(F.db);
    assert.deepEqual(dicho, [], "la segunda vez no hay nada que hacer");
  } finally {
    console.log = logReal;
  }
  R.mensajeParaReenviar(pedido("3EB0H1"));
  assert.deepEqual(contado(), cuenta({ hoy: 2, semana: 5, desde: anteayer, antesDeArrancar: 1, sinClasificar: 4 }), "el de hoy sigue sumando en la fila que ya tenía");
});

// And on 2026-11-23 the tablet has it with the why, and without what asked: two days and some counted so.
test("una tabla de antes, sin lo que los pide, se pone al día: lo que ya había contado queda aparte, y de lo que sigue se dice", () => {
  const [anteayer, ayer, hoy] = [2, 1, 0].map((n) => diaDe(new Date(Date.now() - n * DIA)));
  F.db.exec(`
    DROP TABLE reenvios_perdidos;
    CREATE TABLE reenvios_perdidos (
      fecha TEXT PRIMARY KEY,
      mensajes INTEGER NOT NULL DEFAULT 0,
      antes_de_arrancar INTEGER NOT NULL DEFAULT 0,
      tarde INTEGER NOT NULL DEFAULT 0,
      reciente INTEGER NOT NULL DEFAULT 0
    )
  `);
  F.db.prepare(`INSERT INTO reenvios_perdidos (fecha, mensajes, antes_de_arrancar, tarde) VALUES (?, 0, 0, 0), (?, 3, 1, 2), (?, 1, 0, 1)`).run(anteayer, ayer, hoy);
  const dicho = [];
  const logReal = console.log;
  console.log = (...partes) => dicho.push(partes.join(" "));
  try {
    ponerAlDia(F.db);
    assert.deepEqual(dicho, ["de_telefono", "de_vinculado", "de_propio", "telefonos", "vinculados", "propios"].map((c) => `🟢 Migración: columna '${c}' agregada a reenvios_perdidos`));
    dicho.length = 0;
    ponerAlDia(F.db);
    assert.deepEqual(dicho, [], "la segunda vez no hay nada que hacer");
  } finally {
    console.log = logReal;
  }
  assert.deepEqual(quienes(), { ...NADIE, sinQuien: 4 }, "de lo que ya había contado no se sabe quién lo pidió");
  R.mensajeParaReenviar(pedido("3EB0M1", "200000000000051@lid"));
  R.mensajeParaReenviar(pedido("3EB0M2", "200000000000051@lid"));
  assert.deepEqual(quienes(), { ...NADIE, deTelefono: 2, telefonos: 1, sinQuien: 4 }, "de los que siguen, sí");
  assert.deepEqual(contado(), cuenta({ hoy: 3, semana: 6, desde: anteayer, antesDeArrancar: 3, tarde: 3 }), "y el porqué que ya tenían no se pierde");
  assert.deepEqual(F.db.prepare(`SELECT * FROM reenvios_perdidos WHERE fecha = ?`).get(ayer), { fecha: ayer, mensajes: 3, antes_de_arrancar: 1, tarde: 2, reciente: 0, ...DE_NADIE });
});

// They go into the SQL as columns' names.
test("en la base, por qué faltaba es una de las tres columnas y nada más, y lo que lo pidió, uno de los tres", () => {
  const hoy = diaDe(new Date());
  for (const causa of ["tarde = 99, mensajes", "mensajes", undefined]) assert.throws(() => F.sumarReenvioPerdido(hoy, causa, "telefono", true), /no sé por qué faltaba ese reenvío/);
  for (const quien of ["telefonos = 99, mensajes", "de_telefono", "telefonos", "constructor", undefined]) assert.throws(() => F.sumarReenvioPerdido(hoy, "tarde", quien, true), /no sé quién pidió ese reenvío/);
  assert.deepEqual(R.reenviosPerdidos(), { ...cuenta(), ...NADIE }, "y no anotó nada");
  // One that had already asked today is one more request, and no other device.
  F.sumarReenvioPerdido(hoy, "tarde", "vinculado", true);
  F.sumarReenvioPerdido(hoy, "reciente", "vinculado", false);
  assert.deepEqual(quienes(), { ...NADIE, deVinculado: 2, vinculados: 1 });
});

// main.js can't run here (it connects to WhatsApp): read as code (nodosQue).
test("main.js le da a Baileys, como getMessage, el que cuenta los reenvíos", async () => {
  const main = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
  const dados = await nodosQue('FunctionDeclaration[id.name="startBot"] VariableDeclarator[id.name="connectionOptions"] > ObjectExpression > Property[key.name="getMessage"]', main);
  assert.equal(dados.length, 1);
  assert.equal(dados[0].value.name, "mensajeParaReenviar", "con otra función, .estado se queda en 0 pase lo que pase");
  assert.equal((await nodosQue('ImportDeclaration[source.value="./lib/reenvios.js"] > ImportSpecifier[imported.name="mensajeParaReenviar"]', main)).length, 1);
});
