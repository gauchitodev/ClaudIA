const plugin = {};
plugin.cmd = ["hidetag", "ht"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, text, participants, isOwner, chat }) => {
  if (!chat.mentions && !isOwner) return client.sendText(m.chat, txt.mentionsDisabled, m);
  if (!text && !m.quoted) return client.sendText(m.chat, txt.hidetagNull, m);

  const excludeJids = ["1234567890@lid"];
  const users = participants.filter((a) => !excludeJids.includes(a.id)).map((a) => a.id);
  try {
    if (!isOwner) {
      await client.sendMessage(m.chat, { forward: m.quoted.fakeObj, mentions: users }, { quoted: m });
    } else if (isOwner) {
      await client.sendMessage(m.chat, { forward: m.quoted.fakeObj, mentions: users });
    }
  } catch {
    if (!isOwner) {
      await client.sendMessage(m.chat, { text: text ? text : "", mentions: users }, { quoted: m }, { ephemeralExpiration: 24 * 60 * 100, disappearingMessagesInChat: 24 * 60 * 100 });
    } else if (isOwner) {
      await client.sendMessage(m.chat, { text: text ? text : "", mentions: users }, { ephemeralExpiration: 24 * 60 * 100, disappearingMessagesInChat: 24 * 60 * 100 });
    }
  }
};

export default plugin;
