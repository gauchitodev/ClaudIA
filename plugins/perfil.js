import { getUser } from "../database-functions.js";
import { textoPerfil } from "../lib/perfil.js";

let plugin = {};
plugin.cmd = ["perfil", "ficha"];
plugin.onlyGroup = true;

// .perfil → tu ficha · .perfil @persona, o respondiendo a un mensaje suyo → la de esa persona
plugin.run = async (m, { client, text }) => {
  let lid = m.sender;
  const mencion = (text || "").match(/@[0-9\s]+/g);
  if (mencion) lid = mencion[0].replace("@", "").replace(/\s+/g, "") + "@lid";
  else if (m.quoted?.sender) lid = m.quoted.sender;

  const user = getUser(lid);
  if (!user) return client.sendText(m.chat, "No tengo datos de esa persona todavía. Cuando escriba algo en el grupo, la conozco.", m);

  const r = textoPerfil(m.chat, lid, user, lid === m.sender);
  await client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m });
};

export default plugin;
