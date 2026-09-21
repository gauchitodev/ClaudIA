import { elegirAlAzar } from "../lib/azar.js";

const plugin = (m) => m;
plugin.before = async (m, { client, isOwner, isMod, user, chat }) => {
  if (!m.isGroup) return;

  if (m.mtype === "liveLocationMessage" && !isMod && !isOwner) {
    await m.delete();
    return;
  }

  if (m.mentionedJid && m.mentionedJid.length >= 10 && !isOwner && !isMod) {
    m.delete();
    client.sendText(m.chat, `Ponete a hacer algo productivo y dejate de joder @${m.sender.split("@")[0]} 🤨`, m, { mentions: [m.sender] });
  }

  if (/^(dame admin|denme admin|quiero admin|haganme admin|quiero ser admin|háganme admin|haceme admin|ponganme de admin|merezco ser admin|me das admin|admin quiero)$/i.test(m.text)) {
    const teks = elegirAlAzar([`No.`, `Jajaja no.`, `Acá no se reparte admin, dejá.`, `Pedir admin no suma puntos, eh.`, `No va a pasar, pero me gusta el entusiasmo.`, `Seguí participando 😌`]);
    client.sendText(m.chat, teks, m, { mentions: [m.sender] });
  }

  // A joke from the template: it also used to REMOVE anyone who wrote exactly "te eliminó." (or "te eliminó!").
  if (/^te eliminó[.!]?$/i.test(m.text) && !isOwner) {
    client.sendText(m.chat, `No, pensionista.`, m, { mentions: [m.sender] });
  }

  if (user.banned) return;
  if (chat.isBanned) return;

  return;
};

export default plugin;
