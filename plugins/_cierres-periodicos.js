// Closes periods automatically on the group's first message after the change:
// - New month: announces the previous month's ranking winners and pays them UruCoins.
// - New week: rewards the most-voted entry of each of the previous week's hashtags, and draws its lottery.
// Each closing is marked in the database so it isn't repeated after a restart.
//
// A closing waits for a message from the group, and only the previous period used to be closed: a week without a single
// message (a quiet group, the bot down) left the week before it open for good, its lottery never drawn nor refunded and
// its top never paid. Now every period since the last one closed gets closed, oldest first.
import { obtenerRankingMensual, entradaMasVotada, marcarPeriodoCerrado, ultimoPeriodoCerrado, ganarCoins } from "../database-functions.js";
import { HASHTAGS_CONFIG, semanaDe, mesDe, semanasAnteriores, mesesAnteriores, semanaEnTexto } from "../lib/hashtags.js";
import { COINS, monedasActivas } from "../lib/urucoins.js";
import { sortearLoteria } from "../lib/loteria.js";

const ultimoChequeo = new Map(); // chat -> { mes, semana } already checked (saves hitting the database on every message)

// How far back it looks for periods left open.
const ATRASO_MAX = { semanas: 26, meses: 12 };

// mesDe comes from lib/hashtags.js (local time): it has to be the same calculation the ranking uses when adding up
// reactions, otherwise the month's closing fires a few hours before or after the key changes.
const mencion = (lid) => `@${lid.split("@")[0]}`;

// The periods of one type to close in a chat, oldest first, out of "anteriores" (the past ones, newest first). Where that
// type was never closed it starts with the previous one only, as it always did.
function porCerrar(chat, tipo, anteriores) {
  const ultimo = ultimoPeriodoCerrado(chat, tipo);
  if (!ultimo) return anteriores.slice(0, 1);
  return anteriores.filter((p) => p > ultimo).reverse();
}

const plugin = (m) => m;

plugin.before = async (m, { client }) => {
  try {
    if (!m.isGroup) return;

    const ahora = Date.now();
    const mesActual = mesDe(ahora);
    const semanaActual = semanaDe(ahora);
    const previo = ultimoChequeo.get(m.chat);
    if (previo && previo.mes === mesActual && previo.semana === semanaActual) return;
    ultimoChequeo.set(m.chat, { mes: mesActual, semana: semanaActual });

    // ---- Closing the previous months ----
    const meses = mesesAnteriores(ahora, ATRASO_MAX.meses);
    for (const mes of porCerrar(m.chat, "mes", meses)) {
      marcarPeriodoCerrado(m.chat, "mes", mes);
      const { masVotado, masActivo } = obtenerRankingMensual(m.chat, mes);
      const ganadores = [];
      if (masVotado[0]) ganadores.push({ lid: masVotado[0].usuario, titulo: "❤️ Más votado", detalle: `${masVotado[0].recibidas} reacciones recibidas` });
      if (masActivo[0]) ganadores.push({ lid: masActivo[0].usuario, titulo: "🔥 Más activo", detalle: `${masActivo[0].emitidas} reacciones dadas` });

      if (ganadores.length > 0) {
        let texto = `🏆 *CERRÓ EL RANKING DE ${nombreMes(mes).toUpperCase()}*\n\n`;
        const pagar = monedasActivas(m.chat); // with the economy off it's still announced, just without a prize
        for (const g of ganadores) {
          if (pagar) ganarCoins(m.chat, g.lid, COINS.GANADOR_MES, "ganador_mes");
          texto += `${g.titulo}: ${mencion(g.lid)} — ${g.detalle}${pagar ? ` 🪙 +${COINS.GANADOR_MES}` : ""}\n`;
        }
        if (mes === meses[0]) texto += `\nArranca de cero el ranking de ${nombreMes(mesActual)}. A reaccionar 👀`;
        await client.sendMessage(m.chat, { text: texto.trim(), mentions: [...new Set(ganadores.map((g) => g.lid))] });
      }
    }

    // ---- Closing the previous weeks (most-voted entry per hashtag) ----
    const semanas = semanasAnteriores(ahora, ATRASO_MAX.semanas);
    for (const semana of porCerrar(m.chat, "semana", semanas)) {
      marcarPeriodoCerrado(m.chat, "semana", semana);
      const lineas = [];
      const mentions = [];
      for (const [tag, config] of Object.entries(HASHTAGS_CONFIG)) {
        const top = entradaMasVotada(m.chat, tag, semana);
        if (!top) continue;
        const pagar = monedasActivas(m.chat);
        if (pagar) ganarCoins(m.chat, top.usuario, COINS.HISTORIA_SEMANA, `top_semana_${tag}`);
        lineas.push(`${config.emoji} *${config.nombre}*: ${mencion(top.usuario)} con ${top.reacciones} reacciones${pagar ? ` 🪙 +${COINS.HISTORIA_SEMANA}` : ""}`);
        mentions.push(top.usuario);
      }
      if (lineas.length > 0) {
        await client.sendMessage(m.chat, { text: `📣 *LO MÁS VOTADO DE ${semanaEnTexto(semana, ahora).toUpperCase()}*\n\n${lineas.join("\n")}`, mentions: [...new Set(mentions)] });
      }
    }

    // ---- The previous weeks' lottery draws ----
    for (const semana of porCerrar(m.chat, "loteria", semanas)) {
      marcarPeriodoCerrado(m.chat, "loteria", semana);
      const sorteo = sortearLoteria(m.chat, semana, ahora);
      if (sorteo) await client.sendMessage(m.chat, { text: sorteo.texto, mentions: sorteo.mentions });
    }
  } catch (e) {
    console.error("[cierres-periodicos] ERROR:", e);
  }
  return;
};

function nombreMes(yyyymm) {
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const [anio, mes] = yyyymm.split("-");
  return `${meses[parseInt(mes, 10) - 1]} ${anio}`;
}

export default plugin;
