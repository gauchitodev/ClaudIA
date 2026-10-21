import { advertidos, MAX_ADVERTENCIAS, getUser } from "../database-functions.js";
import { nombreDe } from "../lib/menciones.js";

const plugin = {};
plugin.cmd = ["listaadv", "listaadvertidos", "advertidos"];
plugin.onlyOwner = true;

plugin.run = async (m, { client }) => {
  // In a group, that group's warnings; from a private chat, everyone's, with the group's name.
  const lista = advertidos(m.isGroup ? m.chat : null);
  if (!lista.length) return client.sendText(m.chat, "⚠️ No hay nadie con advertencias.", m);

  // They're named without being tagged: a list of warned people has no business notifying each of them. In the owner's
  // private chat, someone without a name shows their number, or failing that their LID, since "alguien" wouldn't say
  // who; in a group the whole group reads the list, and there it stays "alguien" (.id tells the owner who it is).
  const quien = (lid) => {
    const u = getUser(lid);
    if (m.isGroup || (u?.apodo || u?.pushName || "").trim()) return nombreDe(lid);
    return u?.jid ? `+${u.jid.split("@")[0]}` : lid.split("@")[0];
  };
  const lineas = lista.map((u) => `│ ${quien(u.lid)} *(${u.warn}/${MAX_ADVERTENCIAS})*${m.isGroup ? "" : ` · ${client.chats?.[u.chat]?.subject || u.chat}`}`);

  await client.sendText(m.chat, `⚠️ \`USUARIOS ADVERTIDOS\` ⚠️\n\n│ *Total : ${lista.length}*\n│ - - - - - - - - -\n${lineas.join("\n")}`, m);
};

export default plugin;
