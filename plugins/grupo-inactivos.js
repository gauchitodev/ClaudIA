import { getAllUsers } from "../database-functions.js";

let plugin = {};
plugin.cmd = ["inactivos"];
plugin.onlyAdmin = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, participants }) => {
  const allUsers = getAllUsers();
  let inactivos = [];

  for (const participant of participants) {
    const lid = participant.id;

    const user = allUsers.find((u) => u.lid === lid);
    const groupData = user?.inGroup?.[m.chat];

    if (!groupData || !groupData.messageCount || groupData.messageCount <= 0) {
      inactivos.push(lid);
    }
  }

  if (inactivos.length === 0) return client.sendMessage(m.chat, { text: "No hay inactivos en este grupo." }, { quoted: m });

  const more = String.fromCharCode(8206);
  const readMore = more.repeat(4001);

  let texto = `📢 *Usuarios inactivos (${inactivos.length}):*\n`;
  texto += readMore + "\n\n";

  for (const lid of inactivos) {
    const numero = lid.split("@")[0];
    texto += `@${numero}\n`;
  }

  await client.sendMessage(m.chat, { text: texto, mentions: inactivos }, { quoted: null });
};

export default plugin;
