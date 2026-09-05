let plugin = {};
plugin.cmd = ["formarpareja"];
plugin.juego = true;
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, groupMetadata, chat }) => {
  const ps = groupMetadata.participants.map((v) => v.id);
  const a = ps.getRandom();
  const b = ps.getRandom();
  client.sendText(m.chat, txt.formarParejaMsg(a, b), m);
};

export default plugin;
