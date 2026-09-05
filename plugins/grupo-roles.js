import { getUser } from "../database-functions.js";
import { lidMencionado } from "../lib/menciones.js";
import { darRol, quitarRol, textoRoles } from "../lib/roles.js";

let plugin = {};
plugin.cmd = ["adminbot", "adminbots", "moderador", "moderadores", "mod", "mods", "roles"];
plugin.onlyGroup = true;

// .adminbot @persona / .moderador @persona dan el rol (solo en este grupo) · con "quitar" antes de la mención lo sacan ·
// .roles (o cualquiera sin argumentos) lista quiénes tienen rol. Quién puede dar qué lo decide lib/roles.js.
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
