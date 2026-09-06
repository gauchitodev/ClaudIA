const plugin = {};
plugin.cmd = ["rl", "resetlink", "restaurarenlace"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client }) => {
  await client.groupRevokeInvite(m.chat);
};

export default plugin;
