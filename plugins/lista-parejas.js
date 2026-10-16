import { textoParejas } from "../lib/parejas.js";
import { estaEnGrupo } from "../lib/identidad.js";

// .listaparejas: in a group, the couples with someone in it; in private, every couple the bot knows (lib/parejas.js),
// only for the owner: anyone writing to her used to get the couples of every group.
const plugin = {};
plugin.cmd = ["listaparejas", "listadeparejas"];
plugin.botAdmin = true;

plugin.run = async (m, { client, participants, isOwner }) => {
  if (!m.isGroup && !isOwner) return client.sendText(m.chat, "La lista de parejas se pide en el grupo: escribí .listaparejas allá.", m);
  await client.sendText(m.chat, textoParejas(m.isGroup ? estaEnGrupo(participants) : null), m);
};

export default plugin;
