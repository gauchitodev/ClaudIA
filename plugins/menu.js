import { getChatBlacklist } from "../database-functions.js";
import { textoMenu } from "../lib/menu.js";

// .menu: a short index with what's used most in the group, .menu <tema> for one topic, and .menu todo for everything.
// The contents and the rules live in lib/menu.js.
const plugin = {};
plugin.cmd = ["menu", "menú", "help", "comandos", "ayuda"];

plugin.run = async (m, { client, usedPrefix, args = [], chat, isBotAdmin = true, isMod, isOwner }) => {
  const bloqueados = m.isGroup && chat?.blacklistMode ? new Set(getChatBlacklist(m.chat)) : new Set();
  const texto = textoMenu({ pedido: args.join(" "), usedPrefix, nombre: m.pushName, chatId: m.chat, isGroup: m.isGroup, datosChat: chat, isBotAdmin, isMod, isOwner, bloqueados });

  const kz = await client.sendMessage(m.chat, { text: texto }, { quoted: m });
  if (kz) client.sendMessage(m.chat, { react: { text: "📚", key: kz.key } });
};

export default plugin;
