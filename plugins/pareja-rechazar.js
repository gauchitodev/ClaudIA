import { getUser } from "../database-functions.js";
import { lidMencionadoActual, esElBot } from "../lib/identidad.js";
import { rechazarPareja } from "../lib/parejas.js";

// .rechazar @x: turns down x's couple request.
const plugin = {};
plugin.cmd = ["rechazar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  const who = await lidMencionadoActual(client, m, text, participants);
  if (!who || !getUser(who)) return client.sendText(m.chat, txt.parejaDefaultWho(usedPrefix, command), m);
  // With the mentions: of someone the bot knows by their number alone, the "@" in the text tagged nobody (sendText).
  if (esElBot(who, client)) return client.sendText(m.chat, txt.parejaWhoBotNull(usedPrefix, command, who), m, { mentions: [who] });
  if (who === m.sender) return client.sendText(m.chat, txt.parejaWhoSender, m);

  const r = rechazarPareja(m.sender, who);
  if (!r.ok) {
    if (r.motivo === "yaJuntos") {
      const kz = await client.sendText(m.chat, txt.parejaAlready(who), m, { mentions: [who] });
      return client.sendMessage(m.chat, { react: { text: "🥰", key: kz.key } });
    }
    return client.sendText(m.chat, txt.parejaNoReject(who), m, { mentions: [who] });
  }
  const kz = await client.sendText(m.chat, txt.parejaRechazar(m.sender, who), m, { mentions: [m.sender, who] });
  client.sendMessage(m.chat, { react: { text: "💔", key: kz.key } });
};

export default plugin;
