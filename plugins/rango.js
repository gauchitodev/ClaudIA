import { getUser } from "../database-functions.js";
import { lidMencionado } from "../lib/menciones.js";
import { textoRango, textoRangos } from "../lib/rangos.js";

const plugin = {};
plugin.cmd = ["rango", "rangos"];
plugin.onlyGroup = true;

// .rango → your rank and what's left to the next · .rango @person → someone else's · .rangos → the ladder
plugin.run = async (m, { client, command, text }) => {
  if (command === "rangos") return client.sendText(m.chat, textoRangos(), m);

  const lid = lidMencionado(m, text) || m.sender;

  const user = getUser(lid);
  if (!user) return client.sendText(m.chat, "No tengo datos de esa persona todavía. Cuando escriba algo en el grupo, la conozco.", m);

  const r = textoRango(m.chat, lid, user, lid === m.sender);
  await client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m });
};

export default plugin;
