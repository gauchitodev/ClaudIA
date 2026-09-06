import { getUser, transferirCoins, getSaldoCoins } from "../database-functions.js";

const plugin = {};
plugin.cmd = ["regalar", "dar", "transferir"];
plugin.economia = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, text, args }) => {
  // a quién: mencionado en el texto, o el autor del mensaje citado
  let who;
  const numberMatches = text.match(/@[0-9\s]+/g);
  if (numberMatches && numberMatches.length > 0) {
    who = `${numberMatches[0].replace("@", "").replace(/\s+/g, "")}@lid`;
  } else if (m.quoted) {
    who = m.quoted.sender;
  }
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

  await client.sendMessage(
    m.chat,
    { text: `🎁 Le regalaste *${cantidad} UruCoins* a @${destinatario.lid.split("@")[0]}. Te quedan ${getSaldoCoins(m.chat, m.sender)}.`, mentions: [destinatario.lid] },
    { quoted: m },
  );
};

export default plugin;
