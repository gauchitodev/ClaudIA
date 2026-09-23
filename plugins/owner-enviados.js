import { textoEnviados } from "../lib/envios.js";

// .enviados: what the bot itself sent over the last week, by day, hour and kind. In a group, that group's; with
// "todo", or from a private chat, everywhere, with the groups that make it talk the most. Owner only: the general one
// lists every group. The mods see the bot's share of their group in .actividad.
const plugin = {};
plugin.cmd = ["enviados"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, args }) => {
  const general = !m.isGroup || /^(todo|todos|general)$/i.test(args[0] || "");
  const r = await textoEnviados(client, { chat: general ? null : m.chat });
  await client.sendText(m.chat, r.texto, m);
};

export default plugin;
