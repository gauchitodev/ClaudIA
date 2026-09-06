import { getUser, updateUser } from "../database-functions.js";

let plugin = (m) => m;
plugin.before = async function (m, { client, user }) {
  const who = m.mentionedJid?.[0] || m.quoted?.sender || m.sender;
  const inGroup = user.inGroup[m.chat];
  if (user.banned) return;

  if (inGroup.afk > -1) {
    await client.sendText(m.chat, txt.afkOff(m.sender, inGroup.afkReason, inGroup.afk), null);
    user.inGroup[m.chat].afk = -1;
    user.inGroup[m.chat].afkReason = "";
    updateUser(m.sender, { inGroup: JSON.stringify(user.inGroup) });
  }

  if (who && who !== m.sender) {
    const hap = getUser(who);
    const whoAfk = hap?.inGroup[m.chat];
    const afkTime = hap?.inGroup[m.chat]?.afk || 0;
    if (afkTime && afkTime > 0) {
      const tiempoInactivo = (Date.now() - afkTime) / 1000;
      if (tiempoInactivo < 10) return;
      const reason = whoAfk.afkReason || "";
      await client.sendText(m.chat, txt.afkOn(reason, whoAfk.afk), m);
    }
  }

  return;
};

export default plugin;
