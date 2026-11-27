import { escenaAbierta, elegirEnEscena } from "../lib/escenas.js";
import { esComando } from "../lib/comandos.js";
import { citaOtroJuego } from "../lib/mensajes-de-juego.js";

// The answer to a payday scene (lib/escenas.js): a plain "1", "2" or "3" from whoever has one open in the group. It
// runs after the games played with plain messages (plugin.jugadas), so a number that was a move of theirs stays
// theirs; quoting the scene's message makes it an answer to the scene whatever else is going on.
const plugin = (m) => m;
plugin.before = async (m, { client, chat }) => {
  try {
    if (!m.isGroup || !m.message || m.fromMe || m.isBaileys || !m.text) return;
    const texto = m.text.trim();
    if (!/^[1-3]$/.test(texto) || esComando(m.text)) return;
    if (chat?.monedas === 0) return;
    const abierta = escenaAbierta(m.chat, m.sender);
    if (!abierta) return;
    const citaLaEscena = Boolean(m.quoted?.id) && m.quoted.id === abierta.mensaje_id;
    // Another game took it, or it quotes some other message: not this scene's.
    if (!citaLaEscena && (m.respuestaDeJuego || m.quoted?.id || citaOtroJuego(m, "escena"))) return;
    // Theirs, so no other game reads it as an answer and Claudia doesn't chat back.
    m.respuestaDeJuego = true;
    const r = elegirEnEscena(m.chat, m.sender, Number(texto));
    if (!r) return;
    await client.sendText(m.chat, r.ok ? r.texto : `❌ ${r.error}`, m);
  } catch (e) {
    console.error("[escenas] ERROR:", e);
  }
};

export default plugin;
