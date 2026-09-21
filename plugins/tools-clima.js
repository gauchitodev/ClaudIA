import { textoClimaDe } from "../lib/clima.js";

// .clima [city] / .tiempo: current and next-day weather from Open-Meteo. With no city, Montevideo; with
// "city, country" to tell namesakes apart.
const plugin = {};
plugin.cmd = ["clima", "tiempo"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text }) => {
  await client.sendPresenceUpdate?.("composing", m.chat);
  await client.sendText(m.chat, await textoClimaDe(text), m);
};

export default plugin;
