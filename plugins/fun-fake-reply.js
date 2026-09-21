import { esOwner } from "../database-functions.js";
import { destinatario } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["fakereply", "fr"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  if (!text) return client.sendText(m.chat, `Uso incorrecto.\nEjemplo:\n${usedPrefix}${command} *textoDelBot* @usuario *textoFake*`, m);

  const { objetivo: who, lid, jid, mencionado } = destinatario(m, text, participants);
  if (!mencionado) return client.sendText(m.chat, `Uso incorrecto.\nEjemplo:\n${usedPrefix}${command} *textoDelBot* @usuario *textoFake*`, m);

  // leave the bot's owners alone
  if (esOwner(mencionado) || (lid && esOwner(lid)) || (jid && esOwner(jid))) return m.react("❌");

  // The text is split on the "@number" exactly as written, which may not be the id the person resolved to: splitting
  // on the resolved one would cut the message in the wrong place.
  const sp = text.match(/@\d{3,}/)?.[0] || `@${String(who).split("@")[0]}`;
  const splitText = text.split(sp);

  if (splitText.length < 2) return;

  const firstPart = splitText[0].trim();
  const thirdPart = splitText.slice(1).join(sp).trim();

  const quotedMessage = {
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
