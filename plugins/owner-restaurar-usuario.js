import { getUser, deleteUser } from "../database-functions.js";

let plugin = {};
plugin.cmd = ["rd", "resetuser", "userreset", "restaurarusuario"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  let who;
  const numberMatches = text.match(/@[0-9\s]+/g);
  const numberMatchesPlus = text.match(/\+[0-9\s]+/g);
  if (numberMatchesPlus && numberMatchesPlus.length > 0) {
    who = numberMatchesPlus[0].replace(/[+\s]/g, "") + "@s.whatsapp.net";
  } else if (numberMatches && numberMatches.length > 0) {
    who = numberMatches[0].replace("@", "").replace(/\s+/g, "") + "@lid";
  } else if (m.quoted) {
    who = m.quoted.sender;
  }

  if (who && !who.endsWith("@lid")) {
    const whoData = getUser(who);
    who = whoData?.lid || null;
  }

  if (!who) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  // no afectar a owners del bot
  const ownerJids = globalThis.owners.map((owner) => owner + "@s.whatsapp.net");
  for (const ownerJid of ownerJids) {
    const ownerData = getUser(ownerJid);
    if (who === ownerData?.lid && m.sender !== who) return m.react("❌");
  }

  // eliminar usuario de la db.
  deleteUser(who);
  client.sendText(m.chat, txt.rdSuccess(who), m);
};

export default plugin;
