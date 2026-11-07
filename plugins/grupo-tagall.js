import { mencionesParaTodos, separarForzado, textoTagall, textoSinNadie, TEXTOS_LLAMADOS } from "../lib/menciones-generales.js";
import txt from "../lib/strings.js";

const plugin = {};
plugin.cmd = ["tagall", "todos"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

// .tagall <message>: mentions everyone except whoever opted out with .notagall, and says how many that is.
// .tagall -f <message> reaches them too. Only admins and the owner (isAdmin covers WhatsApp admins, bot admins and the
// owner, lib/roles.js): moderators are the ones who send these, and if they could force them the opt-out would mean
// nothing. Claudia's .tagall (plugins/_auto-ia.js) comes with desdeClaudia, so nothing she was told reads as a -f.
plugin.run = async (m, { client, isOwner, isAdmin, text, textoCompleto, participants, chat, desdeClaudia = false }) => {
  if (!chat.mentions && !isOwner) return client.sendText(m.chat, txt.mentionsDisabled, m);
  // The message as it was typed, line breaks included (textoCompleto, lib/comandos.js); Claudia hands the whole one.
  const { forzar, texto } = desdeClaudia ? { forzar: false, texto: text } : separarForzado(textoCompleto ?? text);
  if (forzar && !isAdmin && !isOwner) return client.sendText(m.chat, TEXTOS_LLAMADOS.soloAdmins, m);
  const { ids, fuera } = mencionesParaTodos(m.chat, participants, { client, forzar });
  if (!ids.length) return client.sendText(m.chat, textoSinNadie(fuera), m);
  await client.sendMessage(m.chat, { text: textoTagall({ texto, ids, fuera, forzado: forzar }), mentions: ids }, { quoted: m });
};

export default plugin;
