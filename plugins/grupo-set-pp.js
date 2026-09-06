const plugin = {};
plugin.cmd = ["setpp", "removepp"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, command }) => {
  if (command === "setpp") {
    const q = m.quoted ? m.quoted : m;
    const mime = (q.msg || q).mimetype || q.mediaType || "";
    if (/image/.test(mime)) {
      const img = await q.download();
      if (!img) return client.sendText(m.chat, txt.setppNull, m);
      if (img) return await client.updateProfilePicture(m.chat, img);
    } else return;
  }

  if (command === "removepp") {
    await client.removeProfilePicture(m.chat);
  } else return;
};

export default plugin;
