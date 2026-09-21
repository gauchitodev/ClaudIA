import { updateUser, esOwner } from "../database-functions.js";
import { destinatario } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["banuser", "unbanuser"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  // La mención puede llegar como LID o como número: se resuelve a un id que exista antes de escribir, porque un
  // UPDATE contra una fila que no existe se daba por bueno.
  const { quien, lid, jid, mencionado } = destinatario(m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);
  if (lid === client.user.lid || jid === client.user.jid) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  // no afectar a owners del bot (antes esto usaba getUser sin importarlo y el comando explotaba siempre)
  if (esOwner(mencionado) || (lid && esOwner(lid)) || (jid && esOwner(jid))) return m.react("❌");
  if (!quien) return client.sendText(m.chat, "No tengo registro de esa persona todavía: que escriba algo y probá de nuevo.", m);

  if (!updateUser(quien, { banned: command === "banuser" })) return client.sendText(m.chat, "No pude guardar el cambio.", m);
  m.react("☑️");
};

export default plugin;
