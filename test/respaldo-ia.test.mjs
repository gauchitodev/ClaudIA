import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { sinRazonamiento, preguntarRespaldo } from "../lib/respaldo-ia.js";

// The AI fallback talks to the providers through fetch; here the global fetch is swapped for canned answers, per model.
// Only Groq has a key, so the cascade is Groq's three models in order.

let respuestas; // model -> what fetch answers for it
const pedidos = []; // the models asked, in order
const fetchReal = globalThis.fetch;
const logReal = console.log;
before(() => {
  Object.assign(globalThis, { groqApiKey: "clave", openrouterApiKey: "", nvidiaApiKey: "", cerebrasApiKey: "" });
  console.log = () => {}; // the cascade narrates every failure
  globalThis.fetch = async (url, opciones) => {
    const { model } = JSON.parse(opciones.body);
    pedidos.push(model);
    const r = respuestas[model] ?? { status: 500 };
    return { ok: r.status === 200, status: r.status, text: async () => "", json: async () => ({ choices: [{ message: { content: r.contenido } }] }) };
  };
});
after(() => {
  globalThis.fetch = fetchReal;
  console.log = logReal;
});

test("respaldo: el razonamiento que un modelo deja en la respuesta no llega al grupo", () => {
  assert.equal(sinRazonamiento("<think>El usuario saluda. Respondo corto.</think>\n\n¡Hola, bo!"), "¡Hola, bo!");
  assert.equal(sinRazonamiento("<THINK>uno</THINK>Hola <think>dos</think>che"), "Hola che");
  assert.equal(sinRazonamiento("  Hola  "), "Hola");
  assert.equal(sinRazonamiento("<think>Pienso y pienso, y el max_tokens me corta a mitad de"), "", "un pensamiento cortado no es una respuesta");
  assert.equal(sinRazonamiento("<think>solo pensé</think>"), "");
  assert.equal(sinRazonamiento(null), "");
  assert.equal(sinRazonamiento([{ type: "text", text: "Hola" }]), "", "lo que no es texto no se manda");
});

test("respaldo: la charla sale sin el <think>, y si el modelo solo pensó, contesta el siguiente", async () => {
  // Qwen on Groq thinks out loud by default.
  respuestas = {
    "openai/gpt-oss-120b": { status: 429 },
    "qwen/qwen3.6-27b": { status: 200, contenido: "<think>Me preguntan cómo ando. Contesto en rioplatense.</think>Todo bien, ¿y vos?" },
  };
  pedidos.length = 0;
  assert.deepEqual(await preguntarRespaldo("¿Cómo andás?"), { ok: true, texto: "Todo bien, ¿y vos?", modelo: "groq:qwen/qwen3.6-27b" });

  respuestas["qwen/qwen3.6-27b"] = { status: 200, contenido: "<think>Me preguntan cómo ando. Podría decir que" };
  respuestas["openai/gpt-oss-20b"] = { status: 200, contenido: "Acá ando." };
  pedidos.length = 0;
  assert.deepEqual(await preguntarRespaldo("¿Cómo andás?"), { ok: true, texto: "Acá ando.", modelo: "groq:openai/gpt-oss-20b" });
  assert.deepEqual(pedidos, ["openai/gpt-oss-120b", "qwen/qwen3.6-27b", "openai/gpt-oss-20b"]);
});

test("respaldo: con esquema, el JSON sale limpio aunque venga con razonamiento y con cerco de código", async () => {
  respuestas = { "openai/gpt-oss-120b": { status: 200, contenido: '<think>Una de geografía.</think>\n```json\n{"pregunta":"¿Capital de Japón?"}\n```' } };
  const r = await preguntarRespaldo("Una pregunta de trivia", { schema: { type: "object" } });
  assert.equal(r.texto, '{"pregunta":"¿Capital de Japón?"}');
  assert.deepEqual(JSON.parse(r.texto), { pregunta: "¿Capital de Japón?" });
});
