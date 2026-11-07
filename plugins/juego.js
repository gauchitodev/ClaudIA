// .juego: one game at a time, per group (lib/juegos-apagados.js). .juego mines off stops starting the mines here (a
// board already open is played out and cashed in: its moves and exits are other commands) and .juego mines on brings
// it back; without on or off it flips, as .juegos does; .juego alone says how each one is. For the group's admins and
// the bot's, like .horariojuegos: Claudia needn't be a WhatsApp admin to refuse her own games. .juegos and .casino
// still turn everything off at once.
import { JUEGOS, juegoDe, apagadosDe, apagar, prender, textoEstado, avisoGenerales } from "../lib/juegos-apagados.js";
import { leerInterruptor } from "../lib/comandos.js";

const plugin = {};
plugin.cmd = ["juego"];
plugin.onlyGroup = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, args = [], usedPrefix = ".", chat }) => {
  try {
    if (!args.length) return await client.sendText(m.chat, textoEstado(chat, usedPrefix), m);
    const palabras = args.map((a) => String(a).toLowerCase());
    if (["todos", "todo"].includes(palabras[0])) {
      return await client.sendText(m.chat, `Para todos de una: ${usedPrefix}juegos on u off, y el casino con ${usedPrefix}casino. ${usedPrefix}juego es para uno solo: ${usedPrefix}juego mines off.`, m);
    }

    // The last word may be on or off; the rest is the game, as people write it ("4 en linea off").
    const estado = leerInterruptor(palabras.at(-1));
    const nombre = (estado === null ? palabras : palabras.slice(0, -1)).join(" ");
    const juego = juegoDe(nombre);
    if (!juego) {
      // ".juego mines xyz": the game is there, the word isn't one of the switch's.
      const sinUltima = palabras.length > 1 ? juegoDe(palabras.slice(0, -1).join(" ")) : null;
      if (sinUltima) return await client.sendText(m.chat, `Usá ${usedPrefix}juego ${sinUltima.clave} on o ${usedPrefix}juego ${sinUltima.clave} off (sin nada, lo invierte).`, m);
      return await client.sendText(m.chat, `🤔 No conozco ese juego: *${nombre.slice(0, 30)}*. Los que se apagan de a uno: ${JUEGOS.map((j) => j.clave).join(", ")}.`, m);
    }

    const estaba = apagadosDe(chat).includes(juego.clave);
    const apagarlo = estado === null ? !estaba : !estado;
    const r = apagarlo ? apagar(m.chat, juego.clave) : prender(m.chat, juego.clave);
    if (!r.ok) return await client.sendText(m.chat, `❌ ${r.error}`, m);
    const ya = r.cambio ? "" : " (ya estaba así)";
    const aviso = avisoGenerales(chat, juego, usedPrefix);
    const texto = apagarlo
      ? `⛔ Listo: apagué ${juego.nombre} en este grupo${ya}. Hasta que alguien escriba ${usedPrefix}juego ${juego.clave} on no se empieza más; lo que ya iba se termina.`
      : `✅ Listo: prendí ${juego.nombre} de nuevo en este grupo${ya}.`;
    return await client.sendText(m.chat, `${texto}${aviso ? `\n\n${aviso}` : ""}`, m);
  } catch (e) {
    console.error("[juego] ERROR:", e);
  }
};

export default plugin;
