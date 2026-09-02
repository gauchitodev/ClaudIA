let plugin = {};
plugin.cmd = ["bloquear", "desbloquear"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text, command }) => {
  let who;
  const numberRegex = /@[0-9]+/g;
  const numberMatches = text.match(numberRegex);
  if (numberMatches && numberMatches.length > 0) {
    who = numberMatches[0].replace("@", "") + "@lid";
  } else {
    who = m.mentionedJid[0] ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : null;
  }
  if (!who) return;

  if (command === "bloquear") {
    await client.updateBlockStatus(who, "block");
    m.react("☑️");
  } else if (command === "desbloquear") {
    await client.updateBlockStatus(who, "unblock");
    m.react("☑️");
  }
};

export default plugin;
