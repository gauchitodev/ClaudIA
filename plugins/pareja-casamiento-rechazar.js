import { getUser, updateUser } from "../database-functions.js";

let plugin = {};
plugin.cmd = ["no"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, user }) => {
  const pareja = user.couple;
  if (pareja === "") return client.sendText(m.chat, txt.parejaCasamientoNull, m);

  const matrim = user.married;
  const parejaData = getUser(pareja);
  const parejaLid = parejaData?.lid;

  if (!parejaLid || !parejaData) {
    updateUser(m.sender, { couple: "", coupleTime: -1 });
    return client.sendText(m.chat, "Tu pareja ya no existe en la base de datos.", m);
  }

  // Solo vale entre parejas oficiales (relación mutua).
  if (parejaData.couple !== m.senderJid) return;

  const matrimPasan = parejaData?.married;
  const pTime = user.coupleTime;
  const currentTime = new Date() - pTime;

  if (m.senderJid === matrimPasan && matrim === pareja) return client.sendText(m.chat, txt.parejaCasamientoAlready, m);
  if (currentTime < 604800000) return client.sendText(m.chat, txt.parejaCasamientoNoTime, m);

  // Solo se rechaza una propuesta que la pareja le hizo a esta persona (antes cualquier valor en "married" alcanzaba).
  if (matrimPasan === m.senderJid) {
    updateUser(parejaLid, { married: "" });
    const kz = await client.sendText(m.chat, txt.parejaCasamientoRechazar(m.sender, parejaLid), m);
    client.sendMessage(m.chat, { react: { text: "💔", key: kz.key } });
  } else return;
};

export default plugin;
