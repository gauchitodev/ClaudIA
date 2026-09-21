import { nombreDe } from "../lib/menciones.js";
import { elegirApellido, apellidoDe, FAMILIA } from "../lib/familia.js";

// .apellido Rodríguez: the couple picks a surname; both bear it and the children inherit it. With nothing, it shows yours.
const plugin = {};
plugin.cmd = ["apellido"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    const actual = apellidoDe(m.sender);
    return client.sendText(m.chat, actual ? `📜 Tu apellido es *${actual}*. Con .familia ves a los tuyos.` : `No tenés apellido. Un matrimonio elige el suyo con ${usedPrefix}${command} Rodríguez, y los hijos lo heredan.`, m);
  }
  const r = elegirApellido(m.sender, text);
  if (!r.ok) {
    if (r.motivo === "sinCasar") return client.sendText(m.chat, "El apellido lo elige un matrimonio. Casate primero (.casarse) y después elegís.", m);
    return client.sendText(m.chat, `Un apellido de 2 a ${FAMILIA.APELLIDO_MAX} letras, sin números ni símbolos. Ej: ${usedPrefix}${command} Rodríguez`, m);
  }
  await client.sendText(m.chat, `📜 Desde hoy son la familia *${r.apellido}*: ${nombreDe(m.sender)} y ${nombreDe(r.conyuge)}, y los hijos que tengan lo heredan.`, m);
};

export default plugin;
