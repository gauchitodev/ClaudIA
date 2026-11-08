import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, clienteFalso, ultimoEnviado, esperar, fijarSaldo } from "./helpers.mjs";
import { configuracion } from "../lib/configuracion.js";

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

// A lightning trivia checks, when its time comes, that the group still has it on and that it's within its hours: here
// it's switched on and launched at noon, so the test doesn't depend on the clock.
async function lanzarRelampago(client, chat) {
  F.initDataDB({ chat, sender: "y@lid", senderJid: "" });
  F.updateChat(chat, { triviaRelampago: 1 });
  const mediodia = new Date();
  mediodia.setHours(12, 0, 0, 0);
  return (await import("../lib/trivia-relampago.js")).lanzarTriviaRelampago(client, chat, mediodia);
}

test("trivia: el banco está limpio", () => {
  const preguntas = globalThis.BANCO.map((p) => p.pregunta);
  assert.equal(new Set(preguntas).size, preguntas.length, "sin repetidas");
  for (const p of globalThis.BANCO) {
    assert.equal(p.opciones.length, 4, p.pregunta);
    assert.match(p.correcta, /^[abcd]$/, p.pregunta);
    assert.ok(p.opciones.every((o) => !/^[A-D]\)/.test(o)), "las opciones van sin letra");
    // an answer by an option's text goes to the first one that reads like it (parsearRespuesta)
    assert.equal(new Set(p.opciones.map(Tr.normalizar)).size, 4, `opciones distintas: ${p.pregunta}`);
  }
  // the right one spread over the four letters, so the letter doesn't give it away
  for (const letra of ["a", "b", "c", "d"]) {
    const parte = globalThis.BANCO.filter((p) => p.correcta === letra).length / globalThis.BANCO.length;
    assert.ok(parte > 0.2 && parte < 0.3, `la ${letra} es la correcta en el ${Math.round(parte * 100)} %`);
  }
  // Every question brings its fact, told when a round closes (lib/trivia-banco.js), as the AI's do: one short sentence,
  // which doesn't repeat the question, and no two the same.
  const datos = globalThis.BANCO.filter((p) => "dato" in p);
  assert.deepEqual(globalThis.BANCO.filter((p) => !("dato" in p)).map((p) => p.pregunta), [], "todas con su dato");
  for (const p of datos) {
    assert.ok(typeof p.dato === "string" && p.dato === p.dato.trim() && p.dato.length <= Tr.TRIVIA.DATO_MAX, `dato de «${p.pregunta}»`);
    assert.match(p.dato, /^[A-ZÁÉÍÓÚÑ¿«+0-9][^\n]*\.$/, `una oración: «${p.dato}»`);
    assert.doesNotMatch(p.dato.slice(0, -1), /[.!?]\s+[A-ZÁÉÍÓÚÑ¿]/, `una sola oración: «${p.dato}»`);
    assert.ok(!p.dato.includes(p.pregunta.replace(/^¿|\?$/g, "")), `repite la pregunta: ${p.pregunta}`);
  }
  assert.equal(new Set(datos.map((p) => p.dato)).size, datos.length, "sin datos repetidos");
  // some high-school math and physics, answered from memory
  assert.ok(globalThis.BANCO.some((p) => p.pregunta === "¿Cuánto suman los ángulos interiores de un triángulo?"));
  assert.ok(globalThis.BANCO.some((p) => p.pregunta === "¿En qué unidad se mide la fuerza en el Sistema Internacional?"));
});

test("trivia: entiende la letra de muchas formas y el texto de la opción", () => {
  const ops = PREGUNTA.opciones;
  for (const t of ["c", "C", "c)", "C)", "(c)", "c.", "Opción C", "c) Tokio", "C) porque sí", "la c", "c tokio", "c, tokio", "la c, porque sí"]) assert.equal(Tr.parsearRespuesta(t, ops), "c", JSON.stringify(t));
  assert.equal(Tr.parsearRespuesta("tokio", ops), "c");
  assert.equal(Tr.parsearRespuesta("  Kioto ", ops), "b");
  for (const t of ["hola", "e", "no se", "", "la capital es tokio"]) assert.equal(Tr.parsearRespuesta(t, ops), null, JSON.stringify(t));
  // A letter followed by just any words is someone talking: with a round open, it spent their one attempt, and Claudia,
  // named, said nothing.
  for (const t of ["a ver claudia", "A ver claudia, ¿qué opinás?", "a qué hora es", "d nada", "...a ver"]) assert.equal(Tr.parsearRespuesta(t, ops), null, JSON.stringify(t));
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
  const antes = globalThis.enviados.length;
  await lanzarRelampago(client, G);
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

  // With the chat free, a hold that lapsed still opens its round:
  // its question is already out, and nobody else took the turn.
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
  ["la relámpago", "sendMessage", lanzarRelampago],
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
    } finally {
      // Always: if the hold got overwritten, its 5-minute timer would keep the test process open.
      clearTimeout(otra?.timeout);
      Tr.cerrarRonda(C);
    }
  });
}

// Each AI question is a request to the models Claudia chats with: twenty .trivia in a row ran out the per-minute quota
// and paused all of them, for the chat too. Now it's one a minute and TRIVIA.IA_POR_DIA a day per group; the rest come
// from the bank.
test("trivia: la IA hace como mucho una pregunta por minuto y un tope por día en cada grupo; las demás salen del banco", async () => {
  const Gem = await import("../lib/gemini.js");
  const C = "racion@g.us";
  const pedidos = [];
  const fetchReal = globalThis.fetch;
  const logReal = console.log;
  configuracion.geminiApiKey = "clave";
  console.log = () => {};
  globalThis.fetch = async (url) => {
    pedidos.push(String(url));
    const p = { pregunta: `¿Pregunta de la IA ${pedidos.length}?`, opciones: ["uno", "dos", "tres", "cuatro"], correcta: "A" };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(p) }] } }] }) };
  };
  const deLaIa = async (chat) => (await Tr.generarPregunta(chat)).pregunta.startsWith("¿Pregunta de la IA");
  try {
    assert.equal(await deLaIa(C), true);
    for (let i = 0; i < 5; i++) assert.equal(await deLaIa(C), false, "en el mismo minuto, del banco");
    assert.equal(pedidos.length, 1);
    assert.equal(await deLaIa("otro-grupo@g.us"), true, "otro grupo tiene lo suyo");

    F.anotarUsoIaTrivia(C, { ...F.usoIaTrivia(C), ultima: F.usoIaTrivia(C).ultima - Tr.TRIVIA.IA_CADA_MS }); // a minute went by
    assert.equal(await deLaIa(C), true);
    assert.equal(F.usoIaTrivia(C).usadas, 2);

    // The day's AI questions are used up: the bank until tomorrow.
    F.anotarUsoIaTrivia(C, { dia: new Date().toDateString(), usadas: Tr.TRIVIA.IA_POR_DIA, ultima: 0 });
    pedidos.length = 0;
    assert.equal(await deLaIa(C), false);
    assert.equal(pedidos.length, 0);
    F.anotarUsoIaTrivia(C, { ...F.usoIaTrivia(C), dia: "ayer" });
    assert.equal(await deLaIa(C), true);
    assert.equal(F.usoIaTrivia(C).usadas, 1, "al otro día arranca de nuevo");

    // With every Gemini model paused, not the backups either: straight to the bank, without a wait.
    F.olvidarUsoIaTrivia(C);
    for (const modelo of Gem.MODELOS) Gem.geminiEnPausa.set(modelo, { hasta: Date.now() + 60 * 1000, seguidos: 1 });
    pedidos.length = 0;
    assert.equal(await deLaIa(C), false);
    assert.equal(pedidos.length, 0);
    assert.equal(F.usoIaTrivia(C), null, "no gastó el turno de la IA");
  } finally {
    globalThis.fetch = fetchReal;
    console.log = logReal;
    configuracion.geminiApiKey = "";
    Gem.geminiEnPausa.clear();
  }
});

// The AI's answer, faked as Gemini gives it: the question it wrote, and every request's body kept in "cuerpos".
function iaFalsa(t, respuesta, cuerpos = []) {
  const fetchReal = globalThis.fetch;
  const logReal = console.log;
  configuracion.geminiApiKey = "clave";
  console.log = () => {};
  globalThis.fetch = async (url, opciones) => {
    cuerpos.push(String(opciones?.body || ""));
    return { ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(respuesta) }] } }] }) };
  };
  t.after(() => {
    globalThis.fetch = fetchReal;
    console.log = logReal;
    configuracion.geminiApiKey = "";
  });
  return cuerpos;
}

// The options came in the order the AI wrote them: if it tends to put the right one in the same place, the letter gives
// it away. Now they're shuffled, and the right letter goes where its text landed.
test("trivia: las opciones de la IA se mezclan, y la correcta sigue a su texto", async (t) => {
  iaFalsa(t, { pregunta: "¿Pregunta de la IA?", opciones: ["uno", "dos", "tres", "cuatro"], correcta: "A" });
  const azar = t.mock.method(Math, "random", () => 0);
  F.olvidarUsoIaTrivia("mezcla@g.us");
  const p = await Tr.generarPregunta("mezcla@g.us");
  assert.deepEqual([p.opciones, p.correcta], [["dos", "tres", "cuatro", "uno"], "d"]);
  azar.mock.mockImplementation(() => 0.99); // with these draws, Fisher–Yates leaves them as they came
  F.olvidarUsoIaTrivia("mezcla2@g.us");
  const q = await Tr.generarPregunta("mezcla2@g.us");
  assert.deepEqual([q.opciones, q.correcta], [["uno", "dos", "tres", "cuatro"], "a"]);
});

// Two options that read the same take an answer by its text to the first of them, right or not: such a question is
// left out, and the group gets one from the bank.
test("trivia: una pregunta de la IA con opciones repetidas o vacías no se usa", async (t) => {
  const respuesta = { pregunta: "¿Pregunta de la IA?", opciones: ["Tokio", "tokio", "Osaka", "Kioto"], correcta: "A" };
  iaFalsa(t, respuesta);
  for (const opciones of [["Tokio", "tokio", "Osaka", "Kioto"], ["Tokio", " ", "Osaka", "Kioto"], ["Tokio", "Osaka", "Kioto"]]) {
    respuesta.opciones = opciones;
    F.olvidarUsoIaTrivia("repetidas@g.us");
    const p = await Tr.generarPregunta("repetidas@g.us");
    assert.notEqual(p.pregunta, "¿Pregunta de la IA?", opciones.join(", "));
    assert.ok(globalThis.BANCO.includes(p), "del banco");
  }
});

// The answer alone says what but not why: the AI's question brings a short fact about it, told when the round closes,
// whether someone got it or not. One that goes on and on is left out, and the question stays.
test("trivia: la pregunta de la IA trae un dato, y la ronda lo dice al cerrar, se acierte o no", async (t) => {
  const respuesta = { pregunta: "¿Cuál es la capital de Japón?", opciones: ["Osaka", "Kioto", "Tokio", "Hiroshima"], correcta: "C", dato: "Tokio se llamó Edo hasta 1868." };
  const cuerpos = iaFalsa(t, respuesta);
  t.mock.method(Math, "random", () => 0.99); // with these draws the options stay as they came
  const pedir = async (chat) => (F.olvidarUsoIaTrivia(chat), Tr.generarPregunta(chat));
  const p = await pedir("dato-1@g.us");
  assert.equal(p.dato, "Tokio se llamó Edo hasta 1868.");
  assert.match(cuerpos.at(-1), /y \\"dato\\": una sola oración corta que sume algo cierto e interesante sobre la respuesta/);
  const client = clienteFalso();
  Tr.abrirRonda("dato-1@g.us", { tipo: "trivia", pregunta: p, mensajeId: "Q-DATO-1", segundos: 30, client });
  assert.equal(Tr.responderTrivia({ chat: "dato-1@g.us", sender: "1@lid", text: "c" }).texto, "✅ ¡Acertó @1! Era *C) Tokio*.\n💡 Tokio se llamó Edo hasta 1868.");
  // nobody gets it: the same fact when time runs out
  globalThis.enviados = [];
  Tr.abrirRonda("dato-2@g.us", { tipo: "trivia", pregunta: await pedir("dato-2@g.us"), mensajeId: "Q-DATO-2", segundos: 0.02, client });
  await esperar(80);
  assert.equal(ultimoEnviado()?.msg?.text, "⏳ Nadie acertó. Era *C) Tokio*.\n💡 Tokio se llamó Edo hasta 1868.");
  // one that goes on and on is left out, and the question stays, without it
  respuesta.dato = "x".repeat(Tr.TRIVIA.DATO_MAX + 1);
  const larga = await pedir("dato-3@g.us");
  assert.deepEqual([larga.pregunta, larga.dato], ["¿Cuál es la capital de Japón?", undefined]);
  // without a fact (an AI question whose fact was too long), the closing is as before
  Tr.abrirRonda("dato-4@g.us", { tipo: "trivia", pregunta: PREGUNTA, mensajeId: "Q-DATO-4", segundos: 30, client });
  assert.equal(Tr.responderTrivia({ chat: "dato-4@g.us", sender: "1@lid", text: "c" }).texto, "✅ ¡Acertó @1! Era *C) Tokio*.");
});

// Math and physics joined the AI's topics, and those ask for a question answered from memory in a .trivia's time: a
// long sum on a phone only frustrates, and one the AI gets wrong makes the "right" answer wrong.
test("trivia: matemática y física están entre los temas de la IA, y se piden para responder de cabeza", async (t) => {
  const cuerpos = iaFalsa(t, { pregunta: "¿Pregunta de la IA?", opciones: ["uno", "dos", "tres", "cuatro"], correcta: "A" });
  const azar = t.mock.method(Math, "random", () => 0);
  const pedir = async (tema) => {
    const i = Tr.TEMAS.indexOf(tema);
    assert.ok(i >= 0, tema);
    azar.mock.mockImplementation(() => (i + 0.5) / Tr.TEMAS.length);
    F.olvidarUsoIaTrivia("temas@g.us");
    await Tr.generarPregunta("temas@g.us");
    return cuerpos.at(-1);
  };
  for (const tema of ["matemática", "física"]) {
    const cuerpo = await pedir(tema);
    assert.match(cuerpo, new RegExp(`pregunta de trivia de ${tema}, `));
    assert.match(cuerpo, /responderse de cabeza en menos de 30 segundos, sin papel ni calculadora, con lo que se ve en secundaria/);
  }
  assert.doesNotMatch(await pedir("geografía"), /de cabeza/, "los demás temas, como siempre");
});

// The AI asked which river is the longest in the world: the Nile or the Amazon, depending on how it's measured, so
// whoever answered the other one lost. The question is asked for with the rule against that.
test("trivia: a la IA se le pide una pregunta sin discusión, que no dependa de cómo se mida", async () => {
  const C = "regla@g.us";
  const cuerpos = [];
  const fetchReal = globalThis.fetch;
  const logReal = console.log;
  configuracion.geminiApiKey = "clave";
  console.log = () => {};
  globalThis.fetch = async (url, opciones) => {
    cuerpos.push(String(opciones?.body || ""));
    const p = { pregunta: "¿Pregunta de la IA?", opciones: ["uno", "dos", "tres", "cuatro"], correcta: "A" };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(p) }] } }] }) };
  };
  try {
    F.olvidarUsoIaTrivia(C);
    assert.equal((await Tr.generarPregunta(C)).pregunta, "¿Pregunta de la IA?");
    assert.equal(cuerpos.length, 1);
    assert.match(cuerpos[0], /Escribí UNA pregunta de trivia de /);
    assert.match(cuerpos[0], /un hecho establecido y sin discusión: nada que dependa de cómo se mida o de qué fuente se mire/);
    assert.match(cuerpos[0], /el río más largo del mundo, que según el criterio es el Nilo o el Amazonas/);
  } finally {
    globalThis.fetch = fetchReal;
    console.log = logReal;
    configuracion.geminiApiKey = "";
  }
});

// An update restarts main.js: the questions a group was just asked and the AI's ration of the day are in the database,
// and a lib/trivia.js loaded again, as after a restart, still knows them. In memory, they started over.
test("trivia: lo que ya preguntó un grupo y la ración de la IA del día sobreviven a un reinicio", async (t) => {
  const C = "reinicio@g.us";
  const [primera, segunda, tercera] = globalThis.BANCO;
  for (const [i, pregunta] of [primera, segunda].entries()) {
    Tr.abrirRonda(C, { tipo: "trivia", pregunta, mensajeId: `REINICIO-${i}`, segundos: 30, client: clienteFalso() });
    Tr.cerrarRonda(C);
  }
  const pedidos = iaFalsa(t, { pregunta: "¿Pregunta de la IA antes del reinicio?", opciones: ["uno", "dos", "tres", "cuatro"], correcta: "A", dato: "" });
  F.olvidarUsoIaTrivia(C);
  assert.equal((await Tr.generarPregunta(C)).pregunta, "¿Pregunta de la IA antes del reinicio?");
  const DeNuevo = await import(`../lib/trivia.js?reinicio=${Date.now()}`);
  t.mock.method(Math, "random", () => 0); // the bank's first one that wasn't asked
  const p = await DeNuevo.generarPregunta(C);
  assert.equal(pedidos.length, 1, "en el mismo minuto la IA no: ya hizo una antes del reinicio");
  assert.equal(p.pregunta, tercera.pregunta, "las que acababan de salir no vuelven");
});

// The latest TRIVIA.RECIENTES of each group, oldest first: the table doesn't grow with every round.
test("trivia: la base guarda solo las últimas preguntas de cada grupo", () => {
  const tope = Tr.TRIVIA.RECIENTES;
  for (let i = 1; i <= tope + 5; i++) F.anotarPreguntaTrivia("tope@g.us", `¿Pregunta ${i}?`, tope);
  F.anotarPreguntaTrivia("otro-tope@g.us", "¿La del otro grupo?", tope);
  assert.deepEqual(F.preguntasTriviaHechas("tope@g.us"), Array.from({ length: tope }, (_, i) => `¿Pregunta ${i + 6}?`));
  assert.deepEqual(F.preguntasTriviaHechas("otro-tope@g.us"), ["¿La del otro grupo?"]);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM trivia_hechas WHERE chat = ?`).get("tope@g.us").n, tope);
});

// The bank's questions bring their fact too (lib/trivia-banco.js), told when the round closes, as the AI's.
test("trivia: una pregunta del banco con dato lo dice al cerrar", () => {
  const C = "dato-banco@g.us";
  const p = globalThis.BANCO.find((q) => q.dato);
  Tr.abrirRonda(C, { tipo: "trivia", pregunta: p, mensajeId: "DATO-BANCO-1", segundos: 30, client: clienteFalso() });
  const r = Tr.responderTrivia({ chat: C, sender: "555@lid", text: p.correcta, quoted: null });
  assert.ok(r.texto.endsWith(`\n💡 ${p.dato}`), r.texto);
});
