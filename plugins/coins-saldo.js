import { getSaldoCoins, topCoins } from "../database-functions.js";
import { textoInventario } from "../lib/tienda.js";
import { textoRacha } from "../lib/actividad.js";

let plugin = {};
plugin.cmd = ["coins", "urucoins", "saldo"];
plugin.onlyGroup = true;

plugin.run = async (m, { client, user }) => {
  const saldo = getSaldoCoins(m.chat, m.sender);
  const top = topCoins(m.chat, 5);

  let texto = `🪙 *Tenés ${saldo} UruCoins*\n`;

  const racha = textoRacha(m.chat, m.sender);
  if (racha) texto += `${racha}\n`;

  const inventario = textoInventario(m.chat, m.sender, user);
  if (inventario) texto += `\n🎒 *En tu inventario:*\n${inventario}\n`;

  if (top.length > 0) {
    texto += `\n*Los más ricos del grupo:*\n`;
    top.forEach((r, i) => {
      texto += `${i + 1}. @${r.usuario.split("@")[0]} — ${r.saldo}\n`;
    });
  }
  texto += `\nSe ganan reaccionando, mandando historias/quejas/recomendaciones y ganando juegos.\nSe gastan con .apostar, .regalar, .playya y en la .tienda`;

  await client.sendMessage(m.chat, { text: texto.trim(), mentions: top.map((r) => r.usuario) }, { quoted: m });
};

export default plugin;
