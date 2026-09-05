import { textoRacha } from "../lib/actividad.js";
import { COINS } from "../lib/urucoins.js";

let plugin = {};
plugin.cmd = ["racha"];
plugin.economia = true;
plugin.onlyGroup = true;

// Estado de tu racha diaria (antes salía en .coins).
plugin.run = async (m, { client }) => {
  const texto = textoRacha(m.chat, m.sender) || `🔥 No tenés racha todavía. Escribí ${COINS.RACHA_MENSAJES_DIA} mensajes de dos palabras o más en el día y arrancás una; el premio sube con los días seguidos.`;
  await client.sendText(m.chat, texto, m);
};

export default plugin;
