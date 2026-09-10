import { textoClimaDe } from "../lib/clima.js";

// .clima [ciudad] / .tiempo: clima de ahora y de mañana con Open-Meteo. Sin ciudad, Montevideo; con "ciudad, país"
// para desempatar homónimas.
const plugin = {};
plugin.cmd = ["clima", "tiempo"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text }) => {
  await client.sendPresenceUpdate?.("composing", m.chat);
  await client.sendText(m.chat, await textoClimaDe(text), m);
};

export default plugin;
