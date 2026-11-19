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

// What a fallback model is told of what stayed behind: it only takes text, and it isn't to answer as if it had heard
// the audio or seen the photo.
const AVISO_AUDIO = "(Aviso para vos: el audio no lo pudiste escuchar esta vez. Si la charla depende de lo que dice, decilo con naturalidad y pedí que te lo escriban; no inventes lo que dice.)";
const AVISO_FOTO = "(Aviso para vos: la foto no la pudiste ver esta vez. Si la charla depende de lo que muestra, decilo con naturalidad y pedí que te cuenten qué es; no inventes lo que se ve.)";
const esImagen = (adjunto) => String(adjunto?.mimeType).startsWith("image/");

// The answer, from Gemini or, if it fails, from a fallback. sinAdjuntos: a fallback answered, and what was attached
// (opciones.adjuntos: an audio, a photo) never reached it: whatever it says of them, it made up.
export async function preguntarIA(texto, opciones = {}) {
  const g = await preguntarGemini(texto, opciones);
  if (g.ok) return registrarUso(g.modelo, g.texto);

  // Gemini failed (quota, 503, timeout, whatever): try the fallback, with a word on what it isn't getting.
  const adjuntos = opciones.adjuntos || [];
  const avisos = [adjuntos.some((a) => !esImagen(a)) && AVISO_AUDIO, adjuntos.some(esImagen) && AVISO_FOTO].filter(Boolean);
  const r = await preguntarRespaldo([texto, ...avisos].join("\n\n"), opciones);
  if (r.ok) return { ...registrarUso(r.modelo, r.texto), sinAdjuntos: adjuntos.length > 0 };

  const sinCuota = !!(g.sinCuota || r.sinCuota);
  // porHoy: Gemini has been out of quota for a long while (lib/gemini.js), and not just paused by a burst, which clears
  // within minutes and isn't worth a notice.
  const porHoy = !!g.porHoy;
  if (porHoy) avisarOwner("Se quedó sin cuota la IA (Gemini y los respaldos). Hasta que se renueve, Claudia no responde charlas.", "ia-sin-cuota", 6 * 60 * 60 * 1000);
  return { ok: false, texto: null, sinCuota, porHoy, cambioModelo: null };
}
