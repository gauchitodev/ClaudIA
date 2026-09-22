import { textoActividad } from "../lib/actividad.js";

// .actividad: cuánto se habla en el grupo y a qué hora, de los últimos 7 días.
// Cuenta todos los mensajes, a diferencia de la racha (que pide charla de dos palabras o más).
const plugin = {};
plugin.cmd = ["actividad"];
plugin.onlyGroup = true;
plugin.onlyMod = true;

plugin.run = async (m, { client }) => {
  const r = textoActividad(m.chat);
  await client.sendText(m.chat, r.texto, m);
};

export default plugin;
