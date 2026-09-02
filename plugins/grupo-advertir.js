import { getUser, updateUser } from "../database-functions.js";

let plugin = {};
plugin.cmd = ["advertir", "adv", "warn"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  let who;
  let txtAdv;
  const numberMatches = text.match(/@[0-9\s]+/g);
  if (numberMatches && numberMatches.length > 0) {
    who = numberMatches[0].replace("@", "").replace(/\s+/g, "") + "@lid";
    txtAdv = text.replace(numberMatches[0], "").trim();
  } else {
    who = m.mentionedJid[0] ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : null;
    txtAdv = who ? text.replace(`@${who.replace("@lid", "")}`, "").trim() : null;
  }

  if (!who) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);
  if (who == client.user.lid) return;
  if (!txtAdv) return client.sendText(m.chat, txt.advertirNoRazon, m);

  // no afectar a owners del bot
  const ownerJids = globalThis.owners.map((owner) => owner + "@s.whatsapp.net");
  for (const ownerJid of ownerJids) {
    const ownerData = getUser(ownerJid);
    if (who == ownerData?.lid) return m.react("❌");
  }

  const whoData = getUser(who);
  if (!whoData) return client.sendText(m.chat, "El usuario no está registrado en la base de datos.", m);

  const whoWarns = whoData.warn + 1;
  updateUser(who, { warn: whoWarns });
  if (whoWarns > 3) {
    updateUser(who, { warn: 0 });
    await client.sendText(m.chat, txt.advertirKick(who), m);
    await client.groupParticipantsUpdate(m.chat, [who], "remove");
    return;
  }
  await client.sendText(m.chat, txt.advertirSuccess(who, txtAdv, whoWarns), m);
};

export default plugin;
