const plugin = {};
plugin.cmd = ["ad"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, isAdmin }) => {
  if (isAdmin) {
    await client.groupParticipantsUpdate(m.chat, [m.sender], "demote");
  }
};

export default plugin;
