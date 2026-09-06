const plugin = {};
plugin.cmd = ["tagall2", "todos2"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, isOwner, text, participants, chat }) => {
  if (!chat.mentions && !isOwner) return client.sendText(m.chat, txt.mentionsDisabled, m);

  const more = String.fromCharCode(8206);
  const readMore = more.repeat(4001);

  const htextos = `${text ? text : "_no_establecido_"}`;
  const oi = `*MENSAJE:* ${htextos}`;
  let teks = `*[ 🗣️ 🇭 🇴 🇱 🇦❕]*\n\n${oi}\n\n${readMore}`;

  const excludeJids = ["1234567890@lid"];

  for (const mem of participants) {
    if (!excludeJids.includes(mem.id)) {
      teks += `@${mem.id.split("@")[0]} `;
    }
  }

  const repeatCount = 10;
  const interval = 500;

  let i = 0;
  const intervalId = setInterval(() => {
    client.sendMessage(m.chat, { text: teks, mentions: participants.filter((a) => !excludeJids.includes(a.id)).map((a) => a.id) }, { quoted: m }).catch(console.error);
    i++;
    if (i >= repeatCount) {
      clearInterval(intervalId);
    }
  }, interval);
};

export default plugin;
