import { juegoTerminado, monedasActivas, COINS } from "../lib/urucoins.js";
import { generarPregunta, textoPregunta, abrirRonda, rondaDe, reservarRonda, liberarRonda, segundosRestantes, TRIVIA } from "../lib/trivia.js";

// .trivia: a question with options; the first correct answer wins. The answers are read by the _trivia.js hook.
const plugin = {};
plugin.cmd = ["trivia"];
plugin.juego = true;
plugin.botAdmin = true;

plugin.run = async (m, { client }) => {
  const abierta = rondaDe(m.chat);
  if (abierta) return client.sendText(m.chat, abierta.reservada ? "Ya se está armando una trivia, un segundo." : `Hay una trivia abierta, quedan ${segundosRestantes(abierta)} segundos. Respondé esa con la letra.`, m);

  // one trivia per group: the turn is reserved before asking the AI for the question, which takes a while
  const reserva = reservarRonda(m.chat, "trivia");
  try {
    const pregunta = await generarPregunta(m.chat);
    const premio = monedasActivas(m.chat) ? COINS.JUEGO_GANADO : 0;
    const enviado = await client.sendText(m.chat, textoPregunta({ titulo: "🎓 *Trivia*", premio, pregunta, segundos: TRIVIA.SEGUNDOS }), m);
    abrirRonda(m.chat, {
      reserva,
      tipo: "trivia",
      pregunta,
      mensajeId: enviado?.key?.id,
      segundos: TRIVIA.SEGUNDOS,
      client,
      alGanar: (lid) => juegoTerminado(m.chat, lid, { nombre: "trivia" }),
      alVencer: () => juegoTerminado(m.chat, null, { nombre: "trivia" }),
    });
  } catch (e) {
    liberarRonda(m.chat, reserva);
    throw e;
  }
};

export default plugin;
