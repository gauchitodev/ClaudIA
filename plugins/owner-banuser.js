import { updateUser, esOwner } from "../database-functions.js";

let plugin = {};
plugin.cmd = ["banuser", "unbanuser"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  let who;
  const numberMatches = text.match(/@[0-9\s]+/g);
  if (numberMatches && numberMatches.length > 0) {
    who = numberMatches[0].replace("@", "").replace(/\s+/g, "") + "@lid";
  } else {
    who = m.mentionedJid[0] ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : null;
  }
  if (!who) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);
  if (who == client.user.lid) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  // no afectar a owners del bot (antes esto usaba getUser sin importarlo y el comando explotaba siempre)
  if (esOwner(who)) return m.react("❌");

  if (command == "banuser") {
    updateUser(who, { banned: true });
  } else {
    updateUser(who, { banned: false });
  }
  m.react("☑️");
};

export default plugin;
