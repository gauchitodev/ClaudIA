const plugin = {};
plugin.cmd = ["encuesta"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, participants, chat, isMod, isOwner }) => {
  if (!text) return client.sendText(m.chat, txt.encuestaNull(usedPrefix), m);
  const parts = text
    .split("-")
    .map((p) => p.trim())
    .filter((p) => p);
  if (parts.length < 3) return client.sendText(m.chat, txt.encuestaMin(usedPrefix), m);
  if (parts.length > 13) return client.sendText(m.chat, txt.encuestaMax, m);
  const mentionsUsers = participants.map((u) => client.decodeJid(u.id));
  const pregunta = parts[0];
  const opciones = parts.slice(1);
  await client.sendMessage(m.chat, { poll: { name: pregunta, values: opciones, selectableCount: 1, toAnnouncementGroup: false } }, { quoted: null });
  // Calling everyone to vote tags the whole group, so it follows .tagall's rule: a moderator with mentions on, or the
  // owner. Anyone could open a poll and tag the whole group with it, mentions off included; the poll itself is enough.
  if (isOwner || (isMod && chat?.mentions)) await client.sendText(m.chat, "*¡Puedes votar si quieres!🙂👆*", null, { mentions: mentionsUsers });
};

export default plugin;
