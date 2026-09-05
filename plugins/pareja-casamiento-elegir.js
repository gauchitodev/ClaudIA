import { getUser, updateUser } from "../database-functions.js";

let plugin = {};
plugin.cmd = ["casarse", "casarme", "boda", "matrimonio", "casar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, usedPrefix, user }) => {
  const pasan = user.couple;
  if (pasan === "") return client.sendText(m.chat, txt.parejaCasamientoNull, m);

  const pTime = user.coupleTime;
  const matrim = user.married;
  const parejaData = getUser(pasan);
  const parejaLid = parejaData?.lid;
  if (!parejaLid || !parejaData) {
    // la pareja no existe en DB, se limpia la relación.
    updateUser(m.sender, { couple: "", coupleTime: -1, married: "", marriedTime: -1 });
    return client.sendText(m.chat, "Tu pareja ya no existe en la base de datos.", m);
  }

  // Solo se puede proponer casamiento a una pareja oficial (relación mutua), no a alguien con un pedido pendiente.
  if (parejaData.couple !== m.senderJid) return client.sendText(m.chat, "Todavía no son pareja oficial: falta que acepte tu pedido con .aceptar.", m);

  const matrimPasan = parejaData?.married;
  let currentTime = new Date() - pTime;
  if (m.senderJid === matrimPasan && matrim === pasan) return client.sendText(m.chat, txt.parejaCasamientoAlready, m);
  if (currentTime < 604800000) return client.sendText(m.chat, txt.parejaCasamientoNoTime, m);

  if (matrimPasan === m.senderJid && user.married !== parejaData?.jid) return client.sendText(m.chat, `Tu pareja ya te propuso casamiento! Responde su propuesta con:\n\n${usedPrefix}si\n${usedPrefix}no`, m);

  if (pasan !== "") {
    updateUser(m.sender, { married: pasan });
    const kz = await client.sendText(m.chat, txt.parejaCasamientoPropuesta(m.sender, parejaLid), m);
    client.sendMessage(m.chat, { react: { text: "😳", key: kz.key } });
  } else return;
};

export default plugin;
