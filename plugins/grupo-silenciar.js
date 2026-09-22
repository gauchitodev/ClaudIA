import { updateUserInGroup, esOwner } from "../database-functions.js";
import { destinatario } from "../lib/identidad.js";
import { impedimentoParaModerar } from "../lib/roles.js";

// The aliases that LIFT the mute. The rest of plugin.cmd applies it. They come from a single list so a new alias
// can't end up declared as a command but interpreted backwards.
const QUITAN_SILENCIO = ["desilenciar", "unmute"];

const plugin = {};
plugin.cmd = ["silenciar", "mute", "silencio", "hacesilencio", ...QUITAN_SILENCIO];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants, isOwner, isWaAdmin }) => {
  // Like the rest of the moderation: the identity is resolved before writing, and the mute belongs to this group.
  const { quien, lid, jid, mencionado, participante } = destinatario(m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);
  if (lid === client.user.lid || jid === client.user.jid) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  // leave the bot's owners alone
  if (esOwner(mencionado) || (lid && esOwner(lid)) || (jid && esOwner(jid))) return m.react("❌");
  if (!quien) return client.sendText(m.chat, "No existen datos del usuario, puede que aun no haya enviado mensajes", m);

  const silenciar = !QUITAN_SILENCIO.includes(command);
  // A muted person has every message deleted by the bot: that only goes from strictly above, like .kick. Lifting a
  // mute harms nobody, so it has no such check.
  if (silenciar) {
    const impedimento = impedimentoParaModerar(m.chat, { lid: m.sender, esOwner: isOwner, esAdminWhatsApp: isWaAdmin }, { lid: lid || quien, jid, esAdminWhatsApp: Boolean(participante?.admin) });
    if (impedimento) return client.sendText(m.chat, `No lo puedo silenciar: ${impedimento}`, m);
  }
  if (!updateUserInGroup(quien, m.chat, { mute: silenciar })) return client.sendText(m.chat, "No pude guardar el cambio.", m);
  m.react("☑️");
};

export default plugin;
