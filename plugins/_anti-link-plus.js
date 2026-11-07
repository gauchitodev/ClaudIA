// Anti-links de Instagram, TikTok y Telegram. Each pattern (lib/enlaces.js) demands the full domain with the slash:
// "tiktok.com/..." yes, "hablemos de tiktok" no.
import { LINK_TIKTOK, LINK_TELEGRAM, LINK_INSTAGRAM } from "../lib/enlaces.js";
import txt from "../lib/strings.js";

const plugin = (m) => m;
plugin.moderacion = true; // runs before the other hooks (hooksEnOrden, load-functions.js)
plugin.before = async (m, { client, participants, isMod, isBotAdmin, isOwner, chat }) => {
  if (!m.isGroup || !m.text) return;
  if (isMod || isOwner) return;
  const groupAdmins = participants.filter((p) => p.admin);
  const mentions = [m.sender, ...groupAdmins.map((v) => v.id)];

  let aviso = null;
  if (chat.antiInstagram && LINK_INSTAGRAM.test(m.text)) aviso = txt.allAntiLinkInstagram(m.sender);
  else if (chat.antiTiktok && LINK_TIKTOK.test(m.text)) aviso = txt.allAntiLinkTikTok(m.sender);
  else if (chat.antiTelegram && LINK_TELEGRAM.test(m.text)) aviso = txt.allAntiLinkTelegram(m.sender);

  if (!aviso) return;
  if (chat.antiDelete) return client.sendText(m.chat, txt.allAntiLinkDelete, m, { mentions });
  if (isBotAdmin) {
    // Delete first, warn after: same reason as in _all-anti-links.js. Marked as moderated, Claudia leaves it alone.
    m.moderado = true;
    await m.delete();
    client.sendText(m.chat, aviso, null, { mentions }).catch(console.error);
  }
  return;
};

export default plugin;
