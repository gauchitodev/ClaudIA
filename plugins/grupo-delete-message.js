const plugin = {};
plugin.cmd = ["del"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, isMod, isOwner }) => {
  if (!m.quoted) return client.sendText(m.chat, txt.deleteMessageNull, m);
  // m.quoted.sender usually arrives as @lid, so it's compared against both of the sender's formats.
  const esPropio = [m.sender, m.senderJid].includes(m.quoted.sender);
  if (!esPropio && !isMod && !isOwner) return client.sendText(m.chat, txt.deleteMessageOnlyMe, m);

  m.quoted.delete();
  m.delete();
};

export default plugin;
