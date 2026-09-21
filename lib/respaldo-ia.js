// AI fallback for when Gemini doesn't answer: free providers with an OpenAI-compatible API.
// They're tried in order; each one only if its API key is in config.toml.
import { PERSONALIDAD } from "./gemini.js";

// Tried in this order, and each only if its key is in config.toml. If a model no longer exists it simply falls
// through to the next: the free tiers rotate often, so these names get updated here.
const PROVEEDORES = [
  {
    // Groq: free tier with no card, limited only by requests per minute. The llama 3.x models were retired on
    // 2026-08-16; these are the replacements their docs recommend (checked 2026-09-06).
    nombre: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: () => globalThis.groqApiKey,
    modelos: ["openai/gpt-oss-120b", "qwen/qwen3.6-27b", "openai/gpt-oss-20b"],
  },
  {
    // OpenRouter: models ending in ":free" cost nothing. Capped at 20 requests a minute and ~200 a day.
    // The free list rotates often: check it without a key at https://openrouter.ai/api/v1/models (checked 2026-09-06).
    nombre: "openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: () => globalThis.openrouterApiKey,
    modelos: ["google/gemma-4-31b-it:free", "nvidia/nemotron-3-super-120b-a12b:free", "z-ai/glm-5.2:free"],
  },
  {
    // NVIDIA NIM: free with a developer programme account, ~40 requests a minute.
    // The catalogue can be checked without a key at https://integrate.api.nvidia.com/v1/models (checked 2026-09-06).
    nombre: "nvidia",
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    key: () => globalThis.nvidiaApiKey,
    modelos: ["google/gemma-4-31b-it", "nvidia/nemotron-3-super-120b-a12b", "openai/gpt-oss-20b"],
  },
  {
    // Cerebras closed its free tier on 2026-08-17: with no credit loaded it returns 402. It stays last in case it gets topped up.
    nombre: "cerebras",
    url: "https://api.cerebras.ai/v1/chat/completions",
    key: () => globalThis.cerebrasApiKey,
    modelos: ["gpt-oss-120b", "gemma-4-31b"],
  },
];

const TIMEOUT_MS = 20000;

// Devuelve { ok, texto } o { ok: false, sinCuota, modeloInexistente, jsonNoSoportado }
async function llamarModelo(prov, modelo, texto, schema, usarJsonMode) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let contenido = texto;
    if (schema) {
      // Unlike Gemini, here the model doesn't get the schema on its own: it has to be told.
      contenido += `\n\nRespondé ÚNICAMENTE con un objeto JSON válido (sin texto antes ni después, sin comillas de código) que cumpla exactamente este esquema:\n${JSON.stringify(schema)}`;
    }

    const body = {
      model: modelo,
      messages: [
        { role: "system", content: PERSONALIDAD },
        { role: "user", content: contenido },
      ],
      temperature: 0.9,
      max_tokens: 800,
    };
    if (schema && usarJsonMode) body.response_format = { type: "json_object" };
    // gpt-oss "thinks" before answering; at low effort it spends fewer tokens and replies faster.
    // The id may carry a provider prefix ("openai/gpt-oss-20b"), so the name is matched, not the start of the string.
    if (/(^|\/)gpt-oss/.test(modelo)) body.reasoning_effort = "low";

    const res = await fetch(prov.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${prov.key()}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    // 429 = over the request limit; 402 = the account has no credit. In both cases retrying that model is pointless.
    if (res.status === 429 || res.status === 402) return { ok: false, sinCuota: true };
    if (!res.ok) {
      const detalle = (await res.text().catch(() => "")).slice(0, 300);
      console.log(`[${prov.nombre}] ${modelo} respondió ${res.status}: ${detalle}`);
      const esDeModelo = res.status === 404 || /model/i.test(detalle);
      const esDeJson = usarJsonMode && /response_format|json/i.test(detalle);
      return { ok: false, sinCuota: false, modeloInexistente: esDeModelo && !esDeJson, jsonNoSoportado: esDeJson };
    }

    const data = await res.json();
    let respuesta = data?.choices?.[0]?.message?.content;
    if (!respuesta) return { ok: false, sinCuota: false };
    respuesta = respuesta.trim();
    if (schema) respuesta = respuesta.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    return { ok: true, texto: respuesta };
  } catch (e) {
    console.log(`[${prov.nombre}] ${modelo} ${e.name === "AbortError" ? `no respondió en ${TIMEOUT_MS / 1000}s` : `excepción: ${e.message}`}`);
    return { ok: false, sinCuota: false };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Devuelve { ok: true, texto, modelo } o { ok: false, texto: null, modelo: null, sinCuota }
export async function preguntarRespaldo(texto, opciones = {}) {
  const { schema = null } = opciones;
  let algunoSinCuota = false;

  for (const prov of PROVEEDORES) {
    if (!prov.key()) continue;

    for (const modelo of prov.modelos) {
      let r = await llamarModelo(prov, modelo, texto, schema, true);
      if (!r.ok && r.jsonNoSoportado) r = await llamarModelo(prov, modelo, texto, schema, false);
      if (r.ok) return { ok: true, texto: r.texto, modelo: `${prov.nombre}:${modelo}` };

      if (r.sinCuota) {
        algunoSinCuota = true;
        console.log(`[${prov.nombre}] ${modelo} sin cuota, probando el siguiente...`);
      } else if (r.modeloInexistente) {
        console.log(`[${prov.nombre}] ${modelo} ya no está disponible, probando el siguiente...`);
      }
    }
  }

  return { ok: false, texto: null, modelo: null, sinCuota: algunoSinCuota };
}
