// El bot dice el texto como propio, sin citar a quien lo pidió: queda para admins y moderadores, porque si no
// cualquiera puede hacerlo hablar y no queda rastro de quién escribió.
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
