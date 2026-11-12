import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { configuracion } from "../lib/configuracion.js";

// What a request to Gemini gets by its size (lib/gemini.js): a chat reply has 15 s per model and 3.000 tokens to answer
// with, thinking included. A long text (largo: hours of chat, for .resumen) went out with the same, and came back cut
// off or not at all: now it has the 45 s an audio has, and more room.

let G;
const fetchReal = globalThis.fetch;
const errorReal = console.error;

before(async () => {
  configuracion.geminiApiKey = "clave";
  G = await import("../lib/gemini.js");
  console.error = () => {}; // each model that's cut off is logged
});
after(() => {
  globalThis.fetch = fetchReal;
  console.error = errorReal;
});

// A Gemini that never answers: each request hangs until it's cut off. Returns the requests made, as they come.
function colgado() {
  const pedidos = [];
  globalThis.fetch = (url, opciones) =>
    new Promise((resolve, reject) => {
      const pedido = { modelo: String(url).match(/models\/([^:]+):/)[1], cortado: false, config: JSON.parse(opciones.body).generationConfig };
      pedidos.push(pedido);
      opciones.signal.addEventListener("abort", () => {
        pedido.cortado = true;
        reject(Object.assign(new Error("This operation was aborted"), { name: "AbortError" }));
      });
    });
  return pedidos;
}
// What's pending gets its turn: the timers are the test's, the rest of the loop is real.
const turno = () => new Promise((resolve) => setImmediate(resolve));

// One model after another, each waited for `limite` and no more, until none is left.
async function esperarATodos(t, pregunta, limite) {
  const pedidos = colgado();
  const respuesta = G.preguntarGemini(...pregunta);
  await turno();
  for (const [i, modelo] of G.MODELOS.entries()) {
    assert.deepEqual([pedidos.length, pedidos[i].modelo, pedidos[i].cortado], [i + 1, modelo, false], `le pregunta a ${modelo}`);
    t.mock.timers.tick(limite - 1);
    await turno();
    assert.equal(pedidos[i].cortado, false, `${modelo} tiene ${limite / 1000} s enteros`);
    t.mock.timers.tick(1);
    await turno();
    assert.equal(pedidos[i].cortado, true, `y a los ${limite / 1000} s se corta`);
  }
  assert.deepEqual(await respuesta, { ok: false, texto: null, sinCuota: false, porHoy: false, modelo: null });
  assert.equal(pedidos.length, G.MODELOS.length, "uno por modelo: al que no contestó no se le vuelve a preguntar");
  return pedidos;
}

test("una respuesta de la charla espera 15 s a cada modelo y tiene 3.000 tokens", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => t.mock.timers.reset());
  const pedidos = await esperarATodos(t, ["hola, ¿cómo andás?"], 15000);
  assert.deepEqual(pedidos.map((p) => p.config.maxOutputTokens), [3000, 3000, 3000]);
  assert.deepEqual([G.LIMITES.TIMEOUT_MS, G.LIMITES.TOKENS], [15000, 3000]);
});

test("un texto largo espera 45 s a cada modelo y tiene 8.000 tokens", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => t.mock.timers.reset());
  const pedidos = await esperarATodos(t, ["seis horas de charla del grupo", { largo: true }], 45000);
  assert.deepEqual(pedidos.map((p) => p.config.maxOutputTokens), [8000, 8000, 8000]);
  assert.deepEqual([G.LIMITES.TIMEOUT_LARGO_MS, G.LIMITES.TOKENS_LARGO], [45000, 8000]);
  assert.ok(pedidos.every((p) => p.config.thinkingConfig.thinkingLevel === "LOW"), "pensando lo mismo que siempre");
});

// The room to answer is the long text's: an audio waits as long, and answers like any chat reply.
test("un audio sigue esperando 45 s, con los tokens de siempre", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => t.mock.timers.reset());
  const pedidos = await esperarATodos(t, ["escuchá esto", { adjuntos: [{ mimeType: "audio/ogg", datos: "AAAA" }] }], 45000);
  assert.deepEqual(pedidos.map((p) => p.config.maxOutputTokens), [3000, 3000, 3000]);
});
