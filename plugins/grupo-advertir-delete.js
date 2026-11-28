import { advertenciasDe, setAdvertencias, MAX_ADVERTENCIAS, quitarUltimaAdvertencia, quitarAdvertenciaPropia } from "../database-functions.js";
import { destinatarioActual, esElBot, buscarEnGrupo } from "../lib/identidad.js";
import { impedimentoParaModerar } from "../lib/roles.js";
import txt from "../lib/strings.js";

// Removes one of this group's warnings.
const plugin = {};
plugin.cmd = ["unwarn", "quitaradvertencia"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants, isOwner, isWaAdmin, isAdmin }) => {
  const { quien, lid, jid, mencionado, participante } = await destinatarioActual(client, m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  if (esElBot([lid, jid], client)) return m.react("❌");
  if ([lid, jid, quien].some((id) => id && (id === m.sender || id === m.senderJid))) return sacarseUna(client, m, quien, { isOwner, isWaAdmin, isAdmin, participants });
  // Taking a warning away undoes a sanction, so it follows .adv's rule: only from strictly above. A moderator used to
  // clear another moderator's that an admin had given.
  const impedimento = impedimentoParaModerar(m.chat, { lid: m.sender, esOwner: isOwner, esAdminWhatsApp: isWaAdmin }, { lid: lid || quien, jid, esAdminWhatsApp: Boolean(participante?.admin) }, participants);
  if (impedimento) return client.sendText(m.chat, `No le puedo sacar la advertencia: ${impedimento}`, m);
  if (!quien) return client.sendText(m.chat, "No tengo registro de esa persona todavía.", m);

  const advertencias = advertenciasDe(quien, m.chat);
  if (advertencias === 0) return client.sendText(m.chat, "No tiene advertencias en este grupo.", m);

  setAdvertencias(quien, m.chat, advertencias - 1);
  // In their record (.antecedentes), the newest one still open is the one taken away, with who did it and when.
  quitarUltimaAdvertencia(quien, m.chat, { quitadaPor: m.sender });
  // With the mention: of someone the bot knows by their number alone, the "@" in the text tagged nobody (sendText).
  await client.sendText(m.chat, txt.advertirDeleteSuccess(quien, advertencias - 1, MAX_ADVERTENCIAS), m, { mentions: [quien] });
};

// One's own. A moderator can't: they used to clear the ones given them from above. The group's creator and the bot's
// owner take off any of theirs, the newest standing first, as from anyone (nobody but themselves warns an owner); any
// other admin, of WhatsApp or of the bot, only one they gave themselves: one from above stays.
async function sacarseUna(client, m, quien, { isOwner, isWaAdmin, isAdmin, participants }) {
  if (!(isAdmin || isWaAdmin || isOwner)) return client.sendText(m.chat, "Tus propias advertencias no te las podés sacar vos: pedíselo a alguien con más rango.", m);
  const advertencias = quien ? advertenciasDe(quien, m.chat) : 0;
  if (!advertencias) return client.sendText(m.chat, "No tenés advertencias en este grupo.", m);
  const creador = buscarEnGrupo(participants, { lid: m.sender, jid: m.senderJid })?.admin === "superadmin";
  if (isOwner || creador) quitarUltimaAdvertencia(quien, m.chat, { quitadaPor: m.sender });
  else if (!quitarAdvertenciaPropia(quien, m.chat, [m.sender, m.senderJid].filter(Boolean), { quitadaPor: m.sender })) {
    return client.sendText(m.chat, "Las advertencias que tenés te las puso alguien con más rango: esas no te las podés sacar vos.", m);
  }
  setAdvertencias(quien, m.chat, advertencias - 1);
  await client.sendText(m.chat, txt.advertirDeleteSuccess(quien, advertencias - 1, MAX_ADVERTENCIAS), m, { mentions: [quien] });
}

export default plugin;
