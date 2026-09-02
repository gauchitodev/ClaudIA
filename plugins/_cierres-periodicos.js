// Cierra períodos automáticamente con el primer mensaje del grupo que llega después del cambio:
// - Mes nuevo: anuncia ganadores del ranking del mes anterior y les da UruCoins.
// - Semana nueva: premia la entrada más votada de cada hashtag de la semana anterior.
// Cada cierre se marca en la base de datos para no repetirlo después de un reinicio.
import { obtenerRankingMensual, entradaMasVotada, periodoCerrado, marcarPeriodoCerrado, ganarCoins } from "../database-functions.js";
import { HASHTAGS_CONFIG, semanaDe } from "../lib/hashtags.js";
import { COINS } from "../lib/urucoins.js";

const ultimoChequeo = new Map(); // chat -> { mes, semana } ya verificados (evita ir a la base en cada mensaje)

const mesDe = (fecha) => new Date(fecha).toISOString().slice(0, 7);
const mencion = (lid) => `@${lid.split("@")[0]}`;

let plugin = (m) => m;

plugin.before = async function (m, { client }) {
  try {
    if (!m.isGroup) return;

    const ahora = Date.now();
    const mesActual = mesDe(ahora);
    const semanaActual = semanaDe(ahora);
    const previo = ultimoChequeo.get(m.chat);
    if (previo && previo.mes === mesActual && previo.semana === semanaActual) return;
    ultimoChequeo.set(m.chat, { mes: mesActual, semana: semanaActual });

    // ---- Cierre del mes anterior ----
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
        for (const g of ganadores) {
          ganarCoins(m.chat, g.lid, COINS.GANADOR_MES, "ganador_mes");
          texto += `${g.titulo}: ${mencion(g.lid)} — ${g.detalle} 🪙 +${COINS.GANADOR_MES}\n`;
        }
        texto += `\nArranca de cero el ranking de ${nombreMes(mesActual)}. A reaccionar 👀`;
        await client.sendMessage(m.chat, { text: texto.trim(), mentions: [...new Set(ganadores.map((g) => g.lid))] });
      }
    }

    // ---- Cierre de la semana anterior (entrada más votada por hashtag) ----
    const semanaAnterior = semanaDe(ahora - 7 * 24 * 60 * 60 * 1000);

    if (!periodoCerrado(m.chat, "semana", semanaAnterior)) {
      marcarPeriodoCerrado(m.chat, "semana", semanaAnterior);
      const lineas = [];
      const mentions = [];
      for (const [tag, config] of Object.entries(HASHTAGS_CONFIG)) {
        const top = entradaMasVotada(m.chat, tag, semanaAnterior);
        if (!top) continue;
        ganarCoins(m.chat, top.usuario, COINS.HISTORIA_SEMANA, `top_semana_${tag}`);
        lineas.push(`${config.emoji} *${config.nombre}*: ${mencion(top.usuario)} con ${top.reacciones} reacciones 🪙 +${COINS.HISTORIA_SEMANA}`);
        mentions.push(top.usuario);
      }
      if (lineas.length > 0) {
        await client.sendMessage(m.chat, { text: `📣 *LO MÁS VOTADO DE LA SEMANA PASADA*\n\n${lineas.join("\n")}`, mentions: [...new Set(mentions)] });
      }
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
