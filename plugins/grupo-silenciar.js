import { getUser, updateUser } from "../database-functions.js";

const plugin = {};
plugin.cmd = ["silenciar", "mute", "desilenciar", "unmute", "silencio", "hacesilencio"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  let who;
  const numberRegex = /@[0-9]+/g;
  const numberMatches = text.match(numberRegex);
  if (numberMatches && numberMatches.length > 0) {
    who = `${numberMatches[0].replace("@", "")}@lid`;
  } else {
    who = m.mentionedJid[0] ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : null;
  }
  if (!who) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);
  if (who === client.user.lid) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  // no afectar a owners del bot
  const ownerJids = globalThis.owners.map((owner) => `${owner}@s.whatsapp.net`);
  for (const ownerJid of ownerJids) {
    const ownerData = getUser(ownerJid);
    if (who === ownerData?.lid) return m.react("❌");
  }

  const whoData = getUser(who);
  if (!whoData) return client.sendText(m.chat, "No existen datos del usuario, puede que aun no haya enviado mensajes");

  let trueOrFalse;
  if (command === "desilenciar" || command === "unmute") {
    trueOrFalse = false;
  } else {
    trueOrFalse = true;
  }

  const updateInGroup = {
    ...whoData.inGroup,
    [m.chat]: {
      ...whoData.inGroup[m.chat],
      mute: trueOrFalse,
    },
  };

  // actualizar datos de usuario
  updateUser(who, {
    inGroup: JSON.stringify(updateInGroup),
  });

  m.react("☑️");
};

export default plugin;
