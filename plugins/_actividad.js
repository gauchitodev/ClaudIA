import { registrarActividad } from "../lib/actividad.js";
import { responderPreguntaDelDia } from "../lib/pregunta-dia.js";
import { esComando } from "../lib/comandos.js";
import { monedasActivas } from "../lib/urucoins.js";

// Runs on every group message: the daily streak and answers to the question of the day. Trivia is read by _trivia.js.
const plugin = (m) => m;
plugin.before = async (m, { client }) => {
  try {
    if (!m.isGroup || !m.message || m.fromMe || m.isBaileys || !m.text) return;
    // Commands don't count as conversation; "...pero bueno" or "@Ana, ¿venís?" do (lib/comandos.js).
    if (esComando(m.text)) return;

    const racha = registrarActividad(m.chat, m.sender, m.text);
    // With the economy off (.monedas, .modo compraventa) the streak is still counted, quietly: it pays nothing and
    // .racha doesn't run, and its 🔥 was one more reaction from Claudia each day for each regular of a buy-and-sell group.
    if (racha && monedasActivas(m.chat)) m.react("🔥").catch(() => {});

    if (responderPreguntaDelDia(m)) m.react("🪙").catch(() => {});

  } catch (e) {
    console.error("[actividad] ERROR:", e);
  }
};

export default plugin;
