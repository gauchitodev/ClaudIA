import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, clienteFalso, ultimoEnviado, esperar, fijarSaldo } from "./helpers.mjs";

let F, Tr, U, plugin;
before(async () => {
  ({ F } = await prepararBase("trivia"));
  Tr = await import("../lib/trivia.js");
  U = await import("../lib/urucoins.js");
  plugin = (await import("../plugins/fun-trivia.js")).default;
  const { BANCO } = await import("../lib/trivia-banco.js");
  globalThis.BANCO = BANCO;
});

const PREGUNTA = { pregunta: "¿Cuál es la capital de Japón?", opciones: ["Osaka", "Kioto", "Tokio", "Hiroshima"], correcta: "c" };

test("trivia: el banco está limpio", () => {
  const preguntas = globalThis.BANCO.map((p) => p.pregunta);
  assert.equal(new Set(preguntas).size, preguntas.length, "sin repetidas");
  for (const p of globalThis.BANCO) {
    assert.equal(p.opciones.length, 4, p.pregunta);
    assert.match(p.correcta, /^[abcd]$/, p.pregunta);
    assert.ok(p.opciones.every((o) => !/^[A-D]\)/.test(o)), "las opciones van sin letra");
  }
});

test("trivia: entiende la letra de muchas formas y el texto de la opción", () => {
  const ops = PREGUNTA.opciones;
  for (const t of ["c", "C", "c)", "C)", "(c)", "c.", "Opción C", "c) Tokio", "C) porque sí"]) assert.equal(Tr.parsearRespuesta(t, ops), "c", JSON.stringify(t));
  assert.equal(Tr.parsearRespuesta("tokio", ops), "c");
  assert.equal(Tr.parsearRespuesta("  Kioto ", ops), "b");
  for (const t of ["hola", "e", "no se", "", "la capital es tokio"]) assert.equal(Tr.parsearRespuesta(t, ops), null, JSON.stringify(t));
});

test("trivia: ronda con un intento por persona, respuesta suelta o citando, y cierre al acertar", async () => {
  const client = clienteFalso();
  const premios = [];
  Tr.abrirRonda(G, { tipo: "trivia", pregunta: PREGUNTA, mensajeId: "MSG-TRIVIA", segundos: 5, client, alGanar: (lid) => { premios.push(lid); return "🪙 +10 UruCoins."; } });
  assert.equal(Tr.rondaDe(G).tipo, "trivia");
  assert.ok(Tr.segundosRestantes(Tr.rondaDe(G)) <= 5);

  assert.equal(Tr.responderTrivia({ chat: G, sender: "a@lid", text: "hola" }), null, "charla normal no cuenta");
  assert.equal(Tr.responderTrivia({ chat: G, sender: "a@lid", text: "c", quoted: { id: "OTRO" } }), null, "citando otro mensaje no cuenta");
  assert.equal(Tr.responderTrivia({ chat: "otro@g.us", sender: "a@lid", text: "c" }), null, "otro chat");
  assert.equal(Tr.responderTrivia({ chat: G, sender: "a@lid", text: "A)" }).reaccion, "❌");
  assert.equal(Tr.responderTrivia({ chat: G, sender: "a@lid", text: "c" }).reaccion, "🙅", "segundo intento no vale");
  assert.equal(Tr.responderTrivia({ chat: G, sender: "b@lid", text: "kioto", quoted: { id: "MSG-TRIVIA" } }).reaccion, "❌");
  const win = Tr.responderTrivia({ chat: G, sender: "c@lid", text: "Tokio" });
  assert.equal(win.reaccion, "✅");
  assert.equal(win.texto, "✅ ¡Acertó @c! Era *C) Tokio*.\n🪙 +10 UruCoins.");
  assert.deepEqual(win.mentions, ["c@lid"]);
  assert.deepEqual(premios, ["c@lid"]);
  assert.equal(Tr.rondaDe(G), null, "la ronda se cierra al acertar");
  assert.equal(Tr.responderTrivia({ chat: G, sender: "d@lid", text: "c" }), null, "después de cerrada no hay respuestas");
});

test("trivia: al vencer dice la respuesta completa y pega el texto de las apuestas", async () => {
  const client = clienteFalso();
  Tr.abrirRonda(G, { tipo: "trivia", pregunta: PREGUNTA, mensajeId: "M2", segundos: 0.05, client, alVencer: () => "\n💸 Nadie apostó." });
  await esperar(120);
  assert.equal(Tr.rondaDe(G), null);
  assert.equal(ultimoEnviado().msg.text, "⏳ Nadie acertó. Era *C) Tokio*.\n💸 Nadie apostó.");
});

test("trivia: el comando abre la ronda con premio, avisa si ya hay una abierta y paga con juegoTerminado", async () => {
  globalThis.txt = (await import("../lib/strings.js")).default;
  const client = clienteFalso();
  F.initDataDB({ chat: G, sender: "x@lid", senderJid: "x@s.whatsapp.net", pushName: "X" });
  F.updateChat(G, { monedas: true, games: true });
  fijarSaldo(F, G, "x@lid", 0);
  const m = { chat: G, sender: "y@lid", isGroup: true };
  await plugin.run(m, { client });
  const pregunta = ultimoEnviado().msg.text;
  assert.match(pregunta, /^🎓 \*Trivia\* — 10 UruCoins para el primero que acierte\n\n.+\nA\) .+\nB\) .+\nC\) .+\nD\) .+\n\n_Respondé con la letra.*30 segundos y un solo intento por persona\._$/s);
  const ronda = Tr.rondaDe(G);
  assert.equal(ronda.tipo, "trivia");
  assert.equal(ronda.mensajeId, ultimoEnviado().key?.id ?? ronda.mensajeId);

  await plugin.run(m, { client });
  assert.match(ultimoEnviado().msg.text, /^Hay una trivia abierta, quedan \d+ segundos\./);

  const win = Tr.responderTrivia({ chat: G, sender: "x@lid", text: ronda.pregunta.correcta });
  assert.equal(win.reaccion, "✅");
  assert.match(win.texto, /🪙 \+10 UruCoins por ganar/);
  assert.equal(F.getSaldoCoins(G, "x@lid"), 10);
  assert.equal(Tr.rondaDe(G), null);

  // it doesn't repeat the group's latest questions
  const vistas = new Set();
  for (let i = 0; i < 10; i++) {
    await plugin.run(m, { client });
    const p = Tr.rondaDe(G).pregunta.pregunta;
    assert.ok(!vistas.has(p), `repitió: ${p}`);
    vistas.add(p);
    Tr.cerrarRonda(G);
    U.juegoTerminado(G, null);
  }
});

test("trivia: una sola por grupo, aunque dos se pidan al mismo tiempo o llegue una relámpago", async () => {
  const client = clienteFalso();
  const m = { chat: G, sender: "y@lid", isGroup: true };
  Tr.cerrarRonda(G);
  U.juegoTerminado(G, null);
  // two .trivia at once: the second finds the turn reserved while the first builds its question
  await Promise.all([plugin.run(m, { client }), plugin.run(m, { client })]);
  const textos = globalThis.enviados.map((e) => e.msg?.text || "");
  assert.equal(textos.filter((t) => t.startsWith("🎓 *Trivia*")).length, 1, "una sola pregunta");
  assert.equal(textos.filter((t) => t === "Ya se está armando una trivia, un segundo.").length, 1);
  assert.equal(Tr.rondaDe(G).tipo, "trivia");

  // the lightning one doesn't override an open trivia
  const R = await import("../lib/trivia-relampago.js");
  const antes = globalThis.enviados.length;
  await R.lanzarTriviaRelampago(client, G);
  assert.equal(globalThis.enviados.length, antes, "no manda nada");
  assert.equal(Tr.rondaDe(G).tipo, "trivia");

  // while a round is being set up no answers are taken, and if the setup fails the turn is released
  Tr.cerrarRonda(G);
  U.juegoTerminado(G, null);
  assert.ok(Tr.reservarRonda(G, "trivia"));
  assert.ok(!Tr.reservarRonda(G, "relampago"), "el turno está tomado");
  assert.equal(Tr.responderTrivia({ chat: G, sender: "a@lid", text: "a" }), null);
  assert.ok(Tr.liberarRonda(G));
  assert.equal(Tr.rondaDe(G), null);
  const roto = { ...client, sendText: async () => { throw new Error("se cayó WhatsApp"); } };
  await assert.rejects(() => plugin.run(m, { client: roto }), /se cayó WhatsApp/);
  assert.equal(Tr.rondaDe(G), null, "la reserva se soltó al fallar");
  await plugin.run(m, { client });
  assert.equal(Tr.rondaDe(G).tipo, "trivia");
  Tr.cerrarRonda(G);
  U.juegoTerminado(G, null);
});
