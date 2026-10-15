import { getUser, updateUserInGroup } from "../database-functions.js";

const plugin = (m) => m;
plugin.before = async (m, { client, user }) => {
  const who = m.mentionedJid?.[0] || m.quoted?.sender || m.sender;
  if (user.banned) return;

  // Whoever was AFK and writes is back. Read and cleared over the row as it is now, and before the notice waits its
  // turn (lib/envios.js): writing back the "user" read when the message arrived undid whatever changed in between (a
  // .silenciar, an .adv), and a second quick message still saw the AFK and announced the return again.
  const propio = getUser(m.sender)?.inGroup?.[m.chat];
  if (propio?.afk > -1) {
    updateUserInGroup(m.sender, m.chat, { afk: -1, afkReason: "" });
    if (user.inGroup?.[m.chat]) Object.assign(user.inGroup[m.chat], { afk: -1, afkReason: "" });
    await client.sendText(m.chat, txt.afkOff(m.sender, propio.afkReason, propio.afk), null);
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
