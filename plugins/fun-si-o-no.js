import { elegirAlAzar } from "../lib/azar.js";

const plugin = {};
plugin.cmd = ["siono"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text }) => {
  if (!text) return client.sendText(m.chat, txt.sionoNull, m);
  const emoji = elegirAlAzar(["✅", "❌"]);
  m.react(emoji);
};

export default plugin;
