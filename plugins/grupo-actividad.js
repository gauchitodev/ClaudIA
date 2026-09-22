import { textoActividad } from "../lib/actividad.js";

// .actividad: how much the group talks and at what time, over the last 7 days.
// It counts every message, unlike the streak (which asks for conversation of two words or more).
const plugin = {};
plugin.cmd = ["actividad"];
plugin.onlyGroup = true;
plugin.onlyMod = true;

plugin.run = async (m, { client }) => {
  const r = textoActividad(m.chat);
  await client.sendText(m.chat, r.texto, m);
};

export default plugin;
