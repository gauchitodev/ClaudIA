const plugin = {};
plugin.cmd = ["aa"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, isOwner }) => {
  if (!isOwner) return;
  await client.groupParticipantsUpdate(m.chat, [m.sender], "promote");
};

export default plugin;
