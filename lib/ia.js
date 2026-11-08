import { preguntarGemini } from "./gemini.js";
import { preguntarRespaldo } from "./respaldo-ia.js";
import { avisarOwner } from "./avisos.js";

// The model that answered last, Gemini's or a fallback's, for .estado and the logs. It was a global.
let enUso = null;
export const modeloActivo = () => enUso;

function registrarUso(modelo, texto) {
  let cambioModelo = null;
  if (enUso !== modelo) {
    console.log(`[ia] ahora usando ${modelo}${enUso ? ` (antes: ${enUso})` : ""}`);
    if (enUso) cambioModelo = modelo;
    enUso = modelo;
  }
  return { ok: true, texto, sinCuota: false, cambioModelo };
}

export async function preguntarIA(texto, opciones = {}) {
  const g = await preguntarGemini(texto, opciones);
  if (g.ok) return registrarUso(g.modelo, g.texto);

  // Gemini failed (quota, 503, timeout, whatever): try the fallback. The fallback models only take text, so an
  // attached audio stays behind, and they're told so instead of answering as if they had heard it.
  const sinAudio = opciones.adjuntos?.length ? `${texto}\n\n(Aviso para vos: el audio no lo pudiste escuchar esta vez. Si la charla depende de lo que dice, decilo con naturalidad y pedí que te lo escriban; no inventes lo que dice.)` : texto;
  const r = await preguntarRespaldo(sinAudio, opciones);
  if (r.ok) return registrarUso(r.modelo, r.texto);

  const sinCuota = !!(g.sinCuota || r.sinCuota);
  // porHoy: Gemini has been out of quota for a long while (lib/gemini.js), and not just paused by a burst, which clears
  // within minutes and isn't worth a notice.
  const porHoy = !!g.porHoy;
  if (porHoy) avisarOwner("Se quedó sin cuota la IA (Gemini y los respaldos). Hasta que se renueve, Claudia no responde charlas.", "ia-sin-cuota", 6 * 60 * 60 * 1000);
  return { ok: false, texto: null, sinCuota, porHoy, cambioModelo: null };
}
