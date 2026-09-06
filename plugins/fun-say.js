const plugin = {};
plugin.cmd = ["say", "decir"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text }) => {
  if (!text) return client.sendText(m.chat, txt.sayText, m);
  await client.sendText(m.chat, text, null);
};

export default plugin;
