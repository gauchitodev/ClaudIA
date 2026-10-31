import { identidadesDe } from "../lib/identidad.js";
import { impedimentoParaModerar } from "../lib/roles.js";

const plugin = {};
plugin.cmd = ["del"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, participants, isMod, isOwner, isWaAdmin }) => {
  if (!m.quoted) return client.sendText(m.chat, txt.deleteMessageNull, m);
  // m.quoted.sender usually arrives as @lid, so it's compared against both of the sender's formats.
  const esPropio = [m.sender, m.senderJid].includes(m.quoted.sender);
  if (!esPropio && !isMod && !isOwner) return client.sendText(m.chat, txt.deleteMessageOnlyMe, m);

  // Someone else's message, deleted with a bot role (moderator, bot admin), goes only from strictly above, like .kick
  // or .adv: a moderator used to delete a WhatsApp admin's or the owner's messages through the bot. WhatsApp admins and
  // the owner delete anything, as WhatsApp itself lets them, and Claudia's own messages are anyone's to clean up.
  if (!esPropio && !m.quoted.fromMe && !isOwner && !isWaAdmin) {
    const { lid, jid, participante } = identidadesDe(m.quoted.sender, participants);
    const impedimento = impedimentoParaModerar(m.chat, { lid: m.sender, esOwner: false, esAdminWhatsApp: false }, { lid, jid, esAdminWhatsApp: Boolean(participante?.admin) }, participants);
    if (impedimento) return client.sendText(m.chat, `No lo puedo borrar: ${impedimento}`, m);
  }

  m.quoted.delete();
  m.delete();
};

export default plugin;
