import { PERSONALIDAD } from "./gemini.js";

const GROQ_MODELOS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

async function llamarGroqModelo(modelo, texto, json = false) {
  try {
    const body = {
      model: modelo,
      messages: [
        { role: "system", content: PERSONALIDAD },
        { role: "user", content: texto },
      ],
      temperature: 0.9,
      max_tokens: 800,
    };
    if (json) body.response_format = { type: "json_object" };

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${globalThis.groqApiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) return { ok: false, sinCuota: true };
    if (!res.ok) return { ok: false, sinCuota: false };

    const respuestaJson = await res.json();
    const respuesta = respuestaJson?.choices?.[0]?.message?.content;
    if (respuesta) return { ok: true, texto: respuesta.trim() };
    return { ok: false, sinCuota: false };
  } catch (error) {
    return { ok: false, sinCuota: false };
  }
}

export async function preguntarGroq(texto, opciones = {}) {
  const { schema = null } = opciones;
  if (!globalThis.groqApiKey) return { ok: false, texto: null, modelo: null };

  for (const modelo of GROQ_MODELOS) {
    const r = await llamarGroqModelo(modelo, texto, !!schema);
    if (r.ok) return { ok: true, texto: r.texto, modelo };
    if (r.sinCuota) {
      console.log(`[groq] ${modelo} sin cuota, probando el siguiente...`);
      continue;
    }
    const r2 = await llamarGroqModelo(modelo, texto, !!schema);
    if (r2.ok) return { ok: true, texto: r2.texto, modelo };
  }

  return { ok: false, texto: null, modelo: null };
}
