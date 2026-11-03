import { pausa } from "../lib/pausas.js";

const plugin = {};
plugin.cmd = ["leave"];
plugin.onlyGroup = true;
plugin.onlyOwner = true;

plugin.run = async (m, { client }) => {
  if (!m.isGroup) return client.sendText(m.chat, "No es un grupo", m);
  await client.sendText(m.chat, txt.leaveGroup, null);
  await pausa(2000);
  await client.groupLeave(m.chat);
};

export default plugin;
