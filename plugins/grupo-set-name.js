const plugin = {};
plugin.cmd = ["setname"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, args, text }) => {
  if (!text) return client.sendText(m.chat, txt.setNameNull, m);

  try {
    const text = args.join(" ");
    if (args && args[0]) await client.groupUpdateSubject(m.chat, text);
  } catch (e) {
    await client.sendText(m.chat, `Error en la solicitud a WhatsApp.`);
    console.log(e);
  }
};

export default plugin;
