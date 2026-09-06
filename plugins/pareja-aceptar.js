import { getUser } from "../database-functions.js";
import { lidMencionado } from "../lib/menciones.js";
import { aceptarPareja } from "../lib/parejas.js";

// .aceptar @x: acepta el pedido de pareja de x.
const plugin = {};
plugin.cmd = ["aceptar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  const who = lidMencionado(m, text);
  if (!who || !getUser(who)) return client.sendText(m.chat, txt.parejaDefaultWho(usedPrefix, command), m);
  if (who === client.user.lid) return client.sendText(m.chat, txt.parejaWhoBotNull(usedPrefix, command, who), m);
  if (who === m.sender) return client.sendText(m.chat, txt.parejaWhoSender, m);

  const r = aceptarPareja(m.sender, who);
  if (!r.ok) {
    if (r.motivo === "yaJuntos") {
      const kz = await client.sendText(m.chat, txt.parejaAlready(who), m);
      return client.sendMessage(m.chat, { react: { text: "🥰", key: kz.key } });
    }
    if (r.motivo === "tenesPareja") return client.sendText(m.chat, txt.parejaInfiel(r.pareja, who), m);
    if (r.motivo === "tienePareja") return client.sendText(m.chat, `@${who.split("@")[0]} ya tiene pareja, respete 🤨`, m, { mentions: [who] });
    return client.sendText(m.chat, txt.parejaNoAccept(who), m);
  }
  const kz = await client.sendText(m.chat, txt.parejaAccept(m.sender, who), m);
  client.sendMessage(m.chat, { react: { text: "🥰", key: kz.key } });
};

export default plugin;
