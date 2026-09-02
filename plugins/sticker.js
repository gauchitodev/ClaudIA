import { sticker } from "../lib/sticker.js";

let plugin = {};
plugin.cmd = ["s", "sticker", "stiker"];
plugin.botAdmin = true;

plugin.run = async (m, { client, isOwner }) => {
  if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessageV2?.message || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessageV2Extension?.message || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage?.viewOnce || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage?.viewOnce || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage?.viewOnce) {
    // m.quoted.sender suele venir como @lid, así que se compara contra los dos formatos del remitente.
    if (![m.sender, m.senderJid].includes(m.quoted.sender) && !isOwner) return client.sendText(m.chat, txt.recoveryOnceRestrict, m);
  }
  const q = m.quoted ? m.quoted : m;
  const mime = (q.msg || q).mimetype || q.mediaType || "";
  if (!/webp|image|video/.test(mime)) return client.sendText(m.chat, txt.sticker1, m);
  if (q.seconds > 7) return await client.sendText(m.chat, txt.sticker2, m);
  const img = await q.download?.();
  const stiker = await sticker(img, false);
  await client.sendFile(m.chat, stiker, null, null, m);
};

export default plugin;
