// Respaldo de la IA cuando Gemini no responde: proveedores gratis con API compatible con OpenAI.
// Se prueban en orden; cada uno solo si tiene su API key en config.toml.
import { PERSONALIDAD } from "./gemini.js";

// Se prueban en este orden, y cada uno solo si tiene su key en config.toml. Si un modelo ya no existe,
// se saltea solo al siguiente: las listas gratuitas rotan seguido, así que estos nombres se actualizan acá.
const PROVEEDORES = [
  {
    // Groq: nivel gratis sin tarjeta, limitado solo por pedidos por minuto.
    nombre: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: () => globalThis.groqApiKey,
    modelos: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  },
  {
    // OpenRouter: los modelos terminados en ":free" no cobran. Tope de 20 pedidos por minuto y ~200 por día.
    nombre: "openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: () => globalThis.openrouterApiKey,
    modelos: ["openai/gpt-oss-120b:free", "meta-llama/llama-3.3-70b-instruct:free", "qwen/qwen3-32b:free"],
  },
  {
    // NVIDIA NIM: gratis con cuenta del programa de desarrolladores, ~40 pedidos por minuto.
    nombre: "nvidia",
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    key: () => globalThis.nvidiaApiKey,
    modelos: ["openai/gpt-oss-120b", "meta/llama-3.3-70b-instruct"],
  },
  {
    // Cerebras cerró su nivel gratis el 17/8/2026: sin saldo cargado devuelve 402. Queda último por si se le carga.
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
      // A diferencia de Gemini, acá el modelo no recibe el esquema por su cuenta: hay que decírselo.
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
    // gpt-oss "piensa" antes de responder; con esfuerzo bajo gasta menos tokens y responde más rápido
    if (modelo.startsWith("gpt-oss")) body.reasoning_effort = "low";

    const res = await fetch(prov.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${prov.key()}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    // 429 = pasó el límite de pedidos; 402 = la cuenta no tiene crédito. En los dos casos no sirve reintentar ese modelo.
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
