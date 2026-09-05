import { getUser, updateUser } from "../database-functions.js";

let plugin = {};
plugin.cmd = ["unwarn", "quitaradvertencia"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  let who;
  const numberMatches = text.match(/@[0-9\s]+/g);
  if (numberMatches && numberMatches.length > 0) {
    who = numberMatches[0].replace("@", "").replace(/\s+/g, "") + "@lid";
  } else {
    who = m.mentionedJid[0] ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : null;
  }

  if (!who) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);
  if (who === client.user.lid) return;

  const whoData = getUser(who);
  if (!whoData) return client.sendText(m.chat, "El usuario no está registrado en la base de datos.", m);

  if (whoData.warn === 0) return client.sendText(m.chat, "El usuario no tiene advertencias.", m);

  if (whoData.warn > 0) {
    const whoWarns = (whoData.warn -= 1);
    updateUser(who, { warn: whoWarns });
    await client.sendText(m.chat, txt.advertirDeleteSuccess(who, whoWarns), m);
  }
};

export default plugin;
