import { getUser } from "../database-functions.js";
import { lidMencionadoActual, esElBot, comoLoEsperan } from "../lib/identidad.js";
import { aceptarPareja, solicitudDe } from "../lib/parejas.js";

// .aceptar @x: accepts x's couple request.
const plugin = {};
plugin.cmd = ["aceptar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  const who = await lidMencionadoActual(client, m, text, participants);
  if (!who || !getUser(who)) return client.sendText(m.chat, txt.parejaDefaultWho(usedPrefix, command), m);
  // With the mentions: of someone the bot knows by their number alone, the "@" in the text tagged nobody (sendText).
  if (esElBot(who, client)) return client.sendText(m.chat, txt.parejaWhoBotNull(usedPrefix, command, who), m, { mentions: [who] });
  if (who === m.sender) return client.sendText(m.chat, txt.parejaWhoSender, m);

  // Asked by their LID, whoever writes from their number alone answers from it (lib/identidad.js), and the couple is
  // that LID's, as everything done to them when they're named.
  const r = aceptarPareja(await comoLoEsperan(client, m, participants, [solicitudDe(who)?.para]), who);
  if (!r.ok) {
    if (r.motivo === "yaJuntos") {
      const kz = await client.sendText(m.chat, txt.parejaAlready(who), m, { mentions: [who] });
      return client.sendMessage(m.chat, { react: { text: "🥰", key: kz.key } });
    }
    if (r.motivo === "parientes") return client.sendText(m.chat, `🤢 ¡Es ${r.parentesco}! Pareja con un familiar no, respete.`, m);
    if (r.motivo === "tenesPareja") return client.sendText(m.chat, txt.parejaInfiel(r.pareja, who), m, { mentions: [r.pareja, who] });
    if (r.motivo === "tienePareja") return client.sendText(m.chat, `@${who.split("@")[0]} ya tiene pareja, respete 🤨`, m, { mentions: [who] });
    return client.sendText(m.chat, txt.parejaNoAccept(who), m, { mentions: [who] });
  }
  const kz = await client.sendText(m.chat, txt.parejaAccept(m.sender, who), m, { mentions: [m.sender, who] });
  client.sendMessage(m.chat, { react: { text: "🥰", key: kz.key } });
};

export default plugin;
