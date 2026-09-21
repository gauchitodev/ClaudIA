import { getUser } from "../database-functions.js";
import { lidMencionado } from "../lib/menciones.js";
import { textoPerfil } from "../lib/perfil.js";

const plugin = {};
plugin.cmd = ["perfil", "ficha"];
plugin.onlyGroup = true;

// .perfil → your record · .perfil @person, or replying to one of their messages → that person's
plugin.run = async (m, { client, text }) => {
  const lid = lidMencionado(m, text) || m.sender;

  const user = getUser(lid);
  if (!user) return client.sendText(m.chat, "No tengo datos de esa persona todavía. Cuando escriba algo en el grupo, la conozco.", m);

  const r = textoPerfil(m.chat, lid, user, lid === m.sender);
  await client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m });
};

export default plugin;
