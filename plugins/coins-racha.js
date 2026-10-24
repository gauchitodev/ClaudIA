import { textoRacha } from "../lib/actividad.js";
import { COINS } from "../lib/urucoins.js";
import { deQuienEs, noSeDeQuien } from "../lib/identidad.js";
import { nombreDe } from "../lib/menciones.js";

const plugin = {};
plugin.cmd = ["racha"];
plugin.economia = true;
plugin.onlyGroup = true;

// Your daily streak's state (this used to show up in .coins), or with .racha @persona (or replying to one of their
// messages) someone else's, named without tagging them, as .bal does.
plugin.run = async (m, { client, text, participants }) => {
  const lid = deQuienEs(client, m, text, participants);
  if (!lid) return client.sendText(m.chat, `🔥 ${noSeDeQuien("la racha", ".racha")}`, m);

  if (lid !== m.sender) {
    const nombre = nombreDe(lid);
    return client.sendText(m.chat, textoRacha(m.chat, lid, { esPropio: false, nombre }) || `🔥 ${nombre} no tiene racha todavía.`, m);
  }
  const texto = textoRacha(m.chat, m.sender) || `🔥 No tenés racha todavía. Escribí ${COINS.RACHA_MENSAJES_DIA} mensajes de dos palabras o más en el día y arrancás una; el premio sube con los días seguidos.`;
  await client.sendText(m.chat, texto, m);
};

export default plugin;
