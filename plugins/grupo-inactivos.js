import { getUser } from "../database-functions.js";

const plugin = {};
plugin.cmd = ["inactivos"];
plugin.onlyMod = true;
plugin.onlyGroup = true;

// Each participant's row by any of their two identities: a group that lists its members by number used to match none
// of them (rows are by LID), so it called everyone inactive and tagged the whole group.
const filaDe = (p) => [p.id, p.lid, p.phoneNumber].filter(Boolean).map((id) => getUser(id)).find(Boolean);

plugin.run = async (m, { client, participants }) => {
  const inactivos = [];

  for (const participant of participants) {
    const groupData = filaDe(participant)?.inGroup?.[m.chat];

    if (!groupData || !groupData.messageCount || groupData.messageCount <= 0) {
      inactivos.push(participant.id); // the id the group lists them under, so the mention works
    }
  }

  if (inactivos.length === 0) return client.sendMessage(m.chat, { text: "No hay inactivos en este grupo." }, { quoted: m });

  const more = String.fromCharCode(8206);
  const readMore = more.repeat(4001);

  let texto = `📢 *Usuarios inactivos (${inactivos.length}):*\n`;
  texto += `${readMore}\n\n`;

  for (const lid of inactivos) {
    const numero = lid.split("@")[0];
    texto += `@${numero}\n`;
  }

  await client.sendMessage(m.chat, { text: texto, mentions: inactivos }, { quoted: null });
};

export default plugin;
