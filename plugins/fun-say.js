// The bot says the text as its own, without quoting whoever asked: it's for admins and moderators, because
// otherwise anyone can make it talk and no trace is left of who wrote it.
const plugin = {};
plugin.cmd = ["say", "decir"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, text }) => {
  if (!text) return client.sendText(m.chat, txt.sayText, m);
  await client.sendText(m.chat, text, null);
};

export default plugin;
