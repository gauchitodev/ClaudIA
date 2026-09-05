// Anti-links de grupos y canales de WhatsApp.
// Solo salta con un link de verdad (chat.whatsapp.com/CODIGO); escribir "grupo de whatsapp" no cuenta.
const groupLinkRegex = /chat\.whatsapp\.com\/[A-Za-z0-9]{6,}/i;
const channelLinkRegex = /whatsapp\.com\/channel\/[A-Za-z0-9]{6,}/i;

let plugin = (m) => m;
plugin.before = async function (m, { client, participants, isMod, isBotAdmin, isOwner, chat }) {
  if (isMod || isOwner) return;
  if (!m.isGroup || !m.text) return;
  const groupAdmins = participants.filter((p) => p.admin);
  const isGroupLink = groupLinkRegex.test(m.text);
  const isChannelLink = channelLinkRegex.test(m.text);

  if (chat.antiGroups && isGroupLink) {
    if (!isBotAdmin) return client.sendText(m.chat, txt.antiGroups, null, { mentions: [m.sender, ...groupAdmins.map((v) => v.id)] });

    // el link de este mismo grupo no se castiga
    const thisGroup = await client.groupInviteCode(m.chat).catch(() => null);
    if (thisGroup && m.text.includes(thisGroup)) return client.sendText(m.chat, "El link es de este mismo grupo 😄", m);

    if (chat.antiDelete) return client.sendText(m.chat, txt.antiGroupsDelete, null, { mentions: [m.sender, ...groupAdmins.map((v) => v.id)] });

    client.sendMessage(m.chat, { text: txt.antiGroupsSuccess(m.sender), mentions: [m.sender, ...groupAdmins.map((v) => v.id)] }, { quoted: null });
    await m.delete();
    await client.groupParticipantsUpdate(m.chat, [m.sender], "remove");
  }

  if (chat.antiChannels && isChannelLink) {
    if (!isBotAdmin) return client.sendText(m.chat, txt.antiChannel, null, { mentions: [m.sender, ...groupAdmins.map((v) => v.id)] });
    if (chat.antiDelete) return client.sendText(m.chat, txt.antiChannelDelete, null, { mentions: [m.sender, ...groupAdmins.map((v) => v.id)] });

    client.sendMessage(m.chat, { text: txt.antiChannelSuccess(m.sender), mentions: [m.sender, ...groupAdmins.map((v) => v.id)] }, { quoted: null });
    await m.delete();
  }

  return;
};

export default plugin;
