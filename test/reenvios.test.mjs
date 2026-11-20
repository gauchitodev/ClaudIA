import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import Database from "better-sqlite3";
import { prepararBase, nodosQue, G } from "./helpers.mjs";

// The resends the bot couldn't make (lib/reenvios.js): what Baileys asks the bot for when someone wants one of its
// messages again and Baileys no longer has it. The bot keeps none, and counts them by day and by why it was missing,
// for .estado.

const [ANA, BETO] = ["200000000000001:5@lid", "200000000000002@lid"];
const DIA = 24 * 60 * 60 * 1000;
// A retry's key as Baileys hands it to getMessage (messages-recv.js): the chat, the message, that it's the bot's own,
// and who's asking.
const pedido = (id, participant = ANA, chat = G) => ({ remoteJid: chat, id, fromMe: true, participant });
const dos = (n) => String(n).padStart(2, "0");
const diaDe = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
// What .estado gets, with what isn't said taken as nothing: counted since today, and none of them.
const cuenta = (lo) => ({ hoy: 0, semana: 0, desde: diaDe(new Date()), antesDeArrancar: 0, tarde: 0, reciente: 0, sinClasificar: 0, ...lo });
// The seven days' by why, at a given moment.
const porQue = (ahora = new Date()) => {
  const { antesDeArrancar, tarde, reciente, sinClasificar } = R.reenviosPerdidos(ahora);
  return { antesDeArrancar, tarde, reciente, sinClasificar };
};

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
  assert.deepEqual(R.reenviosPerdidos(), cuenta());
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
  assert.deepEqual(R.reenviosPerdidos(), cuenta({ hoy: 4, semana: 4, antesDeArrancar: 4 }), "ninguno se mandó desde que arrancó");
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
test("el primero de un día sin fila la crea, con su porqué", (t) => {
  const ahoraReal = R._dep.ahora;
  t.after(() => (R._dep.ahora = ahoraReal));
  const otroDia = new Date(2027, 0, 15, 12);
  R._dep.ahora = () => otroDia.getTime();
  R.anotarEnviado("3EB0I1");
  R.mensajeParaReenviar(pedido("3EB0I1"));
  R.mensajeParaReenviar(pedido("3EB0I2"));
  assert.deepEqual(F.db.prepare(`SELECT * FROM reenvios_perdidos WHERE fecha = '2027-01-15'`).get(), { fecha: "2027-01-15", mensajes: 2, antes_de_arrancar: 1, tarde: 0, reciente: 1 });
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
  try {
    F.db.exec(`DROP TABLE reenvios_perdidos`);
    assert.equal(R.mensajeParaReenviar(pedido("3EB0B1")), undefined);
  } finally {
    console.error = errorReal;
  }
  assert.equal(errores.length, 1);
  assert.match(errores[0], /^\[reenvios\] no pude anotar un reenvío que no se hizo: no such table/);
  ponerAlDia(F.db);
  R.mensajeParaReenviar(pedido("3EB0B1"));
  assert.equal(R.reenviosPerdidos().hoy, 1, "no quedó como contado sin estarlo");
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
  assert.deepEqual(R.reenviosPerdidos(dia(19)), cuenta({ hoy: 2, semana: 6, ...desde17, tarde: 1, reciente: 1, sinClasificar: 4 }));
  assert.deepEqual(R.reenviosPerdidos(dia(19, 0)), cuenta({ hoy: 2, semana: 6, ...desde17, tarde: 1, reciente: 1, sinClasificar: 4 }), "apenas pasada la medianoche también");
  assert.deepEqual(R.reenviosPerdidos(dia(20)), cuenta({ hoy: 3, semana: 9, ...desde17, antesDeArrancar: 3, tarde: 1, reciente: 1, sinClasificar: 4 }));
  assert.deepEqual(R.reenviosPerdidos(dia(21)), cuenta({ hoy: 0, semana: 9, ...desde17, antesDeArrancar: 3, tarde: 1, reciente: 1, sinClasificar: 4 }), "un día sin ninguno");
  // The 17th is still one of the seven on the 23rd, and it wasn't a whole day.
  assert.deepEqual(R.reenviosPerdidos(dia(23)), cuenta({ semana: 9, ...desde17, antesDeArrancar: 3, tarde: 1, reciente: 1, sinClasificar: 4 }));
  assert.deepEqual(R.reenviosPerdidos(dia(24)), cuenta({ semana: 9, desde: null, antesDeArrancar: 3, tarde: 1, reciente: 1, sinClasificar: 4 }), "con la semana entera ya no hace falta decirlo");
  assert.deepEqual(R.reenviosPerdidos(dia(25)), cuenta({ semana: 5, desde: null, antesDeArrancar: 3, tarde: 1, reciente: 1 }), "y lo de hace más de 7 días no suma, tampoco lo sin clasificar");
  assert.deepEqual(R.reenviosPerdidos(dia(26, 23)), cuenta({ semana: 3, desde: null, antesDeArrancar: 3 }));
  assert.deepEqual(R.reenviosPerdidos(dia(27)), cuenta({ desde: null }));
});

test("la tabla nace con el día en que se crea, en 0, y ponerla al día de nuevo no lo cambia", () => {
  const base = new Database(":memory:");
  const filas = () => base.prepare(`SELECT * FROM reenvios_perdidos ORDER BY fecha`).all();
  const sinNada = { antes_de_arrancar: 0, tarde: 0, reciente: 0 };
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
    assert.deepEqual(dicho, ["antes_de_arrancar", "tarde", "reciente"].map((c) => `🟢 Migración: columna '${c}' agregada a reenvios_perdidos`));
    dicho.length = 0;
    ponerAlDia(F.db);
    assert.deepEqual(dicho, [], "la segunda vez no hay nada que hacer");
  } finally {
    console.log = logReal;
  }
  R.mensajeParaReenviar(pedido("3EB0H1"));
  assert.deepEqual(R.reenviosPerdidos(), cuenta({ hoy: 2, semana: 5, desde: anteayer, antesDeArrancar: 1, sinClasificar: 4 }), "el de hoy sigue sumando en la fila que ya tenía");
});

// It goes into the SQL as a column's name.
test("en la base, por qué faltaba es una de las tres columnas y nada más", () => {
  for (const causa of ["tarde = 99, mensajes", "mensajes", undefined]) assert.throws(() => F.sumarReenvioPerdido(diaDe(new Date()), causa), /no sé por qué faltaba ese reenvío/);
  assert.deepEqual(R.reenviosPerdidos(), cuenta(), "y no anotó nada");
});

// main.js can't run here (it connects to WhatsApp): read as code (nodosQue).
test("main.js le da a Baileys, como getMessage, el que cuenta los reenvíos", async () => {
  const main = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
  const dados = await nodosQue('FunctionDeclaration[id.name="startBot"] VariableDeclarator[id.name="connectionOptions"] > ObjectExpression > Property[key.name="getMessage"]', main);
  assert.equal(dados.length, 1);
  assert.equal(dados[0].value.name, "mensajeParaReenviar", "con otra función, .estado se queda en 0 pase lo que pase");
  assert.equal((await nodosQue('ImportDeclaration[source.value="./lib/reenvios.js"] > ImportSpecifier[imported.name="mensajeParaReenviar"]', main)).length, 1);
});
