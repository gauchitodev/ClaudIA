import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import toml from "@iarna/toml";

// Several Gemini keys, from different accounts: each has its own free quota. The best model goes first on every key,
// and only when all of them are out does the next model get a turn.

const RAIZ = process.cwd();
let G;
let llamadas = []; // [modelo, clave] of each request
let sinCuota = new Set(); // "modelo|clave" pairs that answer 429
const fetchReal = globalThis.fetch;
const logReal = console.log;

before(async () => {
  console.log = () => {};
  globalThis.fetch = async (url) => {
    const [, modelo, clave] = String(url).match(/models\/([^:]+):generateContent\?key=(.+)$/);
    llamadas.push([modelo, clave]);
    if (sinCuota.has(`${modelo}|${clave}`)) return { ok: false, status: 429 };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: `hola desde ${clave}` }] } }] }) };
  };
  G = await import("../lib/gemini.js");
});
after(() => {
  globalThis.fetch = fetchReal;
  console.log = logReal;
});
beforeEach(() => {
  llamadas = [];
  sinCuota = new Set();
  globalThis.modeloSinCuotaDesde.clear();
});

test("con una clave sin cuota, sigue con la otra en el mismo modelo", async () => {
  globalThis.geminiApiKeys = ["A", "B"];
  sinCuota.add("gemini-3.6-flash|A");
  const r = await G.preguntarGemini("hola");
  assert.equal(r.texto, "hola desde B");
  assert.equal(r.modelo, "gemini-3.6-flash");
  assert.deepEqual(llamadas, [["gemini-3.6-flash", "A"], ["gemini-3.6-flash", "B"]]);
  assert.ok(globalThis.modeloSinCuotaDesde.has("gemini-3.6-flash (clave 1)"), ".estado dice cuál clave se quedó sin cuota");

  llamadas = [];
  await G.preguntarGemini("hola de nuevo");
  assert.deepEqual(llamadas, [["gemini-3.6-flash", "B"]], "la clave sin cuota no se vuelve a probar por unas horas");
});

test("recién cuando todas las claves se quedan sin el mejor modelo pasa al siguiente", async () => {
  globalThis.geminiApiKeys = ["A", "B"];
  sinCuota.add("gemini-3.6-flash|A");
  sinCuota.add("gemini-3.6-flash|B");
  const r = await G.preguntarGemini("hola");
  assert.equal(r.modelo, "gemini-3.5-flash");
  assert.deepEqual(llamadas.map(([m, c]) => `${m}|${c}`), ["gemini-3.6-flash|A", "gemini-3.6-flash|B", "gemini-3.5-flash|A"]);
});

test("con una sola clave todo sigue como antes", async () => {
  globalThis.geminiApiKeys = undefined;
  globalThis.geminiApiKey = "UNICA";
  sinCuota.add("gemini-3.6-flash|UNICA");
  const r = await G.preguntarGemini("hola");
  assert.equal(r.modelo, "gemini-3.5-flash");
  assert.ok(globalThis.modeloSinCuotaDesde.has("gemini-3.6-flash"), "sin número de clave");
  assert.deepEqual(G.clavesGemini(), ["UNICA"]);
});

test("config.example.toml se lee, con la lista de claves vacía", () => {
  const config = toml.parse(fs.readFileSync(`${RAIZ}/config.example.toml`, "utf8"));
  assert.ok(Array.isArray(config.geminiApiKeys));
  assert.deepEqual(config.geminiApiKeys.filter(Boolean), []);
  assert.equal(config.tarjetaGrupo.titulo, "ClaudIA :)", "las secciones del final siguen en su lugar");
});
