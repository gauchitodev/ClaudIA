import { CMD, mesaDe, accion, levantarse, cancelar, textoMesa } from "../lib/poker.js";
import { leerEntero } from "../lib/comandos.js";
import { marcarMensajeDeJuego } from "../lib/mensajes-de-juego.js";

// The poker table's moves and exits (lib/poker.js): .paso, .pago (.igualo, .voy), .subo N, .allin, .novoy from the
// one whose turn it is; .levantarme to stand up with one's chips; .mesa to see the table; .delpoker for an admin to
// close it. Apart from .poker, and without the casino flag, as .rendirse and .del4enlinea are from their games: a hand
// that started before the casino closed is played out, and chips can always leave the table. No money comes in here.
const plugin = {};
plugin.cmd = [...CMD.paso, ...CMD.pago, ...CMD.subo, ...CMD.allin, ...CMD.novoy, ...CMD.levantarme, ...CMD.mesa, ...CMD.cancelar];
plugin.juego = true;
plugin.onlyGroup = true;

const TIPO = Object.fromEntries(["paso", "pago", "subo", "allin", "novoy"].flatMap((tipo) => CMD[tipo].map((nombre) => [nombre, tipo])));

async function mandar(client, m, texto, mentions = []) {
  const enviado = await client.sendMessage(m.chat, { text: texto, mentions }, { quoted: m });
  marcarMensajeDeJuego(enviado?.key?.id, m.chat, { juego: "poker" });
}

plugin.run = async (m, { client, command, args = [], isAdmin }) => {
  try {
    let r;
    if (CMD.mesa.includes(command)) {
      const mesa = mesaDe(m.chat);
      if (!mesa) return client.sendText(m.chat, `No hay mesa de póker en este grupo: .${CMD.poker[0]} 100 abre una.`, m);
      r = textoMesa(mesa);
    } else if (CMD.levantarme.includes(command)) {
      r = levantarse(m.chat, m.sender);
    } else if (CMD.cancelar.includes(command)) {
      // isAdmin counts the owner too (permisosDe, lib/roles.js)
      r = cancelar(m.chat, m.sender, isAdmin);
    } else {
      r = accion(m.chat, m.sender, TIPO[command], leerEntero(args[0] || ""));
    }
    if (r.reaccion) return m.react(r.reaccion); // not their turn: a reaction, not one more message in the group
    if (r.ok === false) return client.sendText(m.chat, r.error, m);
    return mandar(client, m, r.texto, r.mentions);
  } catch (e) {
    console.error("[poker] ERROR:", e);
  }
};

export default plugin;
