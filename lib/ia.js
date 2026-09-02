import { preguntarGemini } from "./gemini.js";
import { preguntarRespaldo } from "./respaldo-ia.js";

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

  // Gemini falló (por cuota, por 503, por timeout, lo que sea): probamos el respaldo.
  const r = await preguntarRespaldo(texto, opciones);
  if (r.ok) return registrarUso(r.modelo, r.texto);

  return { ok: false, texto: null, sinCuota: !!(g.sinCuota || r.sinCuota), cambioModelo: null };
}
