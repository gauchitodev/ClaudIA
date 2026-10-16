import { textoParejas } from "../lib/parejas.js";
import { estaEnGrupo } from "../lib/identidad.js";

// .listaparejas: in a group, the couples with someone in it; in private, every couple the bot knows (lib/parejas.js).
const plugin = {};
plugin.cmd = ["listaparejas", "listadeparejas"];
plugin.botAdmin = true;

plugin.run = async (m, { client, participants }) => {
  await client.sendText(m.chat, textoParejas(m.isGroup ? estaEnGrupo(participants) : null), m);
};

export default plugin;
