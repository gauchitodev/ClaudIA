import { preguntarGemini } from "./gemini.js";
import { preguntarGroq } from "./groq.js";

if (!globalThis.modeloActivo) globalThis.modeloActivo = null;

function registrarUso(modelo, texto) {
  let cambioModelo = null;
  if (globalThis.modeloActivo !== modelo) {
    console.log(`[ia] ahora usando ${modelo}${globalThis.modeloActivo ? ` (antes: ${globalThis.modeloActivo})` : ""}`);
    if (globalThis.modeloActivo) cambioModelo = modelo;
    globalThis.modeloActivo = modelo;
  }
  return { ok: true, texto, sinCuota: false, cambioModelo };
}

export async function preguntarIA(texto, opciones = {}) {
  const g = await preguntarGemini(texto, opciones);
  if (g.ok) return registrarUso(g.modelo, g.texto);

  if (g.sinCuota) {
    const q = await preguntarGroq(texto, opciones);
    if (q.ok) return registrarUso(`groq:${q.modelo}`, q.texto);
    return { ok: false, texto: null, sinCuota: true, cambioModelo: null };
  }

  return { ok: false, texto: null, sinCuota: false, cambioModelo: null };
}
