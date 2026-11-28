import { textoEnviados } from "../lib/envios.js";

// .enviados: what the bot itself sent over the last week, by day, hour and kind. In a group, that group's: for its
// admins, WhatsApp's and the bot's. With "todo", or from a private chat, everywhere, with the groups that make it talk
// the most: that one names the other groups, so it's the owner's alone, and an admin who asks for it is told so. The
// mods see the bot's share of their group in .actividad.
const plugin = {};
plugin.cmd = ["enviados"];
plugin.onlyAdmin = true;
plugin.conElBotApagado = true; // handle-message.js lets it through with the bot switched off (.claudia off)

plugin.run = async (m, { client, args, isOwner }) => {
  const general = !m.isGroup || /^(todo|todos|general)$/i.test(args[0] || "");
  if (general && !isOwner) return client.sendText(m.chat, "🤖 Lo de todos los grupos juntos es solo para el owner. Lo que mandé en un grupo lo ven sus admins ahí, con .enviados.", m);
  const r = await textoEnviados(client, { chat: general ? null : m.chat });
  await client.sendText(m.chat, r.texto, m);
};

export default plugin;
