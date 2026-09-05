let plugin = {};
plugin.cmd = ["ruletadelban", "ruletaban", "banruleta"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, groupMetadata }) => {
  // Quedan afuera el bot y cualquier admin (incluido el creador del grupo, al que WhatsApp no deja expulsar).
  let psmap = groupMetadata.participants.filter((v) => v.id !== client.user.lid && !v.admin);
  psmap = psmap.map((v) => v.id);
  if (psmap.length === 0) return client.sendText(m.chat, `*No se encontraron candidatos para la ruleta o todos son admintradores*`, m);
  const user = psmap.getRandom();
  client.sendText(m.chat, txt.ruletaDelBan(user), m);
  await delay(2000);
  await client.groupParticipantsUpdate(m.chat, [user], "remove");
};

export default plugin;
const delay = (time) => new Promise((res) => setTimeout(res, time));
