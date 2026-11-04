import { getUser, transferirCoins, getSaldoCoins } from "../database-functions.js";
import { contentarPareja } from "../lib/parejas.js";
import { lidMencionadoActual } from "../lib/identidad.js";
import { leerEntero } from "../lib/comandos.js";

const plugin = {};
plugin.cmd = ["regalar", "dar", "transferir"];
plugin.economia = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, text, args, participants }) => {
  // who to: the mention, or the quoted message's author (with the old regex, ".regalar @persona 20" swallowed the 20)
  const who = await lidMencionadoActual(client, m, text, participants);
  const destinatario = who ? getUser(who) : null;

  // how much: the first number in the arguments that isn't part of the mention
  // The first word that is an amount, written as people write it here (lib/comandos.js): "1.000 por 2 cafés" is a
  // thousand, and it gave 2.
  const cantidad = args.map((a) => leerEntero(a)).find((n) => n !== null) ?? NaN;

  if (!destinatario?.lid || Number.isNaN(cantidad)) {
    return client.sendText(m.chat, "Uso: .regalar @persona 20 (o respondé a un mensaje suyo con .regalar 20)", m);
  }
  if (destinatario.lid === m.sender) return client.sendText(m.chat, "Regalarte a vos mismo no cuenta 😅", m);
  if (cantidad <= 0) return client.sendText(m.chat, "Tiene que ser una cantidad positiva.", m);

  if (!transferirCoins(m.chat, m.sender, destinatario.lid, cantidad)) {
    return client.sendText(m.chat, `No te alcanza — tenés ${getSaldoCoins(m.chat, m.sender)} UruCoins.`, m);
  }

  // a gift to your partner gets them over a huff, if there was one
  const reconciliado = contentarPareja(m.sender, destinatario.lid);
  await client.sendMessage(
    m.chat,
    { text: `🎁 Le regalaste *${cantidad} UruCoins* a @${destinatario.lid.split("@")[0]}. Te quedan ${getSaldoCoins(m.chat, m.sender)}.${reconciliado ? "\n💞 Y a tu pareja se le pasó el enojo." : ""}`, mentions: [destinatario.lid] },
    { quoted: m },
  );
};

export default plugin;
