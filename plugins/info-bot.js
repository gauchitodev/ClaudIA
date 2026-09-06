const plugin = {};
plugin.cmd = ["info", "infobot", "botinfo"];

plugin.run = async (m, { client }) => {
  const textMsg = "🖥️ *Sobre este bot*\n\nHecho a medida para este grupo. El código vive acá:\n🔗 https://github.com/gauchitodev/ClaudIA-mi-edit-de-SawBot\n\n(Repo privado — si querés verlo, pedime acceso.)";

  client.sendText(m.chat, textMsg, m);
};

export default plugin;
