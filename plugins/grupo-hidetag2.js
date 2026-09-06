const plugin = {};
plugin.cmd = ["hidetag2", "ht2"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

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

  // Enviar 10 veces con intervalos de 10 segundos
  for (let i = 0; i < 10; i++) {
    setTimeout(() => {
      sendMessage().catch(console.error);
    }, i * 500); // Intervalo de 10 segundos (10000 ms)
  }
};

export default plugin;
