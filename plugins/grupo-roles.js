import { getUser } from "../database-functions.js";
import { lidMencionado } from "../lib/menciones.js";
import { darRol, quitarRol, textoRoles } from "../lib/roles.js";

const plugin = {};
plugin.cmd = ["adminbot", "adminbots", "moderador", "moderadores", "mod", "mods", "roles"];
plugin.onlyGroup = true;

// .adminbot @person / .moderador @person grant the role (in this group only) · with "quitar" before the mention they
// revoke it · .roles (or either one with no arguments) lists who holds a role. Who may grant what is decided by
// lib/roles.js.
plugin.run = async (m, { client, command, args, text, participants, isOwner, isWaAdmin, isAdmin }) => {
  if (["adminbots", "moderadores", "mods", "roles"].includes(command) || !args.length) {
    const r = textoRoles(m.chat);
    return client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m });
  }

  const rol = command.startsWith("admin") ? "admin" : "mod";
  const quitar = /^(quitar|sacar|borrar|remover)$/i.test(args[0]);

  const lid = lidMencionado(m, text);

  const enGrupo = lid ? (participants || []).find((p) => client.decodeJid(p.id) === lid) : null;
  const quien = { lid: m.sender, esOwner: isOwner, esAdminWhatsApp: isWaAdmin, isAdmin };
  const objetivo = { lid, esAdminWhatsApp: !!enGrupo?.admin, esBot: lid === client.user?.lid, estaEnGrupo: !!enGrupo || (!!lid && !!getUser(lid)) };

  const r = quitar ? quitarRol(m.chat, rol, quien, objetivo) : darRol(m.chat, rol, quien, objetivo);
  if (!r.ok) return client.sendMessage(m.chat, { text: `❌ ${r.error}`, mentions: r.mentions || [] }, { quoted: m });
  await client.sendMessage(m.chat, { text: r.mensaje, mentions: r.mentions }, { quoted: m });
};

export default plugin;
