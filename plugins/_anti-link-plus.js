// Puntos escapados y borde de palabra: antes "t.me" matcheaba "tomen", "time" o "teme" y borraba mensajes normales.
const isLinkTikTok = /(^|[^a-z0-9])(vm\.|vt\.|www\.)?tiktok\.com\//i;
const isLinkTelegram = /(^|[^a-z0-9])(t\.me|telegram\.(me|org|com))\//i;
const isLinkInstagram = /(^|[^a-z0-9])(www\.)?instagram\.com\//i;

let plugin = (m) => m;
plugin.before = async function (m, { client, participants, isAdmin, isBotAdmin, isOwner, chat }) {
  if (!m.isGroup) return;
  if (isAdmin || isOwner) return;
  const groupAdmins = participants.filter((p) => p.admin);

  const instagramLink = isLinkInstagram.exec(m.text);
  const tiktokLink = isLinkTikTok.exec(m.text);
  const telegramLink = isLinkTelegram.exec(m.text);

  if (chat.antiInstagram && instagramLink) {
    if (chat.antiDelete) return client.sendText(m.chat, txt.allAntiLinkDelete, m, { mentions: [m.sender, ...groupAdmins.map((v) => v.id)] });
    if (isBotAdmin) {
      await client.sendText(m.chat, txt.allAntiLinkInstagram(m.sender), null, { mentions: [m.sender, ...groupAdmins.map((v) => v.id)] });
      await m.delete();
    }
  }

  if (chat.antiTiktok && tiktokLink) {
    if (chat.antiDelete) return client.sendText(m.chat, txt.allAntiLinkDelete, m, { mentions: [m.sender, ...groupAdmins.map((v) => v.id)] });
    if (isBotAdmin) {
      await client.sendText(m.chat, txt.allAntiLinkTikTok(m.sender), null, { mentions: [m.sender, ...groupAdmins.map((v) => v.id)] });
      await m.delete();
    }
  }

  if (chat.antiTelegram && telegramLink) {
    if (chat.antiDelete) return client.sendText(m.chat, txt.allAntiLinkDelete, m, { mentions: [m.sender, ...groupAdmins.map((v) => v.id)] });
    if (isBotAdmin) {
      await client.sendText(m.chat, txt.allAntiLinkTelegram(m.sender), null, { mentions: [m.sender, ...groupAdmins.map((v) => v.id)] });
      await m.delete();
    }
  }

  return;
};

export default plugin;
