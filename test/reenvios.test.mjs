import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import Database from "better-sqlite3";
import { prepararBase, nodosQue, G } from "./helpers.mjs";

// The resends the bot couldn't make (lib/reenvios.js): what Baileys asks the bot for when someone wants one of its
// messages again and Baileys no longer has it. The bot keeps none, and counts them by day, for .estado.

const [ANA, BETO] = ["200000000000001:5@lid", "200000000000002@lid"];
// A retry's key as Baileys hands it to getMessage (messages-recv.js): the chat, the message, that it's the bot's own,
// and who's asking.
const pedido = (id, participant = ANA, chat = G) => ({ remoteJid: chat, id, fromMe: true, participant });
const dos = (n) => String(n).padStart(2, "0");
const diaDe = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

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
  assert.deepEqual(R.reenviosPerdidos(), { hoy: 0, semana: 0, desde: diaDe(new Date()) });
  assert.equal(R.mensajeParaReenviar(pedido("3EB0A1")), undefined, "el bot no guarda lo que manda");
  assert.equal(R.reenviosPerdidos().hoy, 1);
  // The phone that doesn't get it asks again, a few times.
  for (let vez = 0; vez < 4; vez++) R.mensajeParaReenviar(pedido("3EB0A1"));
  assert.equal(R.reenviosPerdidos().hoy, 1, "el mismo mensaje para el mismo teléfono es uno");
  R.mensajeParaReenviar(pedido("3EB0A1", BETO));
  assert.equal(R.reenviosPerdidos().hoy, 2, "a otro que tampoco lo pudo leer le falta también");
  R.mensajeParaReenviar(pedido("3EB0A2"));
  assert.equal(R.reenviosPerdidos().hoy, 3, "y otro mensaje es otro");
  // In a private chat, whoever asks is the chat: with or without the one asking, it's the same request.
  R.mensajeParaReenviar({ remoteJid: BETO, id: "3EB0A3", fromMe: true });
  assert.equal(R.reenviosPerdidos().hoy, 4);
  R.mensajeParaReenviar({ remoteJid: BETO, id: "3EB0A3", fromMe: true, participant: BETO });
  R.mensajeParaReenviar({ remoteJid: BETO, id: "3EB0A3", fromMe: true });
  assert.deepEqual(R.reenviosPerdidos(), { hoy: 4, semana: 4, desde: diaDe(new Date()) });
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

test("suma los de hoy y los de los últimos 7 días, y dice desde cuándo cuenta mientras la semana no está entera", () => {
  const dia = (n, hora = 15) => new Date(2026, 10, n, hora, 0);
  const poner = (filas) => {
    F.db.exec(`DELETE FROM reenvios_perdidos`);
    for (const [n, mensajes] of filas) F.db.prepare(`INSERT INTO reenvios_perdidos (fecha, mensajes) VALUES (?, ?)`).run(diaDe(dia(n)), mensajes);
  };
  // Counted since the 17th, when the table was made: nothing that day, 4 the next and 2 the one after.
  poner([[17, 0], [18, 4], [19, 2]]);
  assert.deepEqual(R.reenviosPerdidos(dia(19)), { hoy: 2, semana: 6, desde: "2026-11-17" });
  assert.deepEqual(R.reenviosPerdidos(dia(19, 0)), { hoy: 2, semana: 6, desde: "2026-11-17" }, "apenas pasada la medianoche también");
  assert.deepEqual(R.reenviosPerdidos(dia(20)), { hoy: 0, semana: 6, desde: "2026-11-17" }, "un día sin ninguno");
  // The 17th is still one of the seven on the 23rd, and it wasn't a whole day.
  assert.deepEqual(R.reenviosPerdidos(dia(23)), { hoy: 0, semana: 6, desde: "2026-11-17" });
  assert.deepEqual(R.reenviosPerdidos(dia(24)), { hoy: 0, semana: 6, desde: null }, "con la semana entera ya no hace falta decirlo");
  assert.deepEqual(R.reenviosPerdidos(dia(25)), { hoy: 0, semana: 2, desde: null }, "y lo de hace más de 7 días no suma");
  assert.deepEqual(R.reenviosPerdidos(dia(26, 23)), { hoy: 0, semana: 0, desde: null });
});

test("la tabla nace con el día en que se crea, en 0, y ponerla al día de nuevo no lo cambia", () => {
  const base = new Database(":memory:");
  const filas = () => base.prepare(`SELECT fecha, mensajes FROM reenvios_perdidos ORDER BY fecha`).all();
  try {
    ponerAlDia(base);
    assert.deepEqual(filas(), [{ fecha: diaDe(new Date()), mensajes: 0 }], "desde hoy se cuenta");
    // Another start, days later, with some counted meanwhile.
    base.exec(`UPDATE reenvios_perdidos SET fecha = '2026-01-05'; INSERT INTO reenvios_perdidos (fecha, mensajes) VALUES ('2026-01-07', 3)`);
    ponerAlDia(base);
    assert.deepEqual(filas(), [{ fecha: "2026-01-05", mensajes: 0 }, { fecha: "2026-01-07", mensajes: 3 }], "el día en que empezó no se pisa ni se agrega otro");
  } finally {
    base.close();
  }
});

// main.js can't run here (it connects to WhatsApp): read as code (nodosQue).
test("main.js le da a Baileys, como getMessage, el que cuenta los reenvíos", async () => {
  const main = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
  const dados = await nodosQue('FunctionDeclaration[id.name="startBot"] VariableDeclarator[id.name="connectionOptions"] > ObjectExpression > Property[key.name="getMessage"]', main);
  assert.equal(dados.length, 1);
  assert.equal(dados[0].value.name, "mensajeParaReenviar", "con otra función, .estado se queda en 0 pase lo que pase");
  assert.equal((await nodosQue('ImportDeclaration[source.value="./lib/reenvios.js"] > ImportSpecifier[imported.name="mensajeParaReenviar"]', main)).length, 1);
});
