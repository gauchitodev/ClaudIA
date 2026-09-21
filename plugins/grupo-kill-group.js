// commented out for now, it still needs safeguards against wiping the wrong group

/*let plugin = {};
plugin.cmd = ["k5"];

plugin.run = async (m, { client, participants, isBotAdmin }) => {
  if (![...globalThis.owners.map((number) => number.replace(/[^0-9]/g, "") + "@s.whatsapp.net")].includes(m.senderJid) && m.sender !== client.user.lid) return;
  if (!m.isGroup) return;
  if (!isBotAdmin) return;

  const jidsToExclude = ["1234567890@lid"];
  const users = participants.map((u) => u.id).filter((id) => !jidsToExclude.includes(id));
  const jidsToRemove = users.map((id) => client.decodeJid(id));

  if (jidsToRemove.length > 0) {
    await client.groupParticipantsUpdate(m.chat, jidsToRemove, "remove");
  } else return;
};

export default plugin;*/
