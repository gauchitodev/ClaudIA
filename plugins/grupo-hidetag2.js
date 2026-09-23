const plugin = {};
plugin.cmd = ["hidetag2", "ht2"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
// Admins only, not moderators: mentioning the whole group ten times in a row is the closest thing to spam the bot does.
plugin.onlyAdmin = true;

plugin.run = async (m, { client, text, participants, isOwner, chat }) => {
  if (!chat.mentions && !isOwner) return client.sendText(m.chat, txt.mentionsDisabled, m);
  if (!text && !m.quoted) return client.sendText(m.chat, txt.hidetagNull, m);

  const excludeJids = ["1234567890@lid"];
  const users = participants.filter((a) => !excludeJids.includes(a.id)).map((a) => a.id);

  const sendMessage = async () => {
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

  // Sent 10 times, half a second apart; the queue (lib/envios.js) stretches that to its own pace.
  for (let i = 0; i < 10; i++) {
    setTimeout(() => {
      sendMessage().catch(console.error);
    }, i * 500);
  }
};

export default plugin;
