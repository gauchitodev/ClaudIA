import { apostar, COINS } from "../lib/urucoins.js";

const plugin = {};
plugin.cmd = ["apostar", "apuesta"];
plugin.economia = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, args }) => {
  const cantidad = parseInt(args[0], 10);
  if (!args[0] || Number.isNaN(cantidad)) {
    return client.sendText(m.chat, `¿Cuánto apostás? Ej: .apostar 20 (mínimo ${COINS.APUESTA_MIN}). Tiene que haber un juego activo.`, m);
  }

  const resultado = apostar(m.chat, m.sender, cantidad);
  if (!resultado.ok) return client.sendText(m.chat, `❌ ${resultado.error}`, m);

  await client.sendText(m.chat, `🎰 Apostaste *${cantidad} UruCoins* en ${resultado.nombreJuego}. Si ganás, cobrás ${cantidad * 2}.`, m);
};

export default plugin;
