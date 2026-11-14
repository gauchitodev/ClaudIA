// .juego: one game at a time, per group (lib/juegos-apagados.js). .juego mines off stops starting the mines here (a
// board already open is played out and cashed in: its moves and exits are other commands) and .juego mines on brings
// it back; without on or off it flips, as .juegos does; .juego alone says how each one is. For the group's admins and
// the bot's, like .horariojuegos: Claudia needn't be a WhatsApp admin to refuse her own games. .juegos and .casino
// still turn everything off at once, and .juegos mines off does what .juego mines off does (cambiarJuego).
import { JUEGOS, textoEstado, cambiarJuego } from "../lib/juegos-apagados.js";

const plugin = {};
plugin.cmd = ["juego"];
plugin.onlyGroup = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, args = [], usedPrefix = ".", chat }) => {
  try {
    if (!args.length) return await client.sendText(m.chat, textoEstado(chat, usedPrefix), m);
    if (["todos", "todo"].includes(String(args[0]).toLowerCase())) {
      return await client.sendText(m.chat, `Para todos de una: ${usedPrefix}juegos on u off, y el casino con ${usedPrefix}casino. ${usedPrefix}juego es para uno solo: ${usedPrefix}juego mines off.`, m);
    }
    const r = cambiarJuego(m.chat, chat, args, usedPrefix);
    const texto = r.ok ? r.texto : `🤔 No conozco ese juego: *${r.nombre.slice(0, 30)}*. Los que se apagan de a uno: ${JUEGOS.map((j) => j.clave).join(", ")}.`;
    return await client.sendText(m.chat, texto, m);
  } catch (e) {
    console.error("[juego] ERROR:", e);
  }
};

export default plugin;
