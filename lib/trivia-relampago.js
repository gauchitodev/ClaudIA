// Trivia relámpago: en los grupos que la activaron (.triviarelampago), un par de veces por día y en horario al azar,
// Claudia tira una pregunta y el primero que acierta se lleva las monedas. La ronda en sí es la misma que la de
// .trivia (lib/trivia.js). Los horarios se agendan como pendientes, así sobreviven reinicios.
import { chatsConOpcion, periodoCerrado, marcarPeriodoCerrado, crearPendiente, ganarCoins } from "../database-functions.js";
import { COINS } from "./urucoins.js";
import { ACTIVIDAD, claveDia } from "./actividad.js";
import { generarPregunta, textoPregunta, abrirRonda, reservarRonda, liberarRonda } from "./trivia.js";

// Agenda las trivias del día (una vez por día por grupo), en momentos al azar dentro de la ventana horaria.
// "ahora" se puede pasar (los tests lo fijan a un mediodía) para no depender del reloj.
export function programarTriviasDelDia(ahora = new Date()) {
  if (ahora.getHours() < ACTIVIDAD.RELAMPAGO_DESDE) return 0;
  const hoy = claveDia(ahora);
  let agendadas = 0;
  for (const chat of chatsConOpcion("triviaRelampago")) {
    if (periodoCerrado(chat, "trivia_relampago_prog", hoy)) continue;
    marcarPeriodoCerrado(chat, "trivia_relampago_prog", hoy);
    const inicio = Math.max(ahora.getTime() + 60 * 1000, new Date(ahora).setHours(ACTIVIDAD.RELAMPAGO_DESDE, 0, 0, 0));
    const fin = new Date(ahora).setHours(ACTIVIDAD.RELAMPAGO_HASTA, 0, 0, 0);
    if (fin <= inicio) continue;
    for (let i = 0; i < ACTIVIDAD.RELAMPAGO_VECES; i++) {
      crearPendiente(chat, "bot", "trivia_relampago", {}, inicio + Math.floor(Math.random() * (fin - inicio)));
      agendadas++;
    }
  }
  return agendadas;
}

// La llama el procesador de pendientes a la hora agendada. Si ya hay una trivia abierta en el grupo, no pisa nada.
export async function lanzarTriviaRelampago(client, chat) {
  if (!reservarRonda(chat, "relampago")) return; // ya hay una trivia abierta o armándose en el grupo
  let pregunta;
  let enviado;
  try {
    pregunta = await generarPregunta(chat);
    enviado = await client.sendMessage(chat, { text: textoPregunta({ titulo: "⚡ *TRIVIA RELÁMPAGO*", premio: COINS.TRIVIA_RELAMPAGO, pregunta, segundos: ACTIVIDAD.RELAMPAGO_SEGUNDOS }) });
  } catch (e) {
    liberarRonda(chat);
    throw e;
  }
  abrirRonda(chat, {
    tipo: "relampago",
    pregunta,
    mensajeId: enviado?.key?.id,
    segundos: ACTIVIDAD.RELAMPAGO_SEGUNDOS,
    client,
    alGanar: (lid) => {
      ganarCoins(chat, lid, COINS.TRIVIA_RELAMPAGO, "trivia_relampago");
      return `🪙 +${COINS.TRIVIA_RELAMPAGO} UruCoins.`;
    },
  });
}
