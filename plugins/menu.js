import { getChatBlacklist } from "../database-functions.js";
import { textoMenu } from "../lib/menu.js";

// .menu: a short index with what's used most in the group, .menu <tema> for one topic, and .menu todo for everything.
// The contents and the rules live in lib/menu.js.
const plugin = {};
plugin.cmd = ["menu", "menú", "help", "comandos", "ayuda", "menuuru", "juegosuru"];

// .menuuru and .juegosuru were the economy's menu, written apart by hand: they're .menu uru now, its two topics.
const MENU_URU = new Set(["menuuru", "juegosuru"]);

plugin.run = async (m, { client, usedPrefix, command, args = [], chat, isBotAdmin = true, isMod, isOwner }) => {
  const bloqueados = m.isGroup && chat?.blacklistMode ? new Set(getChatBlacklist(m.chat)) : new Set();
  const pedido = MENU_URU.has(String(command || "").toLowerCase()) ? "uru" : args.join(" ");
  const texto = textoMenu({ pedido, usedPrefix, nombre: m.pushName, chatId: m.chat, isGroup: m.isGroup, datosChat: chat, isBotAdmin, isMod, isOwner, bloqueados });

  const kz = await client.sendMessage(m.chat, { text: texto }, { quoted: m });
  if (kz) client.sendMessage(m.chat, { react: { text: "📚", key: kz.key } });
};

export default plugin;
