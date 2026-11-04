import { registrarActividad } from "../lib/actividad.js";
import { responderPreguntaDelDia } from "../lib/pregunta-dia.js";
import { esComando } from "../lib/comandos.js";

// Runs on every group message: the daily streak and answers to the question of the day. Trivia is read by _trivia.js.
const plugin = (m) => m;
plugin.before = async (m, { client }) => {
  try {
    if (!m.isGroup || !m.message || m.fromMe || m.isBaileys || !m.text) return;
    // Commands don't count as conversation; "...pero bueno" or "@Ana, ¿venís?" do (lib/comandos.js).
    if (esComando(m.text)) return;

    const racha = registrarActividad(m.chat, m.sender, m.text);
    if (racha) m.react("🔥").catch(() => {});

    if (responderPreguntaDelDia(m)) m.react("🪙").catch(() => {});

  } catch (e) {
    console.error("[actividad] ERROR:", e);
  }
};

export default plugin;
