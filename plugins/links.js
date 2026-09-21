const plugin = {};
plugin.cmd = ["links", "discord"];

plugin.run = async (m, { client, command, isBotAdmin }) => {
  const discord = globalThis.discordUrl || "";

  if (command === "discord") {
    if (!discord) return client.sendText(m.chat, "Falta configurar el link de Discord en config.toml (discordUrl).", m);
    return client.sendText(m.chat, `🎮 Discord del grupo:\n${discord}`, m);
  }

  // .links: the group (the one from the config or, failing that, the current group's invite link when the bot is admin), the channel and Discord
  let grupo = globalThis.tarjetaGrupo?.enlace || "";
  if (!grupo && m.isGroup && isBotAdmin) {
    const codigo = await client.groupInviteCode(m.chat).catch(() => null);
    if (codigo) grupo = `https://chat.whatsapp.com/${codigo}`;
  }
  const canal = globalThis.canalConfig?.enlace || "";

  const lineas = [];
  if (grupo) lineas.push(`👥 Grupo: ${grupo}`);
  if (canal) lineas.push(`📣 Canal: ${canal}`);
  if (discord) lineas.push(`🎮 Discord: ${discord}`);
  if (lineas.length === 0) return client.sendText(m.chat, "No hay links configurados todavía: tarjetaGrupo.enlace, canal.enlace y discordUrl en config.toml.", m);

  await client.sendText(m.chat, `🔗 *Links*\n${lineas.join("\n")}`, m);
};

export default plugin;
