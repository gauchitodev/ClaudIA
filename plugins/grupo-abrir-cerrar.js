const plugin = {};
plugin.cmd = ["g"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, groupMetadata }) => {
  // Se consulta el estado real: el metadata cacheado puede estar viejo y hacer que .g repita "cerrar" en vez de abrir.
  const metadataFresca = await client.groupMetadata(m.chat).catch(() => null);
  const isClosed = (metadataFresca || groupMetadata).announce;
  const newState = isClosed ? "not_announcement" : "announcement";
  const reaction = isClosed ? "🔓" : "🔒";
  setTimeout(() => {
    m.react(reaction);
  }, 500);
  await client.groupSettingUpdate(m.chat, newState);
};

export default plugin;
