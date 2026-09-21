import { sticker } from "../lib/sticker.js";

const plugin = {};
plugin.cmd = ["s", "sticker", "stiker"];
plugin.botAdmin = true;

plugin.run = async (m, { client, isOwner }) => {
  if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessageV2?.message || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessageV2Extension?.message || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage?.viewOnce || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage?.viewOnce || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage?.viewOnce) {
    // m.quoted.sender usually arrives as @lid, so it's compared against both of the sender's formats.
    if (![m.sender, m.senderJid].includes(m.quoted.sender) && !isOwner) return client.sendText(m.chat, txt.recoveryOnceRestrict, m);
  }
  const q = m.quoted ? m.quoted : m;
  const mime = (q.msg || q).mimetype || q.mediaType || "";
  if (!/webp|image|video/.test(mime)) return client.sendText(m.chat, txt.sticker1, m);
  if (q.seconds > 7) return await client.sendText(m.chat, txt.sticker2, m);
  // If the download comes back empty it stops here. The error used to be handed to sendFile, which blew up inside,
  // and the only trace was a getFile stack that mentioned neither .s nor the download.
  const img = await q.download?.();
  if (!img?.length) {
    console.error(`[sticker] ❌ .s: la descarga del archivo vino vacía (mediaType: ${q.mediaType || "ninguno"}, mime: ${mime || "ninguno"}, download: ${typeof q.download}).`);
    console.error("[sticker] ➜ CAUSA: no se pudo bajar el archivo de WhatsApp. NO es problema de ffmpeg.");
    return;
  }
  // sticker() returns the webp; or the original file if ffmpeg failed (on purpose, so the photo goes out instead of
  // nothing); or an error if it couldn't manage either. Only the first two can be sent.
  const stiker = await sticker(img, false);
  if (!Buffer.isBuffer(stiker) || !stiker.length) {
    console.error("[sticker] ❌ .s: no se pudo generar el sticker, no se manda nada. La causa está en las líneas [sticker] de arriba.");
    return;
  }
  try {
    await client.sendFile(m.chat, stiker, null, null, m);
  } catch (e) {
    console.error("[sticker] ❌ .s: el sticker se generó bien pero WhatsApp rechazó el envío:", e?.message || e);
  }
};

export default plugin;
