const plugin = {};
plugin.cmd = ["r", "recovery", "recuperar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, isOwner }) => {
  if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessageV2?.message || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessageV2Extension?.message || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage?.viewOnce || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage?.viewOnce || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage?.viewOnce) {
    // m.quoted.sender usually arrives as @lid, so it's compared against both of the sender's formats.
    if (![m.sender, m.senderJid].includes(m.quoted.sender) && !isOwner) return client.sendText(m.chat, txt.recoveryOnceRestrict, m);
  }
  if (m.quoted && m.quoted.sender === client.user.lid) return m.react("❌");
  if (!m.quoted) return client.sendText(m.chat, txt.recoveryOnceNull, m);
  const mime = m.quoted.mimetype || m.quoted.mediaType || "";
  if (/image|video/.test(mime)) {
    const result = await m.quoted.download?.();
    await client.sendFile(m.chat, result, null, txt.recoveryOnceSuccess, m);
  } else if (/audio/.test(mime)) {
    const result = await m.quoted.download?.();
    await client.sendMessage(m.chat, { audio: result, fileName: "error.mp3", mimetype: "audio/mpeg", ptt: true }, { quoted: m });
  } else return client.sendText(m.chat, txt.recoveryOnceNull, m);
};

export default plugin;
