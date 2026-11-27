import { servicioDe, elegirServicio } from "../lib/servicios.js";
import { escenaAbierta } from "../lib/escenas.js";
import { esperaCamino } from "../lib/encargos.js";
import { esComando } from "../lib/comandos.js";

// The pick of a service between players (lib/servicios.js): a plain "1" to "4" from whoever has the options in front
// of them. It runs after the errands' and the scenes' hooks: a number another game took, one that quotes a message,
// or one from somebody with a scene or an errand waiting for their answer stays theirs (.servicio 2 always works).
const plugin = (m) => m;
plugin.before = async (m, { client, chat }) => {
  try {
    if (!m.isGroup || !m.message || m.fromMe || m.isBaileys || !m.text) return;
    const texto = m.text.trim();
    if (!/^[1-4]$/.test(texto) || esComando(m.text)) return;
    if (chat?.monedas === 0 || m.respuestaDeJuego || m.quoted?.id) return;
    const s = servicioDe(m.chat, m.sender);
    if (!s || s.estado !== "opciones" || Number(texto) > s.opciones.length) return;
    if (escenaAbierta(m.chat, m.sender) || esperaCamino(m.chat, [m.sender, m.senderJid].filter(Boolean))) return;
    m.respuestaDeJuego = true;
    const r = elegirServicio(m.chat, m.sender, Number(texto));
    await client.sendText(m.chat, r.ok ? r.texto : `❌ ${r.error}`, m, r.mentions?.length ? { mentions: r.mentions } : {});
  } catch (e) {
    console.error("[servicios] ERROR:", e);
  }
};

export default plugin;
