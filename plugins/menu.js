import { textoMenu, bloqueadosEn } from "../lib/menu.js";

// .menu: a short index with what's used most in the group, .menu <tema> for one topic, and .menu todo for everything;
// a word that isn't a topic gets the commands like it, as .buscarcomando. The contents and the rules live in
// lib/menu.js.
const plugin = {};
plugin.cmd = ["menu", "help", "comandos", "ayuda"];

plugin.run = async (m, { client, usedPrefix, args = [], chat, isBotAdmin = true, isMod, isAdmin, isOwner }) => {
  const bloqueados = bloqueadosEn(m.chat, { isGroup: m.isGroup, datosChat: chat });
  const texto = textoMenu({ pedido: args.join(" "), usedPrefix, nombre: m.pushName, chatId: m.chat, isGroup: m.isGroup, datosChat: chat, isBotAdmin, isMod, isAdmin, isOwner, bloqueados });

  const kz = await client.sendMessage(m.chat, { text: texto }, { quoted: m });
  if (kz) client.sendMessage(m.chat, { react: { text: "📚", key: kz.key } });
};

export default plugin;
