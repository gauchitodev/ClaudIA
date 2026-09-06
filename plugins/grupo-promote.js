const plugin = {};
plugin.cmd = ["p", "promote"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  let who;
  const numberMatches = text.match(/@[0-9\s]+/g);
  if (numberMatches && numberMatches.length > 0) {
    who = `${numberMatches[0].replace("@", "").replace(/\s+/g, "")}@lid`;
  } else if (m.quoted) {
    who = m.quoted.sender;
  }

  if (!who) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  await client.groupParticipantsUpdate(m.chat, [who], "promote");
};

export default plugin;
