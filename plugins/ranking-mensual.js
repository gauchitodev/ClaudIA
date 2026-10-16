import { obtenerRankingMensual } from "../database-functions.js";
import { mesDe } from "../lib/hashtags.js";
import { nombreDe } from "../lib/menciones.js";

const reacciones = (n) => `${n} ${n === 1 ? "reacción" : "reacciones"}`;

const plugin = {};
plugin.cmd = ["ranking", "rankingmensual"];
plugin.onlyGroup = true;

plugin.run = async (m, { client }) => {
  const mes = mesDe();
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
      texto += `${i + 1}. ${nombreDe(r.usuario)} — ${reacciones(r.recibidas)}\n`;
    });
  }

  texto += `\n🔥 *Más activo (el que más reacciona):*\n`;
  if (masActivo.length === 0) {
    texto += `Nadie todavía.\n`;
  } else {
    masActivo.forEach((r, i) => {
      texto += `${i + 1}. ${nombreDe(r.usuario)} — ${reacciones(r.emitidas)} ${r.emitidas === 1 ? "dada" : "dadas"}\n`;
    });
  }

  // Names and no mentions, like .baltop and .timba: a ranking has no business notifying everyone on it.
  await client.sendMessage(m.chat, { text: texto.trim() }, { quoted: m });
};

export default plugin;
