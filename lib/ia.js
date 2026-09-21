import { preguntarGemini } from "./gemini.js";
import { preguntarRespaldo } from "./respaldo-ia.js";
import { avisarOwner } from "./avisos.js";

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

  // Gemini failed (quota, 503, timeout, whatever): try the fallback.
  const r = await preguntarRespaldo(texto, opciones);
  if (r.ok) return registrarUso(r.modelo, r.texto);

  const sinCuota = !!(g.sinCuota || r.sinCuota);
  if (sinCuota) avisarOwner("Se quedó sin cuota la IA (Gemini y los respaldos). Hasta que se renueve, Claudia no responde charlas.", "ia-sin-cuota", 6 * 60 * 60 * 1000);
  return { ok: false, texto: null, sinCuota, cambioModelo: null };
}
