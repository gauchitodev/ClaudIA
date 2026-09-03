import { apostarRuleta, textoMesaRuleta, CASINO } from "../lib/casino.js";
import { COINS } from "../lib/urucoins.js";

let plugin = {};
plugin.cmd = ["ruleta"];
plugin.onlyGroup = true;

// .ruleta <cantidad> <apuesta>: la primera apuesta abre la mesa; durante unos segundos apuestan todos, y después
// la bola sale una sola vez para todas las apuestas. .ruleta sin nada muestra la mesa abierta o la ayuda.
plugin.run = async (m, { client, args, chat }) => {
  if (!chat.games) return client.sendText(m.chat, txt.disabledGames, m);
  const cantidad = parseInt(args[0], 10);
  if (!args[0] || Number.isNaN(cantidad)) {
    const mesa = textoMesaRuleta(m.chat);
    if (mesa) return client.sendMessage(m.chat, { text: mesa.texto, mentions: mesa.mentions }, { quoted: m });
    return client.sendText(
      m.chat,
      `🎡 *Ruleta* — uso: .ruleta <cantidad> <apuesta>\n\n▸ rojo, negro, par, impar → paga x2\n▸ 1-12, 13-24, 25-36 → paga x3\n▸ un número del 0 al 36 → paga x36\n\nLa primera apuesta abre la mesa y la bola sale a los ${CASINO.RULETA_SEGUNDOS} segundos, para todas las apuestas juntas. Hasta ${CASINO.RULETA_MAX_APUESTAS_POR_PERSONA} apuestas por persona por giro.\nMínimo ${COINS.APUESTA_MIN}, máximo ${COINS.CASINO_APUESTA_MAX} por apuesta, tope ${COINS.CASINO_TOPE_DIA} por día. La racha y el escudo no aplican en el casino.\nEj: .ruleta 20 rojo`,
      m,
    );
  }
  const r = apostarRuleta(m.chat, m.sender, cantidad, args.slice(1).join(" "), (resultado) => client.sendMessage(m.chat, { text: resultado.texto, mentions: resultado.mentions }));
  if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
  await client.sendMessage(m.chat, { text: r.mensaje, mentions: r.mentions }, { quoted: m });
};

export default plugin;
