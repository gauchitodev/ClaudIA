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

// A setup can take minutes when every AI model times out. If its hold lapses in the meantime and another trivia opens,
// the slow one, once ready, used to overwrite the round in play: it died without a word, and its answers went nowhere.
// Collects what abrirRonda logs when it refuses, so the output stays clean.
function callandoErrores() {
  const errores = [];
  const errorReal = console.error;
  console.error = (...a) => errores.push(a.join(" "));
  return { errores, restaurar: () => (console.error = errorReal) };
}

test("trivia: una preparación que perdió su reserva no pisa la ronda que se abrió mientras, ni la suelta", async () => {
  const client = clienteFalso();
  const C = "reserva@g.us";
  const original = Tr.TRIVIA.RESERVA_MS;
  Tr.TRIVIA.RESERVA_MS = 30;
  const lenta = Tr.reservarRonda(C, "relampago");
  Tr.TRIVIA.RESERVA_MS = original;
  await esperar(60);
  assert.equal(Tr.rondaDe(C), null, "la reserva venció");

  // Another trivia takes the chat: first its hold, which the lapsed one can't release...
  const otra = Tr.reservarRonda(C, "trivia");
  assert.equal(Tr.liberarRonda(C, lenta), false, "la reserva vencida no suelta la de otro");
  assert.equal(Tr.rondaDe(C), otra);
  // ...then its round.
  const enJuego = Tr.abrirRonda(C, { reserva: otra, tipo: "trivia", pregunta: PREGUNTA, mensajeId: "EN-JUEGO", segundos: 5, client });

  // The slow one is finally ready.
  const { errores, restaurar } = callandoErrores();
  try {
    assert.equal(Tr.abrirRonda(C, { reserva: lenta, tipo: "relampago", pregunta: PREGUNTA, mensajeId: "TARDE", segundos: 5, client }), null, "no abre encima");
  } finally {
    restaurar();
  }
  assert.match(errores.join("\n"), /no abro la ronda \(relampago\)/, "queda en el log");
  assert.equal(Tr.rondaDe(C), enJuego, "la ronda en juego sigue");
  assert.equal(Tr.liberarRonda(C, lenta), false);
  assert.equal(Tr.responderTrivia({ chat: C, sender: "a@lid", text: "c", quoted: { id: "EN-JUEGO" } }).reaccion, "✅", "y se puede ganar");

  // With the chat free, a hold that lapsed still opens its round: its question is already out, and nobody else took the turn.
  Tr.TRIVIA.RESERVA_MS = 30;
  const sola = Tr.reservarRonda(C, "relampago");
  Tr.TRIVIA.RESERVA_MS = original;
  await esperar(60);
  assert.ok(Tr.abrirRonda(C, { reserva: sola, tipo: "relampago", pregunta: PREGUNTA, mensajeId: "SOLA", segundos: 5, client }));
  assert.equal(Tr.rondaDe(C).mensajeId, "SOLA");
  Tr.cerrarRonda(C);
});

// The same, through the two ways a trivia opens. The one that came later still holds only its reservation: that's the
// case where a launcher that doesn't hand over its own would take someone else's.
for (const [nombre, envia, lanzar] of [
  [".trivia", "sendText", (client, chat) => plugin.run({ chat, sender: "y@lid", isGroup: true }, { client })],
  ["la relámpago", "sendMessage", async (client, chat) => (await import("../lib/trivia-relampago.js")).lanzarTriviaRelampago(client, chat)],
]) {
  test(`trivia: si ${nombre} pierde su reserva mientras se arma, no se queda con la del que llegó después`, async () => {
    const C = `tarde-${envia}@g.us`;
    const client = clienteFalso();
    const enviar = client[envia];
    let otra;
    // While the question waits its turn, the hold lapses and another trivia reserves the chat.
    client[envia] = async (chat, ...resto) => {
      if (!otra) {
        Tr.cerrarRonda(chat);
        otra = Tr.reservarRonda(chat, "trivia");
      }
      return enviar(chat, ...resto);
    };

    const { errores, restaurar } = callandoErrores();
    try {
      await lanzar(client, C);
    } finally {
      restaurar();
    }
    try {
      assert.equal(Tr.rondaDe(C), otra, "la reserva sigue siendo del que llegó después");
      assert.match(errores.join("\n"), /no abro la ronda/, "queda en el log");
      assert.match(U.apostar(C, "z@lid", U.COINS.APUESTA_MIN).error, /No hay ningún juego activo/, "y no quedó un juego tomando apuestas que nunca se cierran");
    } finally {
      // Always: if the hold got overwritten, its 5-minute timer would keep the test process open.
      clearTimeout(otra?.timeout);
      Tr.cerrarRonda(C);
    }
  });
}
