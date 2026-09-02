// Respaldo de la IA cuando Gemini no responde: proveedores gratis con API compatible con OpenAI.
// Se prueban en orden; cada uno solo si tiene su API key en config.toml.
import { PERSONALIDAD } from "./gemini.js";

const PROVEEDORES = [
  {
    nombre: "cerebras",
    url: "https://api.cerebras.ai/v1/chat/completions",
    key: () => globalThis.cerebrasApiKey,
    // La lista de modelos gratis de Cerebras rota; si uno ya no existe, se salta solo al siguiente.
    modelos: ["gpt-oss-120b", "gemma-4-31b", "llama-3.3-70b", "llama3.1-8b"],
  },
  {
    nombre: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: () => globalThis.groqApiKey,
    modelos: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
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

    if (res.status === 429) return { ok: false, sinCuota: true };
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
