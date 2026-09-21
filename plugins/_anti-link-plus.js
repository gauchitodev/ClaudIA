// Anti-links de Instagram, TikTok y Telegram.
// Each pattern demands the full domain with the slash: "tiktok.com/..." yes, "hablemos de tiktok" no.
// (The previous version had /t.me/ unescaped, which also caught "time", "tome", "tame"...)
const isLinkTikTok = /\b(?:www\.|vm\.|vt\.)?tiktok\.com\/\S+/i;
const isLinkTelegram = /\b(?:t\.me|telegram\.(?:me|org|dog))\/\S+/i;
const isLinkInstagram = /\b(?:www\.)?instagram\.com\/\S+/i;

const plugin = (m) => m;
plugin.before = async (m, { client, participants, isMod, isBotAdmin, isOwner, chat }) => {
  if (!m.isGroup || !m.text) return;
  if (isMod || isOwner) return;
  const groupAdmins = participants.filter((p) => p.admin);
  const mentions = [m.sender, ...groupAdmins.map((v) => v.id)];

  let aviso = null;
  if (chat.antiInstagram && isLinkInstagram.test(m.text)) aviso = txt.allAntiLinkInstagram(m.sender);
  else if (chat.antiTiktok && isLinkTikTok.test(m.text)) aviso = txt.allAntiLinkTikTok(m.sender);
  else if (chat.antiTelegram && isLinkTelegram.test(m.text)) aviso = txt.allAntiLinkTelegram(m.sender);

  if (!aviso) return;
  if (chat.antiDelete) return client.sendText(m.chat, txt.allAntiLinkDelete, m, { mentions });
  if (isBotAdmin) {
    await client.sendText(m.chat, aviso, null, { mentions });
    await m.delete();
  }
  return;
};

export default plugin;
