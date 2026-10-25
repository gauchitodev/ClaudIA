import { nombreDeGrupo } from "../lib/cache-grupos.js";
import { esVistaUnica } from "../lib/vista-unica.js";
import { esElBot } from "../lib/identidad.js";
const { downloadContentFromMessage } = await import(baileys);

const plugin = (m) => m;
plugin.before = async (m, { client, chat, isWaAdmin }) => {
  if (!chat.antiDelete) return;
  try {
    if (m.message?.protocolMessage?.type === 0) {
      // Only among this chat's own messages: it used to look in every chat, so a forged deletion (a modified client can
      // send one with any id) could bring out a message from another group.
      const msg = client.serializeM(client.loadMessage(m.message.protocolMessage.key.id, m.chat));
      if (!msg) return;
      if (msg.key.fromMe || esElBot(msg.key.participant, client)) return;
      // Deleted by its author, or by a WhatsApp admin of the group, who can delete anyone's. Anybody else's deletion is
      // forged, and re-posting it showed someone deleting what they never deleted.
      if (msg.sender !== m.sender && !isWaAdmin) return;
      if (msg.message.reactionMessage) return;
      // A view-once is never re-posted: the whole group would see what its author sent to be seen once, and then
      // deleted. The bot only holds one when someone had quoted it (pushMessage keeps the quoted messages), and it
      // used to post it for everyone, V2 as "ViewOnce (eliminado)" and the other formats as a plain photo.
      if (esVistaUnica(msg.message)) return;
      // Only the group's name is needed here, and the cache already has it: asking for the whole metadata on
      // every deleted message was a query to WhatsApp, and one without a catch, so a timeout killed the notice.
      const nombreGrupo = await nombreDeGrupo(client, msg.key.remoteJid);
      const participant = msg.key?.participant || msg.key?.remoteJid;
      const { imageMessage, videoMessage, stickerMessage, audioMessage, extendedTextMessage, conversation } = msg.message;

      if (imageMessage) {
        const buffer = Buffer.concat(await Array.fromAsync(await downloadContentFromMessage(imageMessage, "image"))); // joined once, see downloadM
        const caption = `*━━━ \`𝘼𝙉𝙏𝙄 𝙀𝙇𝙄𝙈𝙄𝙉𝘼𝙍\` ━━━*
*┃ Nombre:* @${participant.split("@")[0]}
${msg.key.remoteJid.endsWith("@g.us") ? `*┃ Grupo:* ${nombreGrupo}` : "*┃ Chat privado*"}
${imageMessage.caption ? `- *Texto:* ${imageMessage.caption}` : "- *Texto:* _sin_texto_"}`;
        await client.sendMessage(m.chat, { image: buffer, caption, mentions: client.parseMention(caption) }, { quoted: msg });
        return;
      } else if (videoMessage) {
        const buffer = Buffer.concat(await Array.fromAsync(await downloadContentFromMessage(videoMessage, "video"))); // joined once, see downloadM
        const caption = `*━━━ \`𝘼𝙉𝙏𝙄 𝙀𝙇𝙄𝙈𝙄𝙉𝘼𝙍\` ━━━*
*┃ Nombre:* @${participant.split("@")[0]}
${msg.key.remoteJid.endsWith("@g.us") ? `*┃ Grupo:* ${nombreGrupo}` : "*┃ Chat privado*"}
${videoMessage.caption ? `- *Texto:* ${videoMessage.caption}` : "- *Texto:* _sin_texto_"}`;
        await client.sendMessage(m.chat, { video: buffer, caption, mentions: client.parseMention(caption) }, { quoted: msg });
        return;
      } else if (stickerMessage) {
        if (!msg.message.stickerMessage?.height) {
          msg.message.stickerMessage.height = 64;
          msg.message.stickerMessage.width = 64;
        }
        const caption = `*━━━ \`𝘼𝙉𝙏𝙄 𝙀𝙇𝙄𝙈𝙄𝙉𝘼𝙍\` ━━━*
*┃ Nombre:* @${participant.split("@")[0]}
${msg.key.remoteJid.endsWith("@g.us") ? `*┃ Grupo:* ${nombreGrupo}` : "*┃ Chat privado*"}
*┃ Reenviando sticker...*
*━━━ 👇🏻👇🏻👇🏻👇🏻👇🏻 ━━━*`;
        await client.sendMessage(m.chat, { text: caption, mentions: [participant] }, { quoted: msg });
        await client.sendMessage(m.chat, { forward: msg });
        return;
      } else if (audioMessage) {
        const buffer = Buffer.concat(await Array.fromAsync(await downloadContentFromMessage(audioMessage, "audio"))); // joined once, see downloadM
        const caption = `*━━━ \`𝘼𝙉𝙏𝙄 𝙀𝙇𝙄𝙈𝙄𝙉𝘼𝙍\` ━━━*
*┃ Nombre:* @${participant.split("@")[0]}
${msg.key.remoteJid.endsWith("@g.us") ? `*┃ Grupo:* ${nombreGrupo}` : "*┃ Chat privado*"}
*┃🔊 Reenviando audio...*
*━━━ 👇🏻👇🏻👇🏻👇🏻👇🏻 ━━━*`;
        await client.sendMessage(m.chat, { text: caption, mentions: client.parseMention(caption) }, { quoted: msg });
        await client.sendMessage(m.chat, { audio: buffer, ptt: true }, { quoted: msg });
        return;
      } else if (extendedTextMessage || conversation) {
        const msgText = msg.message?.extendedTextMessage?.text || msg.message?.conversation;
        const caption = `*━━━ \`𝘼𝙉𝙏𝙄 𝙀𝙇𝙄𝙈𝙄𝙉𝘼𝙍\` ━━━*
*┃ Nombre:* @${participant.split("@")[0]}
${msg.key.remoteJid.endsWith("@g.us") ? `*┃ Grupo:* ${nombreGrupo}` : "*┃ Chat privado*"}
- *📝Mensaje:* ${msgText}
*━━━ \`𝘼𝙉𝙏𝙄 𝙀𝙇𝙄𝙈𝙄𝙉𝘼𝙍\` ━━━*`;
        await client.sendMessage(m.chat, { text: caption, mentions: client.parseMention(caption) }, { quoted: msg });
        return;
      } else {
        const caption = `*━━━ \`𝘼𝙉𝙏𝙄 𝙀𝙇𝙄𝙈𝙄𝙉𝘼𝙍\` ━━━*
*┃ Nombre:* @${participant.split("@")[0]}
${msg.key.remoteJid.endsWith("@g.us") ? `*┃ Grupo:* ${nombreGrupo}` : "*┃ Chat privado*"}
*┃ Reenviando contenido borrado..*
*━━━ 👇🏻👇🏻👇🏻👇🏻👇🏻 ━━━*`;
        await client.sendMessage(m.chat, { text: caption, mentions: [participant] }, { quoted: msg });
        await client.sendMessage(m.chat, { forward: msg });
        return;
      }
    }

    return;
  } catch (e) {
    console.log(e);
  }
};

export default plugin;
