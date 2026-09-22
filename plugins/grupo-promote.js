import { destinatario, cambiarParticipante } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["p", "promote"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants, isOwner, isWaAdmin }) => {
  // Making someone a WhatsApp admin is for WhatsApp admins. A bot admin sits below them (lib/roles.js), and with this
  // open they could promote themselves and step out of the hierarchy altogether.
  if (!isWaAdmin && !isOwner) return client.sendText(m.chat, "Dar admin de WhatsApp es cosa de los admins de WhatsApp: los admins del bot no pueden.", m);
  const { objetivo, mencionado, participante } = destinatario(m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  // Using the id the group lists the person under, and checking what WhatsApp answers.
  const { ok, status } = await cambiarParticipante(client, m.chat, participante?.id || objetivo, "promote");
  if (!ok) return client.sendText(m.chat, `No pude darle admin (error ${status}).`, m);
};

export default plugin;
