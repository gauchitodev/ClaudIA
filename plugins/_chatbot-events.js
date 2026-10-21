const plugin = (m) => m;
plugin.moderacion = true; // runs before the other hooks (hooksEnOrden, load-functions.js)
plugin.before = async (m, { client, isOwner, isMod, user, chat }) => {
  if (!m.isGroup) return;

  // What gets deleted here is marked, and no hook after this one touches it (Claudia, the marketplace, the hashtags).
  if (m.mtype === "liveLocationMessage" && !isMod && !isOwner) {
    m.moderado = true;
    await m.delete();
    return;
  }

  if (m.mentionedJid && m.mentionedJid.length >= 10 && !isOwner && !isMod) {
    m.moderado = true;
    m.delete();
    client.sendText(m.chat, `Ponete a hacer algo productivo y dejate de joder @${m.sender.split("@")[0]} 🤨`, m, { mentions: [m.sender] });
  }

  if (user.banned) return;
  if (chat.isBanned) return;

  return;
};

export default plugin;
