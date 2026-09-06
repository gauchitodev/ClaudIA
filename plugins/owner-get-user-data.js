import { getUser } from "../database-functions.js";

const plugin = {};
plugin.cmd = ["id"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  let who, whoData, whoLid, whoJid, whoPushName;
  const numberMatches = text.match(/@[0-9\s]+/g);
  const numberMatchesPlus = text.match(/\+[0-9\s]+/g);
  if (numberMatchesPlus && numberMatchesPlus.length > 0) {
    who = `${numberMatchesPlus[0].replace(/[+\s]/g, "")}@s.whatsapp.net`;
  } else if (numberMatches && numberMatches.length > 0) {
    who = `${numberMatches[0].replace("@", "").replace(/\s+/g, "")}@lid`;
  } else if (m.quoted) {
    who = m.quoted.sender;
  }

  if (who) {
    whoData = getUser(who);
    whoLid = whoData?.lid || "";
    whoJid = whoData?.jid || "";
    whoPushName = whoData?.pushName || "";
  }

  if (!who && !whoLid) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  // Ojo: no llamar "txt" a esta variable, pisa el global de textos y rompe txt.defaultWho más arriba.
  const info = `Usuario: +${whoJid.split("@")[0]}\n\nNombre actual: ${whoPushName}\n\nLid: ${whoLid}\n\nChat actual: ${m.chat}`;
  client.sendText(m.chat, info, m);
};

export default plugin;
