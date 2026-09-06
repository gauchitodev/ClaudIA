import { elegirAlAzar } from "../lib/azar.js";

const plugin = {};
plugin.cmd = ["formarpareja"];
plugin.juego = true;
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, groupMetadata, chat }) => {
  const ps = groupMetadata.participants.map((v) => v.id);
  const a = elegirAlAzar(ps);
  const b = elegirAlAzar(ps);
  client.sendText(m.chat, txt.formarParejaMsg(a, b), m);
};

export default plugin;
