import { filaDe, lidMencionadoActual } from "../lib/identidad.js";
import { textoPerfil } from "../lib/perfil.js";

const plugin = {};
plugin.cmd = ["perfil", "ficha"];
plugin.onlyGroup = true;

// .perfil → your record · .perfil @person, or replying to one of their messages → that person's
plugin.run = async (m, { client, text, participants }) => {
  const lid = await lidMencionadoActual(client, m, text, participants) || m.sender;

  // Their row as the group lets it be read (filaDe), and their role too (textoPerfil): named by a number WhatsApp
  // didn't say whose it is, the row it stood for, of whoever had it before, showed their data and their role as the
  // person's.
  const user = filaDe(lid, participants);
  if (!user) return client.sendText(m.chat, "No tengo datos de esa persona todavía. Cuando escriba algo en el grupo, la conozco.", m);

  const r = textoPerfil(m.chat, lid, user, lid === m.sender, participants);
  await client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m });
};

export default plugin;
