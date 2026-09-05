let plugin = {};
plugin.cmd = ["getpp"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client }) => {
  const pp = await client.profilePictureUrl(m.chat, "image").catch((_) => null);
  if (!pp) return client.sendText(m.chat, "No hay foto en el grupo", m);
  await client.sendFile(m.chat, pp, "Profile.jpg", null, m);
};

export default plugin;
