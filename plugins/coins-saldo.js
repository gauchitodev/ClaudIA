import { getSaldoCoins } from "../database-functions.js";

let plugin = {};
plugin.cmd = ["coins", "urucoins", "saldo", "bal", "balance"];
plugin.onlyGroup = true;

// Solo tu saldo. El ranking está en .baltop, el inventario en .inventario y la racha diaria en .racha.
plugin.run = async (m, { client }) => {
  await client.sendText(m.chat, `🪙 Tenés *${getSaldoCoins(m.chat, m.sender)} UruCoins*`, m);
};

export default plugin;
