// Trivia relámpago: en los grupos que la activaron (.triviarelampago), un par de veces por día y en horario al azar,
// Claudia tira una pregunta con opciones y el primero que acierta se lleva las monedas. Las preguntas las genera
// la IA; si no responde, salen del banco de .trivia. Los horarios se agendan como pendientes, así sobreviven reinicios.
import { chatsConOpcion, periodoCerrado, marcarPeriodoCerrado, crearPendiente, ganarCoins } from "../database-functions.js";
import { preguntarIA } from "./ia.js";
import { COINS } from "./urucoins.js";
import { ACTIVIDAD, claveDia } from "./actividad.js";
import { preguntas as BANCO } from "../plugins/fun-trivia.js";

if (!globalThis.relampagos) globalThis.relampagos = new Map(); // chat -> trivia en curso

const LETRAS = ["A", "B", "C", "D"];
const TEMAS = ["geografía", "historia", "ciencia", "cine y series", "música", "deportes", "Uruguay", "comida", "tecnología", "animales", "literatura", "cultura pop"];
const ESQUEMA = {
  type: "object",
  properties: {
    pregunta: { type: "string" },
    opciones: { type: "array", items: { type: "string" } },
    correcta: { type: "string", enum: ["A", "B", "C", "D"] },
  },
  required: ["pregunta", "opciones", "correcta"],
};

async function generarTrivia() {
  if (globalThis.geminiApiKey) {
    const tema = TEMAS[Math.floor(Math.random() * TEMAS.length)];
    const r = await preguntarIA(`Escribí UNA pregunta de trivia de ${tema}, de dificultad media, con exactamente 4 opciones cortas y una sola correcta. Respondé solo con los campos "pregunta", "opciones" (los 4 textos, sin letra adelante) y "correcta" (A, B, C o D).`, { schema: ESQUEMA }).catch(() => ({ ok: false }));
    if (r.ok) {
      try {
        const d = JSON.parse(r.texto);
        if (d.pregunta && Array.isArray(d.opciones) && d.opciones.length === 4 && /^[ABCD]$/.test(d.correcta)) {
          return { pregunta: String(d.pregunta).trim(), opciones: d.opciones.map((o) => String(o).trim()), correcta: d.correcta.toLowerCase() };
        }
      } catch {}
    }
  }
  const t = BANCO[Math.floor(Math.random() * BANCO.length)];
  return { pregunta: t.pregunta, opciones: t.opciones.map((o) => o.replace(/^[A-D]\)\s*/, "")), correcta: t.respuesta.toLowerCase() };
}

// Agenda las trivias del día (una vez por día por grupo), en momentos al azar dentro de la ventana horaria.
export function programarTriviasDelDia() {
  const ahora = new Date();
  if (ahora.getHours() < ACTIVIDAD.RELAMPAGO_DESDE) return 0;
  const hoy = claveDia(ahora);
  let agendadas = 0;
  for (const chat of chatsConOpcion("triviaRelampago")) {
    if (periodoCerrado(chat, "trivia_relampago_prog", hoy)) continue;
    marcarPeriodoCerrado(chat, "trivia_relampago_prog", hoy);
    const inicio = Math.max(Date.now() + 60 * 1000, new Date(ahora).setHours(ACTIVIDAD.RELAMPAGO_DESDE, 0, 0, 0));
    const fin = new Date(ahora).setHours(ACTIVIDAD.RELAMPAGO_HASTA, 0, 0, 0);
    if (fin <= inicio) continue;
    for (let i = 0; i < ACTIVIDAD.RELAMPAGO_VECES; i++) {
      crearPendiente(chat, "bot", "trivia_relampago", {}, inicio + Math.floor(Math.random() * (fin - inicio)));
      agendadas++;
    }
  }
  return agendadas;
}

// La llama el procesador de pendientes a la hora agendada.
export async function lanzarTriviaRelampago(client, chat) {
  if (globalThis.relampagos.has(chat)) return;
  const t = await generarTrivia();
  const texto = `⚡ *TRIVIA RELÁMPAGO* — ${COINS.TRIVIA_RELAMPAGO} UruCoins para el primero que acierte\n\n${t.pregunta}\n${t.opciones.map((o, i) => `${LETRAS[i]}) ${o}`).join("\n")}\n\n_Respondé a este mensaje con la letra. Tenés ${ACTIVIDAD.RELAMPAGO_SEGUNDOS} segundos y un solo intento._`;
  const enviado = await client.sendMessage(chat, { text: texto });
  const estado = { respuesta: t.correcta, opciones: t.opciones, mensajeId: enviado?.key?.id, intentos: new Set(), timeout: null };
  estado.timeout = setTimeout(() => {
    if (globalThis.relampagos.get(chat) !== estado) return;
    globalThis.relampagos.delete(chat);
    client.sendMessage(chat, { text: `⏳ Nadie acertó. Era *${t.correcta.toUpperCase()}) ${t.opciones["abcd".indexOf(t.correcta)]}*` }).catch(console.error);
  }, ACTIVIDAD.RELAMPAGO_SEGUNDOS * 1000);
  globalThis.relampagos.set(chat, estado);
}

// Se llama en cada mensaje. Devuelve { reaccion, texto?, mentions? } si el mensaje era una respuesta a la relámpago.
export function responderRelampago(m) {
  const estado = globalThis.relampagos.get(m.chat);
  if (!estado || !m.quoted?.id || m.quoted.id !== estado.mensajeId) return null;
  const letra = String(m.text || "")
    .trim()
    .toLowerCase()
    .replace(/[).]$/, "");
  if (!/^[abcd]$/.test(letra)) return null;
  if (estado.intentos.has(m.sender)) return { reaccion: "🙅" };
  estado.intentos.add(m.sender);
  if (letra !== estado.respuesta) return { reaccion: "❌" };
  clearTimeout(estado.timeout);
  globalThis.relampagos.delete(m.chat);
  ganarCoins(m.chat, m.sender, COINS.TRIVIA_RELAMPAGO, "trivia_relampago");
  return { reaccion: "✅", texto: `⚡ ¡Acertó @${m.sender.split("@")[0]}! Era ${letra.toUpperCase()}) ${estado.opciones["abcd".indexOf(letra)]}. 🪙 +${COINS.TRIVIA_RELAMPAGO} UruCoins`, mentions: [m.sender] };
}
