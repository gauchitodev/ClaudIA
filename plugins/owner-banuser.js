import { updateUser, esOwner } from "../database-functions.js";
import { destinatario } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["banuser", "unbanuser"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  // The mention may arrive as a LID or as a number: it's resolved to an id that exists before writing, because an
  // UPDATE against a row that isn't there used to pass as good.
  const { quien, lid, jid, mencionado } = destinatario(m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);
  if (lid === client.user.lid || jid === client.user.jid) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  // leave the bot's owners alone (this used to call getUser without importing it, so the command always blew up)
  if (esOwner(mencionado) || (lid && esOwner(lid)) || (jid && esOwner(jid))) return m.react("❌");
  if (!quien) return client.sendText(m.chat, "No tengo registro de esa persona todavía: que escriba algo y probá de nuevo.", m);

  if (!updateUser(quien, { banned: command === "banuser" })) return client.sendText(m.chat, "No pude guardar el cambio.", m);
  m.react("☑️");
};

export default plugin;
