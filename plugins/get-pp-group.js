const plugin = {};
plugin.cmd = ["getpp"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client }) => {
  const pp = await client.profilePictureUrl(m.chat, "image").catch((_) => null);
  if (!pp) return client.sendText(m.chat, "No hay foto en el grupo", m);
  // The picture is the answer: if it doesn't come down (sendFile throws, lib/wa-socket.js), that's said instead of
  // nothing.
  await client.sendFile(m.chat, pp, "Profile.jpg", null, m).catch((e) => {
    console.error("[getpp] no pude mandar la foto:", e?.message || e);
    return client.sendText(m.chat, "No pude bajar la foto del grupo; probá de nuevo en un rato.", m);
  });
};

export default plugin;
