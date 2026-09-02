import { parse } from "tldts";

let plugin = (m) => m;

plugin.before = async function (m, { client, isAdmin, isBotAdmin, isOwner, participants, chat }) {
  if (!m.isGroup || !isBotAdmin || isAdmin || isOwner) return;
  if (!chat.allAntiLinks) return;
  const groupAdmins = participants.filter((p) => p.admin);
  let words = m.text.split(/\s+/);
  let foundLink = words.map((w) => parse(w)).find((info) => info.domainWithoutSuffix && info.isIcann)?.domainWithoutSuffix;

  if (foundLink) {
    if (chat.antiDelete) {
      return client.sendText(m.chat, txt.allAntiLinksDelete, m, { mentions: [m.sender, ...groupAdmins.map((v) => v.id)] });
    }

    if (isBotAdmin) {
      await client.sendText(m.chat, txt.allAntiLinks(m.sender, foundLink), null, { mentions: [m.sender] });
      await m.delete();
      // await conn.groupParticipantsUpdate(m.chat, [m.sender], "remove");
    }
  }
  return;
};

export default plugin;
