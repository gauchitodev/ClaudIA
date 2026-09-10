import { definir } from "../lib/rae.js";

// .rae <palabra o expresión>: definiciones del diccionario de la RAE.
const plugin = {};
plugin.cmd = ["definición", "rae", "definicion"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  if (!text?.trim()) return client.sendText(m.chat, `¿Qué palabra? Ejemplo: ${usedPrefix}${command} chivito, o una expresión: ${usedPrefix}${command} mal de ojo`, m);
  await client.sendPresenceUpdate?.("composing", m.chat);
  await client.sendText(m.chat, await definir(text), m);
};

export default plugin;
