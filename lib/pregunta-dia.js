// Pregunta del día: en los grupos que la activaron (.preguntadeldia), a partir de las HORA_PREGUNTA Claudia manda una
// pregunta liviana para arrancar charla, generada por la IA sobre un tema al azar (con una lista fija de respaldo).
// Responder a ese mensaje da unas monedas, una vez por persona por día.
import { chatsConOpcion, guardarPreguntaDia, preguntaDiaDe, ultimasPreguntasDia, ganarCoins, coinsGanadasHoy } from "../database-functions.js";
import { preguntarIA } from "./ia.js";
import { COINS } from "./urucoins.js";
import { ACTIVIDAD, claveDia, mensajeCuenta } from "./actividad.js";
import { elegirAlAzar } from "./azar.js";

const TEMAS = ["comida", "música", "la infancia", "viajes", "series y películas", "fútbol", "manías raras", "tecnología", "el grupo mismo", "planes del finde", "cosas que odian", "cosas que amaban de chicos", "trabajo o estudio", "mascotas", "situaciones incómodas", "opiniones polémicas pero livianas", "dilemas absurdos", "recuerdos del liceo", "lo mejor de la semana", "hipotéticos", "el clima y el mate", "Uruguay"];

const FIJAS = [
  "¿Qué fue lo mejor que les pasó esta semana?",
  "¿Cuál es la peor comida que probaron en su vida?",
  "Si pudieran vivir un año en cualquier ciudad del mundo, ¿cuál eligen?",
  "¿Qué canción no pueden dejar de escuchar últimamente?",
  "¿Cuál fue su primer trabajo y qué recuerdan de ese día?",
  "¿Qué serie recomendarían a ojos cerrados?",
  "¿Cuál es la manía más rara que tienen?",
  "Si tuvieran que comer una sola cosa por un mes, ¿qué sería?",
  "¿Qué juguete o juego de la infancia les gustaría volver a tener?",
  "¿Qué lugar de Uruguay le recomendarían a alguien que viene por primera vez?",
  "¿Cuál es el mejor consejo que les dieron alguna vez?",
  "¿Qué habilidad les gustaría aprender este año?",
  "¿Cuál es el plan perfecto para un domingo de lluvia?",
  "¿Qué película los hizo llorar, aunque no lo admitan?",
  "¿Cuál fue el peor corte de pelo que tuvieron?",
  "¿Qué comida de la abuela extrañan más?",
  "¿Team playa o team campo?",
  "¿Cuál es el gasto más inútil que hicieron y no se arrepienten?",
  "¿Qué apodo tuvieron de chicos?",
  "Si el grupo tuviera un himno, ¿cuál sería?",
  "¿Qué cosa hacían de chicos que hoy les parece una locura?",
  "¿Cuál es su superpoder inútil?",
  "¿Qué le dirían a su yo de hace diez años?",
  "¿Cuál es la mejor pizza de la ciudad y por qué esa?",
  "¿Qué costumbre uruguaya les parece rarísima si la piensan un poco?",
];

const ESQUEMA = { type: "object", properties: { pregunta: { type: "string" } }, required: ["pregunta"] };

async function generarPregunta(chat) {
  const previas = ultimasPreguntasDia(chat, 10);
  if (globalThis.geminiApiKey) {
    const tema = elegirAlAzar(TEMAS);
    const r = await preguntarIA(
      `Proponé UNA pregunta corta y liviana para arrancar charla en el grupo, sobre "${tema}". Que cualquiera pueda contestar en una frase, sin ser íntima ni incómoda, con tu onda. ${previas.length ? `No repitas ni parafrasees estas que ya se hicieron: ${previas.map((p) => `"${p}"`).join(", ")}. ` : ""}(Devolvé solo el campo "pregunta".)`,
      { schema: ESQUEMA },
    ).catch(() => ({ ok: false }));
    if (r.ok) {
      try {
        const p = String(JSON.parse(r.texto).pregunta || "").trim();
        if (p.length > 5 && p.length < 300) return p;
      } catch {}
    }
  }
  const disponibles = FIJAS.filter((p) => !previas.includes(p));
  const lista = disponibles.length ? disponibles : FIJAS;
  return elegirAlAzar(lista);
}

// Corre cada 5 minutos desde tareas-programadas.js
export async function chequearPreguntaDelDia() {
  if (new Date().getHours() < ACTIVIDAD.HORA_PREGUNTA) return;
  const hoy = claveDia();
  for (const chat of chatsConOpcion("preguntaDia")) {
    if (preguntaDiaDe(chat, hoy)) continue;
    guardarPreguntaDia(chat, hoy, "", null); // se marca antes de generar, así no sale dos veces si la IA tarda
    try {
      const pregunta = await generarPregunta(chat);
      const enviado = await globalThis.client.sendMessage(chat, { text: `💬 *Pregunta del día*\n\n${pregunta}\n\n_Respondé a este mensaje y te llevás ${COINS.PREGUNTA_DIA} UruCoins._` });
      guardarPreguntaDia(chat, hoy, pregunta, enviado?.key?.id || null);
    } catch (e) {
      console.error("[pregunta del día]", e.message);
    }
  }
}

// Se llama en cada mensaje. Si es una respuesta (citando) a la pregunta de hoy, premia una vez por persona.
export function responderPreguntaDelDia(m) {
  if (!m.quoted?.id || !mensajeCuenta(m.text)) return null;
  const p = preguntaDiaDe(m.chat, claveDia());
  if (!p?.messageId || p.messageId !== m.quoted.id) return null;
  if (coinsGanadasHoy(m.chat, m.sender, "pregunta_dia") > 0) return null;
  ganarCoins(m.chat, m.sender, COINS.PREGUNTA_DIA, "pregunta_dia");
  return { premio: COINS.PREGUNTA_DIA };
}
