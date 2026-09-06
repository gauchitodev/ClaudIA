import { registrarActividad } from "../lib/actividad.js";
import { responderPreguntaDelDia } from "../lib/pregunta-dia.js";

// Corre en cada mensaje de grupo: racha diaria y respuestas a la pregunta del día. Las trivias las lee _trivia.js.
const plugin = (m) => m;
plugin.before = async (m, { client }) => {
  try {
    if (!m.isGroup || !m.message || m.fromMe || m.isBaileys || !m.text) return;
    if (globalThis.prefix.some((p) => m.text.startsWith(p))) return; // los comandos no cuentan como charla

    const racha = registrarActividad(m.chat, m.sender, m.text);
    if (racha) m.react("🔥").catch(() => {});

    if (responderPreguntaDelDia(m)) m.react("🪙").catch(() => {});

  } catch (e) {
    console.error("[actividad] ERROR:", e);
  }
};

export default plugin;
