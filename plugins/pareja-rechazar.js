import { getUser } from "../database-functions.js";
import { lidMencionado } from "../lib/menciones.js";
import { rechazarPareja } from "../lib/parejas.js";

// .rechazar @x: rechaza el pedido de pareja de x.
const plugin = {};
plugin.cmd = ["rechazar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  const who = lidMencionado(m, text);
  if (!who || !getUser(who)) return client.sendText(m.chat, txt.parejaDefaultWho(usedPrefix, command), m);
  if (who === client.user.lid) return client.sendText(m.chat, txt.parejaWhoBotNull(usedPrefix, command, who), m);
  if (who === m.sender) return client.sendText(m.chat, txt.parejaWhoSender, m);

  const r = rechazarPareja(m.sender, who);
  if (!r.ok) {
    if (r.motivo === "yaJuntos") {
      const kz = await client.sendText(m.chat, txt.parejaAlready(who), m);
      return client.sendMessage(m.chat, { react: { text: "🥰", key: kz.key } });
    }
    return client.sendText(m.chat, txt.parejaNoReject(who), m);
  }
  const kz = await client.sendText(m.chat, txt.parejaRechazar(m.sender, who), m);
  client.sendMessage(m.chat, { react: { text: "💔", key: kz.key } });
};

export default plugin;
