import { topCoins, puestoCoins, getSaldoCoins, totalEnCirculacion } from "../database-functions.js";
import { etiquetaLaburo } from "../lib/laburos.js";
import { nombreDe } from "../lib/menciones.js";

const TOP_N = 10;

const plugin = {};
plugin.cmd = ["baltop", "topcoins", "ricos"];
plugin.economia = true;
plugin.onlyGroup = true;

// The group's richest (this used to live inside .coins). If you don't make the top, it tells you your place.
// It uses names and no mentions: tagging ten people per query filled their phones with notifications.
plugin.run = async (m, { client }) => {
  const top = topCoins(m.chat, TOP_N);
  if (top.length === 0) return client.sendText(m.chat, "💰 Acá nadie tiene UruCoins todavía. Se ganan reaccionando, con los hashtags y ganando juegos.", m);

  const lineas = top.map((r, i) => {
    const laburo = etiquetaLaburo(m.chat, r.usuario);
    return `${i + 1}. ${nombreDe(r.usuario)}${laburo ? ` (${laburo})` : ""} — *${r.saldo}*`;
  });

  const pie = [];
  if (!top.some((r) => r.usuario === m.sender)) {
    const puesto = puestoCoins(m.chat, m.sender);
    pie.push(puesto ? `Vos: puesto ${puesto} con ${getSaldoCoins(m.chat, m.sender)} UruCoins.` : "Vos todavía no tenés UruCoins.");
  }
  const { total, personas } = totalEnCirculacion(m.chat);
  pie.push(`En circulación: *${total} UruCoins* entre ${personas} ${personas === 1 ? "persona" : "personas"}.`);

  const texto = `💰 *LOS MÁS RICOS DEL GRUPO*\n\n${lineas.join("\n")}\n\n${pie.join("\n")}`;
  await client.sendText(m.chat, texto, m);
};

export default plugin;
