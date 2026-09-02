let plugin = (m) => m;
plugin.before = async function (m, { client, isAdmin, isOwner, isBotAdmin, chat }) {
  if (!chat.antiStatus) return;
  if (!isBotAdmin) return;
  if (m?.message?.groupStatusMentionMessage?.message?.protocolMessage && !isAdmin && !isOwner) {
    await client.sendText(m.chat, "No mencionar al grupo en tus estados!!", m, { mentions: [m.sender, globalThis.owners[0] + "@s.whatsapp.net"] });
    setTimeout(async () => {
      try {
        await client.groupParticipantsUpdate(m.chat, [m.sender], "remove");
        await m.delete();
      } catch (e) {
        console.error("[anti-mención-estado] no se pudo expulsar/borrar:", e.message);
      }
    }, 3000);
  }

  return;
};
export default plugin;
