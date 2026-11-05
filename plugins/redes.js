import { leerRed, fijarRed, borrarRed, textoRedes, listaDeRedes } from "../lib/redes.js";

// .redes: the group's social links (lib/redes.js). .redes lists them, .redes instagram shows one, and an admin loads
// them with .redes instagram <link> and takes one out with .redes borrar instagram. .links and .discord, the commands
// that used to read config.toml, stay as ways to say .redes and .redes discord.
const plugin = {};
plugin.cmd = ["redes", "links", "sociales", "discord"];
plugin.onlyGroup = true;

plugin.run = async (m, { client, text, command, isAdmin, isOwner, isBotAdmin }) => {
  const palabras = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (command === "discord") palabras.unshift("discord");
  const borrar = Boolean(palabras[0]) && /^(borrar|quitar|sacar)$/i.test(palabras[0]);
  const red = leerRed(borrar ? palabras[1] : palabras[0]);
  const link = borrar ? "" : palabras.slice(1).join(" ");

  if (borrar || link) {
    if (!isAdmin && !isOwner) return client.sendText(m.chat, "🔗 Las redes del grupo las carga y las borra un admin. Vos las ves con .redes.", m);
    const r = borrar ? borrarRed(m.chat, palabras[1]) : fijarRed(m.chat, palabras[0], link);
    return client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
  }
  if (palabras[0] && !red) return client.sendText(m.chat, `❌ No conozco esa red. Las que van: ${listaDeRedes()}.`, m);

  // This group's invite link, when the bot can get it and nobody loaded one: it's this group's, so it belongs here.
  let invitacion = "";
  if ((!red || red === "grupo") && isBotAdmin) {
    const codigo = await client.groupInviteCode(m.chat).catch(() => null);
    if (codigo) invitacion = `https://chat.whatsapp.com/${codigo}`;
  }
  await client.sendText(m.chat, textoRedes(m.chat, { red, grupoInvitacion: invitacion }), m);
};

export default plugin;
