import { advertidos, MAX_ADVERTENCIAS } from "../database-functions.js";
import { nombreDe } from "../lib/menciones.js";

const plugin = {};
plugin.cmd = ["listaadv", "listaadvertidos", "advertidos"];
plugin.onlyOwner = true;

plugin.run = async (m, { client }) => {
  // In a group, that group's warnings; from a private chat, everyone's, with the group's name.
  const lista = advertidos(m.isGroup ? m.chat : null);
  if (!lista.length) return client.sendText(m.chat, "⚠️ No hay nadie con advertencias.", m);

  // They're named without being tagged: a list of warned people has no business notifying each of them.
  const lineas = lista.map((u) => `│ ${nombreDe(u.lid)} *(${u.warn}/${MAX_ADVERTENCIAS})*${m.isGroup ? "" : ` · ${client.chats?.[u.chat]?.subject || u.chat}`}`);

  await client.sendText(m.chat, `⚠️ \`USUARIOS ADVERTIDOS\` ⚠️\n\n│ *Total : ${lista.length}*\n│ - - - - - - - - -\n${lineas.join("\n")}`, m);
};

export default plugin;
