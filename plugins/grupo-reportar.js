const plugin = {};
plugin.cmd = ["reportar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, participants }) => {
  if (!m.quoted) return client.sendText(m.chat, txt.reportarNull, m);
  const groupAdmins = participants.filter((p) => p.admin);
  const listAdmin = groupAdmins.map((v, i) => `${i + 1}. @${v.id.split("@")[0]}`).join("\n");

  const str = `*[ ⚠️ ] 𝗥𝗘𝗣𝗢𝗥𝗧𝗘 𝗘𝗫𝗜𝗧𝗢𝗦𝗢 [ ⚠️ ]*

*🔴 LLAMANDO ADMINS 🔴*

*👇🏻ADMINS DEL GRUPO👇🏻*
${listAdmin}

*《 - - - - 𝙍𝙀𝙋𝙊𝙍𝙏𝙀 - - - - 》*`.trim();
  await client.sendText(m.chat, str, m);
};

export default plugin;
