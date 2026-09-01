import { agregarEntradaHashtag } from "../database-functions.js";
import { HASHTAGS_CONFIG, semanaDe } from "../lib/hashtags.js";

let plugin = (m) => m;

plugin.before = async function (m, { client }) {
  try {
    if (!m.isGroup || !m.text) return;
    if (m.fromMe || m.isBaileys) return;

    const hashtagsEncontrados = [...m.text.matchAll(/#(\w+)/gi)].map((match) => match[1].toLowerCase());
    if (hashtagsEncontrados.length === 0) return;

    for (const tag of hashtagsEncontrados) {
      const config = HASHTAGS_CONFIG[tag];
      if (!config) continue;

      const semana = semanaDe(Date.now());
      const numero = agregarEntradaHashtag({
        chat: m.chat,
        hashtag: tag,
        usuario: m.sender,
        contenido: m.text,
        messageId: m.key?.id || null,
        semana,
      });

      await client.sendText(m.chat, `${config.emoji} *${config.nombre} #${numero}* registrada.`, m);
    }
  } catch (e) {
    console.error("[hashtags] ERROR:", e);
  }
  return;
};

export default plugin;
