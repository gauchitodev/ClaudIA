import { borrarAntecedentes } from "../database-functions.js";
import { destinatarioActual, esElBot } from "../lib/identidad.js";
import { impedimentoParaModerar } from "../lib/roles.js";

// .clearantecedentes @persona: their record in this group goes (.antecedentes), and so do the warnings standing, which
// the record no longer accounts for. Only admins: it erases what the mods noted. And as .unwarn, only from strictly
// above, and nobody on their own.
const plugin = {};
plugin.cmd = ["clearantecedentes", "limpiarantecedentes"];
plugin.onlyGroup = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants, isOwner, isWaAdmin }) => {
  const { quien, lid, jid, mencionado, participante } = await destinatarioActual(client, m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  if (esElBot([lid, jid], client)) return m.react("❌");
  if (!isOwner && [lid, jid, quien].some((id) => id && (id === m.sender || id === m.senderJid))) {
    return client.sendText(m.chat, "Tus propios antecedentes no los podés borrar vos: pedíselo a alguien con más rango.", m);
  }
  const impedimento = impedimentoParaModerar(m.chat, { lid: m.sender, esOwner: isOwner, esAdminWhatsApp: isWaAdmin }, { lid: lid || quien, jid, esAdminWhatsApp: Boolean(participante?.admin) }, participants);
  if (impedimento) return client.sendText(m.chat, `No le puedo borrar los antecedentes: ${impedimento}`, m);
  if (!quien) return client.sendText(m.chat, "No tengo registro de esa persona todavía.", m);

  const { borrados, vigentes } = borrarAntecedentes(quien, m.chat);
  if (!borrados && !vigentes) return client.sendText(m.chat, "No tiene antecedentes en este grupo.", m);
  const hecho = [
    borrados && (borrados === 1 ? "borré la advertencia anotada" : `borré las ${borrados} advertencias anotadas`),
    vigentes && (vigentes === 1 ? "le saqué la vigente" : `le saqué las ${vigentes} vigentes`),
  ].filter(Boolean);
  // With the mention, as .unwarn: of someone the bot knows by their number alone, the "@" in the text tagged nobody.
  await client.sendText(m.chat, `🧹 Listo: *@${quien.split("@")[0]}* queda sin antecedentes en este grupo: ${hecho.join(" y ")}.`, m, { mentions: [quien] });
};

export default plugin;
