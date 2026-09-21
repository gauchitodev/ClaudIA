import { proponerCasamiento } from "../lib/parejas.js";

// .casarse: proposes marriage to your partner. A week of relationship is required.
const plugin = {};
plugin.cmd = ["casarse", "casarme", "boda", "matrimonio", "casar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, usedPrefix }) => {
  const r = proponerCasamiento(m.sender);
  if (!r.ok) {
    if (r.motivo === "sinPareja") return client.sendText(m.chat, txt.parejaCasamientoNull, m);
    if (r.motivo === "yaCasados") return client.sendText(m.chat, txt.parejaCasamientoAlready, m);
    if (r.motivo === "pocoTiempo") return client.sendText(m.chat, txt.parejaCasamientoNoTime, m);
    if (r.motivo === "yaTePropuso") return client.sendText(m.chat, `Tu pareja ya te propuso casamiento! Responde su propuesta con:\n\n${usedPrefix}si\n${usedPrefix}no`, m);
    return;
  }
  const kz = await client.sendText(m.chat, txt.parejaCasamientoPropuesta(m.sender, r.pareja), m);
  client.sendMessage(m.chat, { react: { text: "😳", key: kz.key } });
};

export default plugin;
