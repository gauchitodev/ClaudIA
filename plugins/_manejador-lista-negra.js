import { isBlacklisted } from "../database-functions.js";

let plugin = (m) => m;
plugin.before = async function (m, { client, isBotAdmin, isRAdmin }) {
  if (isRAdmin) return;
  if (!isBotAdmin) return;
  if (!m.isGroup) return;
  if (m.messageStubType) return;

  // Buscar en SQLite
  const blacklistEntry = isBlacklisted(m.senderJid, m.chat);
  if (!blacklistEntry) return;

  // borrar el mensaje y eliminar al usuario.
  await m.delete();
  await client.groupParticipantsUpdate(m.chat, [m.sender], "remove");
  await client.sendText(m.chat, txt.blackList(m.senderJid, blacklistEntry.reason), null, { mentions: [m.sender] });
  return true;
};

export default plugin;
