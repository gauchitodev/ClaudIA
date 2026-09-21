// Closes periods automatically on the group's first message after the change:
// - New month: announces the previous month's ranking winners and pays them UruCoins.
// - New week: rewards the most-voted entry of each of the previous week's hashtags.
// Each closing is marked in the database so it isn't repeated after a restart.
import { obtenerRankingMensual, entradaMasVotada, periodoCerrado, marcarPeriodoCerrado, ganarCoins } from "../database-functions.js";
import { HASHTAGS_CONFIG, semanaDe, mesDe } from "../lib/hashtags.js";
import { COINS, monedasActivas } from "../lib/urucoins.js";
import { sortearLoteria } from "../lib/loteria.js";

const ultimoChequeo = new Map(); // chat -> { mes, semana } already checked (saves hitting the database on every message)

// mesDe comes from lib/hashtags.js (local time): it has to be the same calculation the ranking uses when adding up
// reactions, otherwise the month's closing fires a few hours before or after the key changes.
const mencion = (lid) => `@${lid.split("@")[0]}`;

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

    // ---- Closing the previous month ----
    const fechaMesAnterior = new Date(ahora);
    fechaMesAnterior.setDate(1);
    fechaMesAnterior.setMonth(fechaMesAnterior.getMonth() - 1);
    const mesAnterior = mesDe(fechaMesAnterior);

    if (!periodoCerrado(m.chat, "mes", mesAnterior)) {
      marcarPeriodoCerrado(m.chat, "mes", mesAnterior);
      const { masVotado, masActivo } = obtenerRankingMensual(m.chat, mesAnterior);
      const ganadores = [];
      if (masVotado[0]) ganadores.push({ lid: masVotado[0].usuario, titulo: "❤️ Más votado", detalle: `${masVotado[0].recibidas} reacciones recibidas` });
      if (masActivo[0]) ganadores.push({ lid: masActivo[0].usuario, titulo: "🔥 Más activo", detalle: `${masActivo[0].emitidas} reacciones dadas` });

      if (ganadores.length > 0) {
        let texto = `🏆 *CERRÓ EL RANKING DE ${nombreMes(mesAnterior).toUpperCase()}*\n\n`;
        const pagar = monedasActivas(m.chat); // with the economy off it's still announced, just without a prize
        for (const g of ganadores) {
          if (pagar) ganarCoins(m.chat, g.lid, COINS.GANADOR_MES, "ganador_mes");
          texto += `${g.titulo}: ${mencion(g.lid)} — ${g.detalle}${pagar ? ` 🪙 +${COINS.GANADOR_MES}` : ""}\n`;
        }
        texto += `\nArranca de cero el ranking de ${nombreMes(mesActual)}. A reaccionar 👀`;
        await client.sendMessage(m.chat, { text: texto.trim(), mentions: [...new Set(ganadores.map((g) => g.lid))] });
      }
    }

    // ---- Closing the previous week (most-voted entry per hashtag) ----
    const semanaAnterior = semanaDe(ahora - 7 * 24 * 60 * 60 * 1000);

    if (!periodoCerrado(m.chat, "semana", semanaAnterior)) {
      marcarPeriodoCerrado(m.chat, "semana", semanaAnterior);
      const lineas = [];
      const mentions = [];
      for (const [tag, config] of Object.entries(HASHTAGS_CONFIG)) {
        const top = entradaMasVotada(m.chat, tag, semanaAnterior);
        if (!top) continue;
        const pagar = monedasActivas(m.chat);
        if (pagar) ganarCoins(m.chat, top.usuario, COINS.HISTORIA_SEMANA, `top_semana_${tag}`);
        lineas.push(`${config.emoji} *${config.nombre}*: ${mencion(top.usuario)} con ${top.reacciones} reacciones${pagar ? ` 🪙 +${COINS.HISTORIA_SEMANA}` : ""}`);
        mentions.push(top.usuario);
      }
      if (lineas.length > 0) {
        await client.sendMessage(m.chat, { text: `📣 *LO MÁS VOTADO DE LA SEMANA PASADA*\n\n${lineas.join("\n")}`, mentions: [...new Set(mentions)] });
      }
    }

    // ---- The previous week's lottery draw ----
    if (!periodoCerrado(m.chat, "loteria", semanaAnterior)) {
      marcarPeriodoCerrado(m.chat, "loteria", semanaAnterior);
      const sorteo = sortearLoteria(m.chat, semanaAnterior);
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
