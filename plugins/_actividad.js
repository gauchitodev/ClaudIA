import { registrarActividad } from "../lib/actividad.js";
import { responderPreguntaDelDia } from "../lib/pregunta-dia.js";
import { responderRelampago } from "../lib/trivia-relampago.js";

// Corre en cada mensaje de grupo: racha diaria, respuestas a la pregunta del día y a la trivia relámpago.
const plugin = (m) => m;
plugin.before = async (m, { client }) => {
  try {
    if (!m.isGroup || !m.message || m.fromMe || m.isBaileys || !m.text) return;
    if (globalThis.prefix.some((p) => m.text.startsWith(p))) return; // los comandos no cuentan como charla

    const racha = registrarActividad(m.chat, m.sender, m.text);
    if (racha) m.react("🔥").catch(() => {});

    if (responderPreguntaDelDia(m)) m.react("🪙").catch(() => {});

    const r = responderRelampago(m);
    if (r) {
      if (r.reaccion) m.react(r.reaccion).catch(() => {});
      if (r.texto) await client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m });
    }
  } catch (e) {
    console.error("[actividad] ERROR:", e);
  }
};

export default plugin;
