import { getUser } from "../database-functions.js";
import { textoRango, textoRangos } from "../lib/rangos.js";

let plugin = {};
plugin.cmd = ["rango", "rangos"];
plugin.onlyGroup = true;

// .rango → tu rango y qué te falta para el próximo · .rango @persona → el de otra · .rangos → la escalera
plugin.run = async (m, { client, command, text }) => {
  if (command === "rangos") return client.sendText(m.chat, textoRangos(), m);

  let lid = m.sender;
  const mencion = (text || "").match(/@[0-9\s]+/g);
  if (mencion) lid = mencion[0].replace("@", "").replace(/\s+/g, "") + "@lid";
  else if (m.quoted?.sender) lid = m.quoted.sender;

  const user = getUser(lid);
  if (!user) return client.sendText(m.chat, "No tengo datos de esa persona todavía. Cuando escriba algo en el grupo, la conozco.", m);

  const r = textoRango(m.chat, lid, user, lid === m.sender);
  await client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m });
};

export default plugin;
