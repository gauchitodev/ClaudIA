import { getSaldoCoins, topCoins } from "../database-functions.js";

let plugin = {};
plugin.cmd = ["coins", "urucoins", "saldo"];
plugin.onlyGroup = true;

plugin.run = async (m, { client }) => {
  const saldo = getSaldoCoins(m.chat, m.sender);
  const top = topCoins(m.chat, 5);

  let texto = `🪙 *Tenés ${saldo} UruCoins*\n`;
  if (top.length > 0) {
    texto += `\n*Los más ricos del grupo:*\n`;
    top.forEach((r, i) => {
      texto += `${i + 1}. @${r.usuario.split("@")[0]} — ${r.saldo}\n`;
    });
  }
  texto += `\nSe ganan reaccionando, mandando historias/quejas/recomendaciones y ganando juegos.\nSe gastan con .apostar, .regalar y .playya`;

  await client.sendMessage(m.chat, { text: texto.trim(), mentions: top.map((r) => r.usuario) }, { quoted: m });
};

export default plugin;
