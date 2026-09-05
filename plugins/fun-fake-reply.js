import { getUser } from "../database-functions.js";

let plugin = {};
plugin.cmd = ["fakereply", "fr"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  if (!text) return client.sendText(m.chat, `Uso incorrecto.\nEjemplo:\n${usedPrefix}${command} *textoDelBot* @usuario *textoFake*`, m);

  let who;
  const numberMatches = text.match(/@[0-9]+/g);
  if (numberMatches && numberMatches.length > 0) {
    who = numberMatches[0].replace("@", "") + "@lid";
  } else {
    who = m.mentionedJid[0] ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : null;
  }

  if (!who) return client.sendText(m.chat, `Uso incorrecto.\nEjemplo:\n${usedPrefix}${command} *textoDelBot* @usuario *textoFake*`, m);

  // no afectar a owners del bot
  const ownerJids = globalThis.owners.map((owner) => owner + "@s.whatsapp.net");
  for (const ownerJid of ownerJids) {
    const ownerData = getUser(ownerJid);
    if (who === ownerData?.lid) return m.react("❌");
  }

  const sp = "@" + who.split`@`[0];
  const splitText = text.split(sp);

  if (splitText.length < 2) return;

  let firstPart = splitText[0].trim();
  let thirdPart = splitText.slice(1).join(sp).trim();

  let quotedMessage = {
    key: {
      participant: who,
    },
    message: {
      extendedTextMessage: {
        text: thirdPart,
      },
    },
  };

  await client.sendMessage(m.chat, { text: firstPart, mentions: client.parseMention(firstPart) }, { quoted: quotedMessage, ephemeralExpiration: 24 * 60 * 100 });
};

export default plugin;
