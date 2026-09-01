import { obtenerRankingMensual } from "../database-functions.js";

let plugin = {};
plugin.cmd = ["ranking", "rankingmensual"];
plugin.onlyGroup = true;

plugin.run = async (m, { client }) => {
  const mes = new Date().toISOString().slice(0, 7);
  const { masVotado, masActivo } = obtenerRankingMensual(m.chat, mes);

  if (masVotado.length === 0 && masActivo.length === 0) {
    return client.sendText(m.chat, "Todavía no hay reacciones registradas este mes. Empiecen a reaccionar 👀", m);
  }

  let texto = `🏆 *RANKING DEL MES*\n\n`;

  texto += `❤️ *Más votado (contenido más reaccionado):*\n`;
  if (masVotado.length === 0) {
    texto += `Nadie todavía.\n`;
  } else {
    masVotado.forEach((r, i) => {
      texto += `${i + 1}. @${r.usuario.split("@")[0]} — ${r.recibidas} reacciones\n`;
    });
  }

  texto += `\n🔥 *Más activo (el que más reacciona):*\n`;
  if (masActivo.length === 0) {
    texto += `Nadie todavía.\n`;
  } else {
    masActivo.forEach((r, i) => {
      texto += `${i + 1}. @${r.usuario.split("@")[0]} — ${r.emitidas} reacciones dadas\n`;
    });
  }

  const mentions = [...new Set([...masVotado.map((r) => r.usuario), ...masActivo.map((r) => r.usuario)])];
  await client.sendMessage(m.chat, { text: texto.trim(), mentions }, { quoted: m });
};

export default plugin;
