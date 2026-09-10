import { getSaldoCoins } from "../database-functions.js";
import { COINS, apuestaMaxima } from "../lib/urucoins.js";

const plugin = {};
plugin.cmd = ["coins", "urucoins", "saldo", "bal", "balance"];
plugin.economia = true;
plugin.onlyGroup = true;

// Tu saldo y hasta cuánto podés apostar por jugada (el tope fijo o el 20 % del saldo, lo que sea mayor). El ranking
// está en .baltop, el inventario en .inventario y la racha diaria en .racha.
plugin.run = async (m, { client }) => {
  const saldo = getSaldoCoins(m.chat, m.sender);
  const tope = saldo >= COINS.APUESTA_MIN ? ` · podés apostar hasta ${apuestaMaxima(m.chat, m.sender, COINS.CASINO_APUESTA_MAX)} por jugada` : "";
  await client.sendText(m.chat, `🪙 Tenés *${saldo} UruCoins*${tope}`, m);
};

export default plugin;
