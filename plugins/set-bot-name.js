const plugin = {};
plugin.cmd = ["setbotname"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text }) => {
  if (!text) return client.sendText(m.chat, txt.setbotnameNull, m);
  await client.updateProfileName(text);
  m.react("✔️");
};

export default plugin;
