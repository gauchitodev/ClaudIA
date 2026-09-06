import { getAllUsers } from "../database-functions.js";

const plugin = {};
plugin.cmd = ["conteo"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client }) => {
  const allUsers = getAllUsers();

  const ranking = [];

  for (const user of allUsers) {
    const groupData = user.inGroup[m.chat];

    if (groupData && typeof groupData.messageCount === "number" && groupData.messageCount > 0) {
      const number = user.lid ? user.lid.split("@")[0] : "desconocido";

      ranking.push({
        number,
        count: groupData.messageCount,
      });
    }
  }

  // ordenar de mayor a menor conteo
  ranking.sort((a, b) => b.count - a.count);

  // tomar solo los primeros 10
  const top10 = ranking.slice(0, 10);

  let txt = "🏆 *LOS 10 QUE MÁS HABLAN EN ESTE GRUPO* 🏆\n\n";

  if (top10.length === 0) {
    txt += "Aún nadie ha enviado mensajes (o el contador está vacío).";
  } else {
    for (let i = 0; i < top10.length; i++) {
      const position = i + 1;
      const { number, count } = top10[i];
      txt += `${position}. @${number} - *${count}* mensajes\n`;
    }
  }

  await client.sendText(m.chat, txt, m);
};

export default plugin;
