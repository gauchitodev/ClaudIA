import { esOwner } from "../database-functions.js";

let plugin = {};
plugin.cmd = ["k", "kick", "andate", "morite", "chau"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, participants, text, groupMetadata, usedPrefix, command }) => {
  try {
    let who;
    const numberMatches = text.match(/@[0-9\s]+/g);
    if (numberMatches && numberMatches.length > 0) {
      who = numberMatches[0].replace("@", "").replace(/\s+/g, "") + "@lid";
    } else if (m.quoted) {
      who = m.quoted.sender;
    }
    if (!who) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

    if (who === client.user.lid) return client.sendText(m.chat, `No me quiero ir 😔😭`, m);
    if (esOwner(who)) return client.sendText(m.chat, `A los dueños del bot no los saco.`, m);
    const groupAdmins = participants.filter((p) => p.admin);
    const owner = groupMetadata.owner || groupAdmins.find((p) => p.admin === "superadmin")?.id || m.chat.split`-`[0] + "@lid";

    if (who === owner) {
      m.react("❌");
      client.sendText(m.chat, txt.kickOwner(who), m);
    } else if (who) {
      await m.quoted?.delete();
      await delay(300);
      await m.delete();
      await delay(1000);
      await client.groupParticipantsUpdate(m.chat, [who], "remove");
    } else return m.react("❌");
  } catch (e) {
    console.log(e);
  }
};

export default plugin;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
