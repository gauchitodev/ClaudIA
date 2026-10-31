import { destinatarioActual, esElBot } from "../lib/identidad.js";
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

  // Both identities, and how the group lists them: a group that lists people by number names them by it, and lists a
  // WhatsApp admin that way too. Named by a number the group doesn't pair, WhatsApp says who has it now; with the LID
  // alone, someone the bot knew by the number was "not in the group", and a role given by the number stayed. The role
  // goes under the LID, or the number for someone with no LID known.
  const { lid, jid, participante } = await destinatarioActual(client, m, text, participants);
  const quien = { lid: m.sender, esOwner: isOwner, esAdminWhatsApp: isWaAdmin, isAdmin };
  // In the group by the group's list: a row in the database is anyone who ever wrote where the bot is, and the role
  // went to someone who wasn't here. Without the list, it can't tell.
  if (!quitar && !participants?.length) return client.sendText(m.chat, "No pude ver la lista de miembros del grupo; probá de nuevo en un rato.", m);
  const objetivo = { lid: lid || jid, jid, esAdminWhatsApp: !!participante?.admin, esBot: esElBot([lid, jid], client), estaEnGrupo: !!participante };

  const r = quitar ? quitarRol(m.chat, rol, quien, objetivo) : darRol(m.chat, rol, quien, objetivo);
  if (!r.ok) return client.sendMessage(m.chat, { text: `❌ ${r.error}`, mentions: r.mentions || [] }, { quoted: m });
  await client.sendMessage(m.chat, { text: r.mensaje, mentions: r.mentions }, { quoted: m });
};

export default plugin;
