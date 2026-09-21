import { esOwner } from "../database-functions.js";
import { parejaDe, terminarPareja } from "../lib/parejas.js";

// .terminar: ends the relationship; each of them lands on the other's list of exes.
const plugin = {};
plugin.cmd = ["terminar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client }) => {
  // narcissistic owners who don't allow anyone to break up with them.
  const actual = parejaDe(m.sender);
  if (actual && esOwner(actual.pareja)) return client.sendText(m.chat, "Con un owner no se termina, mi amor 😌", m);

  const r = terminarPareja(m.sender);
  if (!r.ok) {
    const kz = await client.sendText(m.chat, txt.parejaTerminarNull(m.sender), m);
    return client.sendMessage(m.chat, { react: { text: "🤣", key: kz.key } });
  }
  const kz = await client.sendText(m.chat, txt.parejaTerminarSuccess(m.sender), m);
  client.sendMessage(m.chat, { react: { text: "💔", key: kz.key } });
};

export default plugin;
