import { esperaCamino, elegirCamino } from "../lib/encargos.js";
import { escenaAbierta } from "../lib/escenas.js";
import { esComando } from "../lib/comandos.js";
import { citaOtroJuego } from "../lib/mensajes-de-juego.js";

// The answer to an urgent errand (lib/encargos.js): a plain "1", "2" or "3" from whoever has the group's open one
// and hasn't chosen their way yet. A number that was a move in another game stays that game's, and so does one from
// somebody with a payday scene open (lib/escenas.js, whose hook runs after this one): quoting the errand's message
// makes it an answer to the errand whatever else is going on.
const plugin = (m) => m;
plugin.before = async (m, { client, chat }) => {
  try {
    if (!m.isGroup || !m.message || m.fromMe || m.isBaileys || !m.text) return;
    const texto = m.text.trim();
    if (!/^[1-3]$/.test(texto) || esComando(m.text)) return;
    if (chat?.monedas === 0) return;
    const quien = [m.sender, m.senderJid].filter(Boolean);
    const abierto = esperaCamino(m.chat, quien);
    if (!abierto) return;
    const citaElEncargo = Boolean(m.quoted?.id) && m.quoted.id === abierto.mensaje_id;
    if (!citaElEncargo && (m.respuestaDeJuego || m.quoted?.id || citaOtroJuego(m, "encargo") || escenaAbierta(m.chat, m.sender))) return;
    // Theirs, so no other game reads it as an answer and Claudia doesn't chat back.
    m.respuestaDeJuego = true;
    const r = elegirCamino(m.chat, quien, Number(texto));
    if (!r) return;
    await client.sendText(m.chat, r.ok ? r.texto : `❌ ${r.error}`, m, r.mentions?.length ? { mentions: r.mentions } : {});
  } catch (e) {
    console.error("[encargos] ERROR:", e);
  }
};

export default plugin;
