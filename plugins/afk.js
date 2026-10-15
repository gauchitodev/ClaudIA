import { updateUserInGroup } from "../database-functions.js";

const plugin = {};
plugin.cmd = ["afk"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, args, user }) => {
  if (!text) return client.sendText(m.chat, txt.afk, m);

  if (args.length >= 1) {
    text = args.slice(0).join(" ");
  } else if (m.quoted && m.quoted.text) {
    text = m.quoted.text;
  } else return;

  // Only these two fields, over the row as it is now: "user" was read when the message arrived, and writing it back
  // whole undid whatever changed in between (a mute, a warning).
  updateUserInGroup(m.sender, m.chat, { afk: Date.now(), afkReason: text });
  await client.sendText(m.chat, txt.afkSuccess(m.sender, text), m);
};

export default plugin;
