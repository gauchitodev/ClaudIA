import { updateUser } from "../database-functions.js";

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

  const newInGroup = {
    ...user.inGroup,
    [m.chat]: {
      ...user.inGroup[m.chat],
      afk: Date.now(),
      afkReason: text,
    },
  };

  // actualizar datos de usuario
  updateUser(m.sender, {
    inGroup: JSON.stringify(newInGroup),
  });
  await client.sendText(m.chat, txt.afkSuccess(m.sender, text), m);
};

export default plugin;
