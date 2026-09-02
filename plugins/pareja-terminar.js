import { getUser, updateUser } from "../database-functions.js";

let plugin = {};
plugin.cmd = ["terminar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, user }) => {
  const pareja = user.couple;
  const parejaData = getUser(pareja);
  const parejaLid = parejaData?.lid;
  const parejaCouple = parejaData?.couple;

  // owners narcisistas que no permiten que les terminen la pareja.
  const ownerJids = globalThis.owners.map((owner) => owner + "@s.whatsapp.net");
  for (const ownerJid of ownerJids) {
    const ownerData = getUser(ownerJid);
    const ownerCouple = ownerData?.couple;
    if (user.couple === ownerJid && ownerCouple === m.senderJid) {
      const sendOwner = globalThis.owners[0] + "@s.whatsapp.net";
      if (ownerJid === globalThis.owners[0] + "@s.whatsapp.net") client.sendText(sendOwner, "", m);
      return;
    }
  }

  if (user.couple == "") {
    const kz = await client.sendText(m.chat, txt.parejaTerminarNull(m.sender), m);
    client.sendMessage(m.chat, { react: { text: "🤣", key: kz.key } });
    return;
  }

  if (m.senderJid == parejaCouple) {
    const kz = await client.sendText(m.chat, txt.parejaTerminarSuccess(m.sender), m);
    client.sendMessage(m.chat, { react: { text: "💔", key: kz.key } });

    // Añadir al historial de parejas
    const historySender = Array.isArray(user.couplesHistory) ? user.couplesHistory : [];
    const historyTarget = Array.isArray(parejaData?.couplesHistory) ? parejaData.couplesHistory : [];

    const esNuevaParejaM = !historySender.includes(pareja);
    const esNuevaParejaW = !historyTarget.includes(m.senderJid);

    if (esNuevaParejaM) historySender.push(pareja);
    if (esNuevaParejaW) historyTarget.push(m.senderJid);

    // actualizar ambos usuarios en db
    updateUser(m.sender, { couplesHistory: JSON.stringify(historySender), couple: "", coupleTime: -1, married: "", marriedTime: -1 });
    updateUser(parejaLid, { couplesHistory: JSON.stringify(historyTarget), couple: "", coupleTime: -1, married: "", marriedTime: -1 });
  } else {
    const kz = await client.sendText(m.chat, txt.parejaTerminarNull(m.sender), m);
    client.sendMessage(m.chat, { react: { text: "🤣", key: kz.key } });
  }
};

export default plugin;
