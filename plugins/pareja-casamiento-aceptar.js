import { getUser, updateUser } from "../database-functions.js";
import { setTimeout as esperar } from "node:timers/promises";

const plugin = {};
plugin.cmd = ["si"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, user }) => {
  const pareja = user.couple;
  if (pareja === "") return client.sendText(m.chat, txt.parejaCasamientoNull, m);

  const pTime = user.coupleTime;
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
  const currentTime = Date.now() - pTime;

  if (m.senderJid === matrimPasan && matrim === pareja) return client.sendText(m.chat, txt.parejaCasamientoAlready, m);
  if (currentTime < 604800000) return client.sendText(m.chat, txt.parejaCasamientoNoTime, m);

  if (matrimPasan === m.senderJid && (!matrim || matrim === "")) {
    updateUser(m.sender, { married: pareja, marriedTime: Date.now() });
    updateUser(parejaLid, { marriedTime: Date.now() });

    const kz = await client.sendText(m.chat, txt.parejaCasamientoSuccess(m.sender, parejaLid), m);
    await esperar(700);
    for (const emoji of ["💗", "❤️‍🔥", "🩵", "💚", "💛", "🩷", "❤️"]) {
      await client.sendMessage(m.chat, { react: { text: emoji, key: kz.key } });
      await esperar(700);
    }
  } else return;
};

export default plugin;
