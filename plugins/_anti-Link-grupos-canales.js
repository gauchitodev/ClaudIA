// Solo links reales de invitación: antes el regex era /chat.whatsap/ y escribir "chat whatsapp" en una frase expulsaba gente.
let groupLinkRegex = /chat\.whatsapp\.com\/[A-Za-z0-9]+/i;
let channelLinkRegex = /whatsapp\.com\/channel\/[A-Za-z0-9]+/i;

let plugin = (m) => m;
plugin.before = async function (m, { client, participants, isAdmin, isBotAdmin, isOwner, chat }) {
  if (isAdmin || isOwner) return;
  if (!m.isGroup) return;
  const groupAdmins = participants.filter((p) => p.admin);
  let isGroupLink = groupLinkRegex.exec(m.text);
  let isChannelLink = channelLinkRegex.exec(m.text);

  if (chat.antiGroups && isGroupLink) {
    if (!isBotAdmin) return client.sendText(m.chat, txt.antiGroups, null, { mentions: [m.sender, ...groupAdmins.map((v) => v.id)] });
    if (chat.antiDelete) return client.sendText(m.chat, txt.antiGroupsDelete, null, { mentions: [m.sender, ...groupAdmins.map((v) => v.id)] });

    const thisGroup = await client.groupInviteCode(m.chat);
    const isThisGroup = m.text.includes(thisGroup);
    if (isThisGroup) return client.sendText(m.chat, "El link es de este mismo grupo 😄", m);

    if (isBotAdmin) {
      await client.sendMessage(m.chat, { text: txt.antiGroupsSuccess(m.sender), mentions: [m.sender, ...groupAdmins.map((v) => v.id)] }, { quoted: null });
      await m.delete();
      await client.groupParticipantsUpdate(m.chat, [m.sender], "remove");
    }
  }

  if (chat.antiChannels && isChannelLink) {
    if (!isBotAdmin) return client.sendText(m.chat, txt.antiChannel, null, { mentions: [m.sender, ...groupAdmins.map((v) => v.id)] });
    if (chat.antiDelete) return client.sendText(m.chat, txt.antiChannelDelete, null, { mentions: [m.sender, ...groupAdmins.map((v) => v.id)] });

    if (isBotAdmin) {
      await client.sendMessage(m.chat, { text: txt.antiChannelSuccess(m.sender), mentions: [m.sender, ...groupAdmins.map((v) => v.id)] }, { quoted: null });
      await m.delete();
      //await client.groupParticipantsUpdate(m.chat, [m.sender], "remove");
    }
  }

  return;
};

export default plugin;
