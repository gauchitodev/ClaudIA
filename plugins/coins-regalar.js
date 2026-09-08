import { getUser, transferirCoins, getSaldoCoins } from "../database-functions.js";
import { contentarPareja } from "../lib/parejas.js";
import { lidMencionado } from "../lib/menciones.js";

const plugin = {};
plugin.cmd = ["regalar", "dar", "transferir"];
plugin.economia = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, text, args }) => {
  // a quién: la mención, o el autor del mensaje citado (con la regex vieja, ".regalar @persona 20" se tragaba el 20)
  const who = lidMencionado(m, text);
  const destinatario = who ? getUser(who) : null;

  // cuánto: el primer número que aparezca en los argumentos que no sea parte de la mención
  const cantidad = parseInt(args.find((a) => /^\d+$/.test(a)), 10);

  if (!destinatario?.lid || Number.isNaN(cantidad)) {
    return client.sendText(m.chat, "Uso: .regalar @persona 20 (o respondé a un mensaje suyo con .regalar 20)", m);
  }
  if (destinatario.lid === m.sender) return client.sendText(m.chat, "Regalarte a vos mismo no cuenta 😅", m);
  if (cantidad <= 0) return client.sendText(m.chat, "Tiene que ser una cantidad positiva.", m);

  if (!transferirCoins(m.chat, m.sender, destinatario.lid, cantidad)) {
    return client.sendText(m.chat, `No te alcanza — tenés ${getSaldoCoins(m.chat, m.sender)} UruCoins.`, m);
  }

  // un regalo a la pareja le pasa el enojo, si lo había
  const reconciliado = contentarPareja(m.sender, destinatario.lid);
  await client.sendMessage(
    m.chat,
    { text: `🎁 Le regalaste *${cantidad} UruCoins* a @${destinatario.lid.split("@")[0]}. Te quedan ${getSaldoCoins(m.chat, m.sender)}.${reconciliado ? "\n💞 Y a tu pareja se le pasó el enojo." : ""}`, mentions: [destinatario.lid] },
    { quoted: m },
  );
};

export default plugin;
