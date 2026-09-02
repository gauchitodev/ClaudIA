import { jugarRuleta } from "../lib/casino.js";
import { COINS } from "../lib/urucoins.js";

let plugin = {};
plugin.cmd = ["ruleta"];
plugin.onlyGroup = true;

plugin.run = async (m, { client, args, chat }) => {
  if (!chat.games) return client.sendText(m.chat, txt.disabledGames, m);
  const cantidad = parseInt(args[0], 10);
  if (!args[0] || Number.isNaN(cantidad)) {
    return client.sendText(
      m.chat,
      `🎡 *Ruleta* — uso: .ruleta <cantidad> <apuesta>\n\n▸ rojo, negro, par, impar → paga x2\n▸ 1-12, 13-24, 25-36 → paga x3\n▸ un número del 0 al 36 → paga x36\n\nMínimo ${COINS.APUESTA_MIN}, máximo ${COINS.CASINO_APUESTA_MAX} por jugada, tope ${COINS.CASINO_TOPE_DIA} por día. La racha y el escudo no aplican en el casino.\nEj: .ruleta 20 rojo`,
      m,
    );
  }
  const r = jugarRuleta(m.chat, m.sender, cantidad, args.slice(1).join(" "));
  await client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
