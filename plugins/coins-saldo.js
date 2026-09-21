import { getSaldoCoins } from "../database-functions.js";
import { COINS, apuestaMaxima } from "../lib/urucoins.js";

const plugin = {};
plugin.cmd = ["coins", "urucoins", "saldo", "bal", "balance"];
plugin.economia = true;
plugin.onlyGroup = true;

// Your balance and how much you can bet per play (the fixed cap or 20 % of your balance, whichever is larger). The
// ranking is in .baltop, the inventory in .inventario and the daily streak in .racha.
plugin.run = async (m, { client }) => {
  const saldo = getSaldoCoins(m.chat, m.sender);
  const tope = saldo >= COINS.APUESTA_MIN ? ` · podés apostar hasta ${apuestaMaxima(m.chat, m.sender, COINS.CASINO_APUESTA_MAX)} por jugada` : "";
  await client.sendText(m.chat, `🪙 Tenés *${saldo} UruCoins*${tope}`, m);
};

export default plugin;
