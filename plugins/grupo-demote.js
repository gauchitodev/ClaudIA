import { esOwner } from "../database-functions.js";
import { destinatario, cambiarParticipante } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["d", "demote"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants, isOwner, isWaAdmin }) => {
  // Same as .promote: taking WhatsApp admin away is for WhatsApp admins, never for a bot admin, who sits below them.
  if (!isWaAdmin && !isOwner) return client.sendText(m.chat, "Sacar admin de WhatsApp es cosa de los admins de WhatsApp: los admins del bot no pueden.", m);
  const { objetivo, mencionado, lid, jid, participante } = destinatario(m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);
  if (lid === client.user.lid || jid === client.user.jid) return client.sendText(m.chat, "Si me sacás el admin dejo de funcionar, así que no 😌", m);
  if (esOwner(mencionado) || (lid && esOwner(lid)) || (jid && esOwner(jid))) return client.sendText(m.chat, "A los dueños del bot no les toco el admin.", m);

  const { ok, status } = await cambiarParticipante(client, m.chat, participante?.id || objetivo, "demote");
  if (!ok) return client.sendText(m.chat, `No pude sacarle el admin (error ${status}).`, m);
};

export default plugin;
