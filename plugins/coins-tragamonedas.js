import { jugarTragamonedas, textoPagosTragamonedas } from "../lib/casino.js";
import { COINS } from "../lib/urucoins.js";

const plugin = {};
plugin.cmd = ["tragamonedas", "slot", "slots"];
plugin.economia = true;
plugin.juego = true;
plugin.casino = true; // el horario de .horariojuegos frena solo estos
plugin.onlyGroup = true;

plugin.run = async (m, { client, args, chat }) => {
  const cantidad = parseInt(args[0], 10);
  if (!args[0] || Number.isNaN(cantidad)) {
    return client.sendText(
      m.chat,
      `🎰 *Tragamonedas* — uso: .tragamonedas <cantidad>\n\n${textoPagosTragamonedas()}\n\nMínimo ${COINS.APUESTA_MIN}, máximo ${COINS.CASINO_APUESTA_MAX} por jugada, tope ${COINS.CASINO_TOPE_DIA} por día. La racha y el escudo no aplican en el casino.\nEj: .tragamonedas 10`,
      m,
    );
  }
  const r = jugarTragamonedas(m.chat, m.sender, cantidad);
  await client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
