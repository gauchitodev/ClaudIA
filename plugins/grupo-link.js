const plugin = {};
plugin.cmd = ["enlace", "link"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client }) => {
  try {
    await client.sendText(m.chat, `https://chat.whatsapp.com/${await client.groupInviteCode(m.chat)}`, m);
  } catch (e) {
    await client.sendText(m.chat, `Error en la solicitud a WhatsApp.`);
    console.log(e);
  }
};

export default plugin;
