import { getUser, updateUser } from "../database-functions.js";

const plugin = {};
plugin.cmd = ["rechazar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command, user }) => {
  let who;
  const numberMatches = text.match(/@[0-9\s]+/g);
  if (numberMatches && numberMatches.length > 0) {
    who = `${numberMatches[0].replace("@", "").replace(/\s+/g, "")}@lid`;
  } else if (m.quoted) {
    who = m.quoted.sender;
  }

  if (who) {
    who = getUser(who);
  }

  const whoLid = who?.lid;
  const whoJid = who?.jid;

  if (!whoJid || !whoLid) return client.sendText(m.chat, txt.parejaDefaultWho(usedPrefix, command), m);

  if (whoLid === client.user.lid) return client.sendText(m.chat, txt.parejaWhoBotNull(usedPrefix, command, whoLid), m);
  if (whoLid === m.sender) return client.sendText(m.chat, txt.parejaWhoSender, m);

  const pacar = who?.couple;

  if (m.senderJid === pacar && user.couple === whoJid) {
    const kz = await client.sendText(m.chat, txt.parejaAlready(whoLid), m);
    client.sendMessage(m.chat, { react: { text: "🥰", key: kz.key } });
    return;
  }

  if (pacar !== m.senderJid) {
    return client.sendText(m.chat, txt.parejaNoReject(whoLid), m);
  } else {
    updateUser(whoLid, { couple: "" });
    const kz = await client.sendText(m.chat, txt.parejaRechazar(m.sender, whoLid), m);
    client.sendMessage(m.chat, { react: { text: "💔", key: kz.key } });
  }
};

export default plugin;
