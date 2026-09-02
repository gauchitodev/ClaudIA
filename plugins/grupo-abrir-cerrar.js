let plugin = {};
plugin.cmd = ["g"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, groupMetadata }) => {
  // Se consulta el estado real: el metadata cacheado puede estar viejo y hacer que .g repita "cerrar" en vez de abrir.
  const metadataFresca = await client.groupMetadata(m.chat).catch(() => null);
  let isClosed = (metadataFresca || groupMetadata).announce;
  let newState = isClosed ? "not_announcement" : "announcement";
  let reaction = isClosed ? "🔓" : "🔒";
  setTimeout(() => {
    m.react(reaction);
  }, 500);
  await client.groupSettingUpdate(m.chat, newState);
};

export default plugin;
