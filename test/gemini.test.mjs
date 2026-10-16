import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, ultimoEnviado } from "./helpers.mjs";

// A 429 from Gemini pauses that model (lib/gemini.js): a minute, doubling while the 429s keep coming, up to 4 hours.
// It used to be 4 hours after any 429, and a 429 is also what a per-minute limit answers: one burst of messages left
// Claudia on the fallback models, deaf to audios, for the rest of the afternoon. Only a long pause counts as the day's
// quota, and only then do the messages say "until tomorrow" and the owner get a notice.

let G, IA, Ia, Resumen, CC;
let respuestas = {}; // per model, an HTTP status to fail with, the JSON to answer with, or an error to throw; the rest answer "soy <model>"
const pedidos = []; // the models asked, in order
const cuerpos = []; // what was sent to them, parsed
const fetchReal = globalThis.fetch;
const logReal = console.log;
const errorReal = console.error;
const MIN = 60 * 1000;
const HORA = 60 * MIN;

before(async () => {
  await prepararBase("gemini");
  globalThis.geminiApiKey = "clave";
  globalThis.txt = (await import("../lib/strings.js")).default;
  console.log = () => {}; // the AI modules narrate which model they try
  console.error = () => {};
  globalThis.fetch = async (url, opciones) => {
    const modelo = String(url).match(/models\/([^:]+):/)?.[1];
    pedidos.push(modelo);
    cuerpos.push(JSON.parse(opciones.body));
    const r = respuestas[modelo];
    if (r instanceof Error) throw r;
    if (typeof r === "number") return { ok: false, status: r, text: async () => "" };
    if (r) return { ok: true, status: 200, json: async () => r };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: `soy ${modelo}` }] } }] }) };
  };
  G = await import("../lib/gemini.js");
  IA = await import("../lib/ia.js");
  Ia = (await import("../plugins/tools-ia.js")).default;
  Resumen = (await import("../plugins/resumen.js")).default;
  CC = await import("../lib/contexto-chat.js");
});
after(() => {
  globalThis.fetch = fetchReal;
  console.log = logReal;
  console.error = errorReal;
});
beforeEach(() => {
  globalThis.geminiEnPausa.clear();
  pedidos.length = 0;
  cuerpos.length = 0;
  respuestas = {};
});

const todosCon = (status) => Object.fromEntries(G.MODELOS.map((m) => [m, status]));
// As if the 429s had kept coming for hours: every model paused that long.
const alargarPausas = (ms) => {
  for (const m of G.MODELOS) globalThis.geminiEnPausa.set(m, { hasta: Date.now() + ms, seguidos: 8 });
};

test("un 429 frena ese modelo un minuto, no cuatro horas, y una respuesta lo libera", async () => {
  const [A, B] = G.MODELOS;
  respuestas = { [A]: 429 };
  const antes = Date.now();
  assert.equal((await G.preguntarGemini("hola")).texto, `soy ${B}`);
  const pausa = globalThis.geminiEnPausa.get(A);
  assert.ok(pausa.hasta - antes >= MIN && pausa.hasta - antes < MIN + 5000, `un minuto, no ${pausa.hasta - antes} ms`);

  pedidos.length = 0;
  await G.preguntarGemini("hola");
  assert.deepEqual(pedidos, [B], "durante ese minuto no se le pregunta");

  pausa.hasta = Date.now() - 1; // the minute went by
  respuestas = {};
  pedidos.length = 0;
  assert.equal((await G.preguntarGemini("hola")).texto, `soy ${A}`);
  assert.equal(globalThis.geminiEnPausa.has(A), false, "contestó: la próxima pausa vuelve a ser de un minuto");
});

test("cada 429 seguido duplica la pausa, hasta 4 horas; los del mismo tirón no cuentan, y uno de horas después arranca de nuevo", () => {
  const T = Date.UTC(2031, 0, 15, 12);
  G.pausarModelo("x", T);
  G.pausarModelo("x", T + 5000); // another request of the same burst, sent before the pause
  assert.equal(globalThis.geminiEnPausa.get("x").hasta, T + MIN);
  const esperas = [];
  let t = T + MIN;
  for (let i = 0; i < 10; i++) {
    G.pausarModelo("x", t);
    const { hasta } = globalThis.geminiEnPausa.get("x");
    esperas.push((hasta - t) / MIN);
    t = hasta;
  }
  assert.deepEqual(esperas, [2, 4, 8, 16, 32, 64, 128, 240, 240, 240]);
  G.pausarModelo("x", t + 5 * HORA); // nobody asked it since the last pause ended: a new burst
  assert.equal(globalThis.geminiEnPausa.get("x").hasta, t + 5 * HORA + MIN);
});

test("un 429 de una búsqueda no le saca el modelo a la charla", async () => {
  respuestas = { [G.MODELOS[0]]: 429 };
  await G.preguntarGemini("¿es verdad?", { buscarEnWeb: true });
  assert.equal(globalThis.geminiEnPausa.size, 0);
});

test("«por hoy» y el aviso al owner, solo cuando todos llevan una hora o más frenados", async () => {
  const antes = globalThis.enviados.length;
  respuestas = todosCon(429);
  let r = await IA.preguntarIA("hola");
  assert.deepEqual([r.ok, r.sinCuota, r.porHoy], [false, true, false], "un tirón: en un minuto vuelve");
  assert.ok(G.vuelveGeminiEn() > 55 * 1000 && G.vuelveGeminiEn() <= MIN);
  assert.equal(globalThis.enviados.length, antes, "no se avisa al owner");

  alargarPausas(2 * HORA);
  r = await IA.preguntarIA("hola");
  assert.deepEqual([r.sinCuota, r.porHoy], [true, true]);
  assert.equal(ultimoEnviado().chat, "59899111222@s.whatsapp.net");
  assert.match(ultimoEnviado().msg.text, /^🤖 Se quedó sin cuota la IA/);
});

test(".ia: en un tirón pide probar en un rato; «por hoy» solo con la cuota del día", async () => {
  const client = { ...clienteFalso(), sendPresenceUpdate: async () => {} };
  const pedir = async () => {
    globalThis.esperaIa.delete("g@g.us"); // the wait between questions has its own test
    await Ia.run({ chat: "g@g.us" }, { client, text: "hola" });
    return ultimoEnviado().msg.text;
  };
  respuestas = todosCon(429);
  assert.equal(await pedir(), "Ta, se me complicó pensar ahora, probá de nuevo en un rato bo.");
  alargarPausas(2 * HORA);
  assert.equal(await pedir(), "Se me acabó la cuota gratis de la IA por hoy, probá de nuevo mañana.");
});

test(".resumen: lo mismo", async () => {
  const C = "resumen@g.us";
  for (let i = 10; i > 0; i--) CC.recordarMensaje(C, "Ana", `mensaje ${i}`, false, { fecha: Date.now() - i * MIN });
  const client = { ...clienteFalso(), sendPresenceUpdate: async () => {} };
  const pedir = async () => {
    await Resumen.run({ chat: C, isGroup: true, sender: "555@lid" }, { client, args: [] });
    return ultimoEnviado().msg.text;
  };
  respuestas = todosCon(429);
  assert.equal(await pedir(), "Se me trabó el resumen, probá de nuevo en un rato.");
  alargarPausas(2 * HORA);
  assert.equal(await pedir(), "Se me acabó la cuota de la IA por hoy, no puedo resumir 😅");
});

// What Gemini answers when it blocks the request, when the thinking eats the whole budget, when it blocks the answer
// halfway, and when the budget runs out in the middle of a JSON.
const BLOQUEADO = { promptFeedback: { blockReason: "PROHIBITED_CONTENT" } };
const TODO_PENSANDO = { candidates: [{ finishReason: "MAX_TOKENS", content: { role: "model", parts: [] } }], usageMetadata: { thoughtsTokenCount: 2990 } };
const CORTADO_POR_SEGURIDAD = { candidates: [{ finishReason: "SAFETY", content: { parts: [{ text: "Mirá, lo que" }] } }] };
const JSON_CORTADO = { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"comando":"ninguno","respuesta":"Mirá, lo que pasó fue que' }] } }] };
const responde = (texto) => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: texto }] } }] });
const SCHEMA = { type: "OBJECT", properties: { respuesta: { type: "STRING" } }, required: ["respuesta"] };

test("una respuesta bloqueada, vacía o cortada pasa al modelo siguiente sin volver a pedirle al mismo", async () => {
  const [A, B, C] = G.MODELOS;
  respuestas = { [A]: BLOQUEADO, [B]: TODO_PENSANDO };
  assert.equal((await G.preguntarGemini("hola")).texto, `soy ${C}`);
  assert.deepEqual(pedidos, [A, B, C]);

  pedidos.length = 0;
  respuestas = { [A]: CORTADO_POR_SEGURIDAD, [B]: responde("   ") };
  assert.equal((await G.preguntarGemini("hola")).texto, `soy ${C}`, "ni un pedazo de respuesta ni una en blanco");
  assert.deepEqual(pedidos, [A, B, C]);

  pedidos.length = 0;
  respuestas = { [A]: TODO_PENSANDO, [B]: BLOQUEADO, [C]: TODO_PENSANDO };
  const r = await G.preguntarGemini("hola");
  assert.deepEqual([r.ok, r.sinCuota, r.porHoy], [false, false, false], "no es la cuota: «probá en un rato»");
  assert.equal(pedidos.length, 3, "un pedido por modelo, no seis");
  assert.equal(globalThis.geminiEnPausa.size, 0, "y ninguno queda en pausa");
});

test("un JSON cortado o roto pasa al modelo siguiente; sin schema, un texto suelto es una respuesta", async () => {
  const [A, B, C] = G.MODELOS;
  const bueno = JSON.stringify({ respuesta: "ta" });
  respuestas = { [A]: JSON_CORTADO, [B]: responde('{"respuesta": "ta"'), [C]: responde(bueno) };
  assert.deepEqual(await G.preguntarGemini("hola", { schema: SCHEMA }), { ok: true, texto: bueno, fuentes: [], sinCuota: false, modelo: C });
  assert.deepEqual(pedidos, [A, B, C]);

  pedidos.length = 0;
  respuestas = { [A]: responde("no es JSON y está bien") };
  assert.equal((await G.preguntarGemini("hola")).texto, "no es JSON y está bien");
  assert.deepEqual(pedidos, [A]);
});

test("un error del servidor o de la conexión se reintenta una vez en el mismo modelo; uno del pedido o un modelo que no contestó a tiempo, no", async () => {
  const [A, B] = G.MODELOS;
  respuestas = { [A]: 500 };
  assert.equal((await G.preguntarGemini("hola")).texto, `soy ${B}`);
  assert.deepEqual(pedidos, [A, A, B]);

  pedidos.length = 0;
  respuestas = { [A]: new Error("socket hang up") };
  assert.equal((await G.preguntarGemini("hola")).texto, `soy ${B}`);
  assert.deepEqual(pedidos, [A, A, B]);

  pedidos.length = 0;
  respuestas = { [A]: 400 };
  assert.equal((await G.preguntarGemini("hola")).texto, `soy ${B}`);
  assert.deepEqual(pedidos, [A, B], "repetir el mismo pedido da el mismo 400");

  pedidos.length = 0;
  respuestas = { [A]: Object.assign(new Error("This operation was aborted"), { name: "AbortError" }) };
  assert.equal((await G.preguntarGemini("hola")).texto, `soy ${B}`);
  assert.deepEqual(pedidos, [A, B], "el que no contestó a tiempo no tiene otro turno");
});

test("el pedido razona poco, deja lugar para la respuesta y no manda temperature", async () => {
  await G.preguntarGemini("hola");
  await G.preguntarGemini("hola", { schema: SCHEMA });
  for (const { generationConfig } of cuerpos) {
    assert.deepEqual(generationConfig.thinkingConfig, { thinkingLevel: "LOW" });
    assert.equal(generationConfig.maxOutputTokens, 3000);
    assert.equal("temperature" in generationConfig, false, "en los modelos 3.x está desaconsejada");
  }
  assert.equal(cuerpos[1].generationConfig.responseMimeType, "application/json");
});

test(".ia: una pregunta cada 20 s por chat, contestada o no; en otro chat no se espera", async () => {
  const [A] = G.MODELOS;
  const client = { ...clienteFalso(), sendPresenceUpdate: async () => {} };
  const pedir = async (chat, text) => {
    await Ia.run({ chat }, { client, text });
    return ultimoEnviado().msg.text;
  };
  const C = "espera@g.us";
  assert.equal(await pedir(C, "hola"), `soy ${A}`);
  assert.equal(await pedir(C, "otra"), "Recién me preguntaron algo; probá de nuevo en 20 s.");
  assert.deepEqual(pedidos, [A], "sin preguntarle a la IA");
  assert.equal(await pedir("otro@g.us", "hola"), `soy ${A}`);

  globalThis.esperaIa.set(C, Date.now() - 19500);
  assert.equal(await pedir(C, "otra"), "Recién me preguntaron algo; probá de nuevo en 1 s.");
  globalThis.esperaIa.set(C, Date.now() - 20000);
  respuestas = todosCon(500);
  assert.equal(await pedir(C, "otra"), "Ta, se me complicó pensar ahora, probá de nuevo en un rato bo.");
  respuestas = {};
  assert.match(await pedir(C, "otra"), /^Recién me preguntaron algo; probá de nuevo en (19|20) s\.$/, "la que falló también cuenta");

  globalThis.esperaIa.set(C, Date.now() - 20000);
  assert.equal(await pedir(C, ""), globalThis.txt.iaPeticion);
  assert.equal(await pedir(C, "hola"), `soy ${A}`, "un .ia sin pregunta no arranca la espera");
});
