import { updateUserInGroup, esOwner } from "../database-functions.js";
import { destinatario } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["silenciar", "mute", "desilenciar", "unmute", "silencio", "hacesilencio"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  // Igual que el resto de la moderación: se resuelve la identidad antes de escribir, y el silencio es de este grupo.
  const { quien, lid, jid, mencionado } = destinatario(m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);
  if (lid === client.user.lid || jid === client.user.jid) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  // no afectar a owners del bot
  if (esOwner(mencionado) || (lid && esOwner(lid)) || (jid && esOwner(jid))) return m.react("❌");
  if (!quien) return client.sendText(m.chat, "No existen datos del usuario, puede que aun no haya enviado mensajes", m);

  const silenciar = !(command === "desilenciar" || command === "unmute");
  if (!updateUserInGroup(quien, m.chat, { mute: silenciar })) return client.sendText(m.chat, "No pude guardar el cambio.", m);
  m.react("☑️");
};

export default plugin;
