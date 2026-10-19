const plugin = {};
plugin.cmd = ["info", "infobot", "botinfo"];

// The bot's code is open, under the MIT license: .info says so and links to it.
plugin.run = async (m, { client }) => {
  const textMsg = "🖥️ *Sobre este bot*\n\nHecho a medida para este grupo. El código es abierto, con licencia MIT, y está acá:\n🔗 https://github.com/gauchitodev/ClaudIA";

  return client.sendText(m.chat, textMsg, m);
};

export default plugin;
