let plugin = (m) => m;
plugin.before = async function (m, { client, isOwner, isMod, user, chat }) {
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
    let teks = pickRandom([`No.`, `Jajaja no.`, `Acá no se reparte admin, dejá.`, `Pedir admin no suma puntos, eh.`, `No va a pasar, pero me gusta el entusiasmo.`, `Seguí participando 😌`]);
    client.sendText(m.chat, teks, m, { mentions: [m.sender] });
  }

  // Chiste de la plantilla: antes además EXPULSABA a quien escribía exactamente "te eliminó." (o "te eliminó!").
  if (/^te eliminó[.!]?$/i.test(m.text) && !isOwner) {
    client.sendText(m.chat, `No, pensionista.`, m, { mentions: [m.sender] });
  }

  if (user.banned) return;
  if (chat.isBanned) return;

  return;
};

export default plugin;

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}
