// Trivia: una pregunta con cuatro opciones, un intento por persona y el primero que acierta cobra. La usan .trivia
// (a pedido) y la trivia relámpago (sale sola, ver trivia-relampago.js). Las preguntas las genera la IA; si no
// responde, salen del banco. Se responde con la letra, citando la pregunta o suelta en el chat, y también vale el
// texto de la opción.
import { preguntarIA } from "./ia.js";
import { elegirAlAzar } from "./azar.js";
import { BANCO } from "./trivia-banco.js";

export const TRIVIA = {
  SEGUNDOS: 30, // lo que dura una ronda de .trivia
  RECIENTES: 25, // preguntas que se recuerdan por grupo para no repetir
};
const LETRAS = ["a", "b", "c", "d"];
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

if (!globalThis.rondasTrivia) globalThis.rondasTrivia = new Map(); // chat -> ronda abierta
const recientes = new Map(); // chat -> últimas preguntas hechas

export const normalizar = (t) =>
  String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const recordar = (chat, pregunta) => {
  const lista = recientes.get(chat) || [];
  lista.push(pregunta);
  if (lista.length > TRIVIA.RECIENTES) lista.shift();
  recientes.set(chat, lista);
};

// Pregunta nueva para el grupo: de la IA si contesta bien, si no del banco, y en los dos casos sin repetir las últimas.
export async function generarPregunta(chat) {
  const hechas = recientes.get(chat) || [];
  if (globalThis.geminiApiKey) {
    const tema = elegirAlAzar(TEMAS);
    const r = await preguntarIA(`Escribí UNA pregunta de trivia de ${tema}, de dificultad media, con exactamente 4 opciones cortas y una sola correcta. Respondé solo con los campos "pregunta", "opciones" (los 4 textos, sin letra adelante) y "correcta" (A, B, C o D).`, { schema: ESQUEMA }).catch(() => ({ ok: false }));
    if (r.ok) {
      try {
        const d = JSON.parse(r.texto);
        if (d.pregunta && Array.isArray(d.opciones) && d.opciones.length === 4 && /^[ABCD]$/.test(d.correcta) && !hechas.includes(String(d.pregunta).trim())) {
          return { pregunta: String(d.pregunta).trim(), opciones: d.opciones.map((o) => String(o).trim()), correcta: d.correcta.toLowerCase() };
        }
      } catch {}
    }
  }
  const candidatas = BANCO.filter((p) => !hechas.includes(p.pregunta));
  return elegirAlAzar(candidatas.length ? candidatas : BANCO);
}

export const rondaDe = (chat) => globalThis.rondasTrivia.get(chat) || null;
export const segundosRestantes = (ronda) => Math.max(0, Math.ceil((ronda.vence - Date.now()) / 1000));
const textoCorrecta = (p) => `${p.correcta.toUpperCase()}) ${p.opciones[LETRAS.indexOf(p.correcta)]}`;

export function textoPregunta({ titulo, premio, pregunta, segundos }) {
  const cabecera = premio ? `${titulo} — ${premio} UruCoins para el primero que acierte` : titulo;
  const opciones = pregunta.opciones.map((o, i) => `${LETRAS[i].toUpperCase()}) ${o}`).join("\n");
  return `${cabecera}\n\n${pregunta.pregunta}\n${opciones}\n\n_Respondé con la letra, citando este mensaje o suelta en el chat. ${segundos} segundos y un solo intento por persona._`;
}

// Abre la ronda del grupo. alGanar(lid) y alVencer() pueden devolver un texto extra para el mensaje de cierre
// (premio, apuestas). Devuelve la ronda.
export function abrirRonda(chat, { tipo, pregunta, mensajeId, segundos, client, alGanar = null, alVencer = null }) {
  const ronda = { tipo, pregunta, mensajeId, intentos: new Set(), vence: Date.now() + segundos * 1000, alGanar, alVencer, timeout: null };
  ronda.timeout = setTimeout(() => {
    if (globalThis.rondasTrivia.get(chat) !== ronda) return;
    globalThis.rondasTrivia.delete(chat);
    client.sendMessage(chat, { text: pegar(`⏳ Nadie acertó. Era *${textoCorrecta(pregunta)}*.`, alVencer?.()) }).catch(console.error);
  }, segundos * 1000);
  globalThis.rondasTrivia.set(chat, ronda);
  recordar(chat, pregunta.pregunta);
  return ronda;
}

const pegar = (base, extra) => (extra ? `${base}${extra.startsWith("\n") ? "" : "\n"}${extra}` : base);

// Qué letra quiso decir: "c", "C)", "(c)", "opción c", "c) tokio" o el texto de la opción. null si no es una respuesta.
export function parsearRespuesta(texto, opciones) {
  const t = normalizar(texto);
  if (!t) return null;
  const letra = t.match(/^(?:opcion )?([abcd])(?: .+)?$/);
  if (letra) return letra[1];
  const i = opciones.findIndex((o) => normalizar(o) === t);
  return i >= 0 ? LETRAS[i] : null;
}

// Se llama en cada mensaje. Devuelve { reaccion, texto?, mentions? } si el mensaje era una respuesta a la ronda
// abierta del chat, y null si no había ronda o el mensaje no era una respuesta.
export function responderTrivia(m) {
  const ronda = rondaDe(m.chat);
  if (!ronda) return null;
  if (m.quoted?.id && m.quoted.id !== ronda.mensajeId) return null; // cita otra cosa, no es para la trivia
  const letra = parsearRespuesta(m.text, ronda.pregunta.opciones);
  if (!letra) return null;
  if (ronda.intentos.has(m.sender)) return { reaccion: "🙅" };
  ronda.intentos.add(m.sender);
  if (letra !== ronda.pregunta.correcta) return { reaccion: "❌" };
  clearTimeout(ronda.timeout);
  globalThis.rondasTrivia.delete(m.chat);
  const texto = pegar(`✅ ¡Acertó @${m.sender.split("@")[0]}! Era *${textoCorrecta(ronda.pregunta)}*.`, ronda.alGanar?.(m.sender));
  return { reaccion: "✅", texto, mentions: [m.sender] };
}

// Para los tests y para .trivia cuando el juego se corta de afuera.
export function cerrarRonda(chat) {
  const ronda = rondaDe(chat);
  if (!ronda) return false;
  clearTimeout(ronda.timeout);
  globalThis.rondasTrivia.delete(chat);
  return true;
}
