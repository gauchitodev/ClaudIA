import { getSaldoCoins } from "../database-functions.js";
import { COINS, apuestaMaxima } from "../lib/urucoins.js";
import { deQuienEsActual, noSeDeQuien } from "../lib/identidad.js";
import { nombreDe } from "../lib/menciones.js";

const plugin = {};
plugin.cmd = ["coins", "urucoins", "saldo", "bal", "balance"];
plugin.economia = true;
plugin.onlyGroup = true;

// Your balance and how much you can bet per play (the fixed cap or 20 % of your balance, whichever is larger), or with
// .bal @persona (or replying to one of their messages) someone else's, named without tagging them, as .mitimba does.
// The ranking is in .baltop, the inventory in .inventario and the daily streak in .racha.
plugin.run = async (m, { client, text, participants }) => {
  const lid = await deQuienEsActual(client, m, text, participants);
  if (!lid) return client.sendText(m.chat, `🪙 ${noSeDeQuien("el saldo", ".bal")}`, m);

  const propio = lid === m.sender;
  const saldo = getSaldoCoins(m.chat, lid);
  const tope = saldo >= COINS.APUESTA_MIN ? ` · ${propio ? "podés" : "puede"} apostar hasta ${apuestaMaxima(m.chat, lid, COINS.CASINO_APUESTA_MAX)} por jugada` : "";
  await client.sendText(m.chat, `🪙 ${propio ? "Tenés" : `${nombreDe(lid)} tiene`} *${saldo} UruCoins*${tope}`, m);
};

export default plugin;
