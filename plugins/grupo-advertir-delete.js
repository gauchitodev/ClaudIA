import { advertenciasDe, setAdvertencias, MAX_ADVERTENCIAS } from "../database-functions.js";
import { destinatario } from "../lib/identidad.js";
import { impedimentoParaModerar } from "../lib/roles.js";

// Removes one of this group's warnings.
const plugin = {};
plugin.cmd = ["unwarn", "quitaradvertencia"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants, isOwner, isWaAdmin }) => {
  const { quien, lid, jid, mencionado, participante } = destinatario(m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  if (lid === client.user.lid || jid === client.user.jid) return m.react("❌");
  // Taking a warning away undoes a sanction, so it follows .adv's rule: only from strictly above. A moderator used to
  // clear their own warnings, or another moderator's that an admin had given.
  if (!isOwner && [lid, jid, quien].some((id) => id && (id === m.sender || id === m.senderJid))) {
    return client.sendText(m.chat, "Tus propias advertencias no te las podés sacar vos: pedíselo a alguien con más rango.", m);
  }
  const impedimento = impedimentoParaModerar(m.chat, { lid: m.sender, esOwner: isOwner, esAdminWhatsApp: isWaAdmin }, { lid: lid || quien, jid, esAdminWhatsApp: Boolean(participante?.admin) });
  if (impedimento) return client.sendText(m.chat, `No le puedo sacar la advertencia: ${impedimento}`, m);
  if (!quien) return client.sendText(m.chat, "No tengo registro de esa persona todavía.", m);

  const advertencias = advertenciasDe(quien, m.chat);
  if (advertencias === 0) return client.sendText(m.chat, "No tiene advertencias en este grupo.", m);

  setAdvertencias(quien, m.chat, advertencias - 1);
  await client.sendText(m.chat, txt.advertirDeleteSuccess(quien, advertencias - 1, MAX_ADVERTENCIAS), m);
};

export default plugin;
