let plugin = {};
plugin.cmd = ["tagall2", "todos2"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, isOwner, text, participants, chat }) => {
  if (!chat.mentions && !isOwner) return client.sendText(m.chat, txt.mentionsDisabled, m);

  const more = String.fromCharCode(8206);
  const readMore = more.repeat(4001);

  let htextos = `${text ? text : "_no_establecido_"}`;
  let oi = `*MENSAJE:* ${htextos}`;
  let teks = `*[ 🗣️ 🇭 🇴 🇱 🇦❕]*\n\n${oi}\n\n${readMore}`;

  const excludeJids = ["1234567890@lid"];

  for (let mem of participants) {
    if (!excludeJids.includes(mem.id)) {
      teks += `@${mem.id.split("@")[0]} `;
    }
  }

  let repeatCount = 10;
  let interval = 500;

  let i = 0;
  let intervalId = setInterval(() => {
    client.sendMessage(m.chat, { text: teks, mentions: participants.filter((a) => !excludeJids.includes(a.id)).map((a) => a.id) }, { quoted: m }).catch(console.error);
    i++;
    if (i >= repeatCount) {
      clearInterval(intervalId);
    }
  }, interval);
};

export default plugin;
