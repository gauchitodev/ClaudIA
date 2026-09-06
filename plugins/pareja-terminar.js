import { esOwner } from "../database-functions.js";
import { parejaDe, terminarPareja } from "../lib/parejas.js";

// .terminar: corta la relación; la otra persona pasa a la lista de ex de cada uno.
const plugin = {};
plugin.cmd = ["terminar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client }) => {
  // owners narcisistas que no permiten que les terminen la pareja.
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
