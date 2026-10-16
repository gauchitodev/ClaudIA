import { textoUsos } from "../lib/usos.js";

// .usos: the commands people use most, over the last 30 days (lib/usos.js). In a group, that group's; in private, where
// only the owner gets past onlyMod, every chat together. It's what the menu's "lo más usado" is built from, and what
// tells which commands nobody uses.
const plugin = {};
plugin.cmd = ["usos"];
plugin.onlyMod = true;

plugin.run = async (m, { client }) => {
  const { texto, mentions } = await textoUsos(client, { chat: m.isGroup ? m.chat : null });
  await client.sendText(m.chat, texto, m, { mentions });
};

export default plugin;
