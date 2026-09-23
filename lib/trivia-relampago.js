// Lightning trivia: in the groups that switched it on (.triviarelampago), a couple of times a day at random hours,
// Claudia drops a question and the first to get it right takes the coins. The round itself is the same one .trivia
// uses (lib/trivia.js). The times are scheduled as pending work, so they survive restarts.
import { chatsConOpcion, periodoCerrado, marcarPeriodoCerrado, crearPendiente, ganarCoins, totalMensajesEntre } from "../database-functions.js";
import { COINS } from "./urucoins.js";
import { ACTIVIDAD, claveDia } from "./actividad.js";
import { generarPregunta, textoPregunta, abrirRonda, reservarRonda, liberarRonda } from "./trivia.js";

// Schedules the day's trivias (once a day per group), at random moments inside the time window.
// "ahora" can be passed in (the tests pin it to midday) so it doesn't depend on the clock.
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
    // It doesn't fire every day, nor always the same number of times: each one is rolled for, and only in groups
    // that had activity yesterday. That way it feels like something that happens, not a clock.
    const ayer = new Date(ahora);
    ayer.setDate(ayer.getDate() - 1);
    if (totalMensajesEntre(chat, [claveDia(ayer)]) < ACTIVIDAD.RELAMPAGO_MENSAJES_MINIMOS) continue;

    for (let i = 0; i < ACTIVIDAD.RELAMPAGO_VECES; i++) {
      if (Math.random() > ACTIVIDAD.RELAMPAGO_PROBABILIDAD) continue;
      crearPendiente(chat, "bot", "trivia_relampago", {}, inicio + Math.floor(Math.random() * (fin - inicio)));
      agendadas++;
    }
  }
  return agendadas;
}

// Called by the pending-work processor at the scheduled time. If a trivia is already open in the group, it leaves it alone.
export async function lanzarTriviaRelampago(client, chat) {
  const reserva = reservarRonda(chat, "relampago");
  if (!reserva) return; // a trivia is already open or being set up in the group
  let pregunta;
  let enviado;
  try {
    pregunta = await generarPregunta(chat);
    enviado = await client.sendMessage(chat, { text: textoPregunta({ titulo: "⚡ *TRIVIA RELÁMPAGO*", premio: COINS.TRIVIA_RELAMPAGO, pregunta, segundos: ACTIVIDAD.RELAMPAGO_SEGUNDOS }) });
  } catch (e) {
    liberarRonda(chat, reserva);
    throw e;
  }
  abrirRonda(chat, {
    reserva,
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
