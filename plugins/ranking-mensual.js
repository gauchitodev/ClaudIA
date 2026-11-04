import { obtenerRankingMensual } from "../database-functions.js";
import { mesDe } from "../lib/hashtags.js";
import { nombreDe, modoDeNombre, nombrandoPor } from "../lib/menciones.js";

const reacciones = (n) => `${n} ${n === 1 ? "reacción" : "reacciones"}`;

const plugin = {};
plugin.cmd = ["ranking", "rankingmensual"];
plugin.onlyGroup = true;

// With "nombres" or "numeros", everyone by their WhatsApp name or by their number (lib/menciones.js).
plugin.run = async (m, { client, text }) => {
  const { modo } = modoDeNombre(text);
  const mes = mesDe();
  const { masVotado, masActivo } = obtenerRankingMensual(m.chat, mes);

  if (masVotado.length === 0 && masActivo.length === 0) {
    return client.sendText(m.chat, "Todavía no hay reacciones registradas este mes. Empiecen a reaccionar 👀", m);
  }

  const texto = nombrandoPor(modo, () => {
    let t = `🏆 *RANKING DEL MES*\n\n`;

    t += `❤️ *Más votado (contenido más reaccionado):*\n`;
    if (masVotado.length === 0) {
      t += `Nadie todavía.\n`;
    } else {
      masVotado.forEach((r, i) => {
        t += `${i + 1}. ${nombreDe(r.usuario)} — ${reacciones(r.recibidas)}\n`;
      });
    }

    t += `\n🔥 *Más activo (el que más reacciona):*\n`;
    if (masActivo.length === 0) {
      t += `Nadie todavía.\n`;
    } else {
      masActivo.forEach((r, i) => {
        t += `${i + 1}. ${nombreDe(r.usuario)} — ${reacciones(r.emitidas)} ${r.emitidas === 1 ? "dada" : "dadas"}\n`;
      });
    }
    return t.trim();
  });

  // Names and no mentions, like .baltop and .timba: a ranking has no business notifying everyone on it.
  await client.sendMessage(m.chat, { text: texto }, { quoted: m });
};

export default plugin;
