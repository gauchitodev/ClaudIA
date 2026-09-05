import { agregarEntradaHashtag, contarEntradasUsuarioSemana, ganarCoins } from "../database-functions.js";
import { HASHTAGS_CONFIG, semanaDe } from "../lib/hashtags.js";
import { COINS, monedasActivas } from "../lib/urucoins.js";

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

      // premio en UruCoins, hasta un tope de entradas por hashtag por semana
      let premio = "";
      if (monedasActivas(m.chat) && contarEntradasUsuarioSemana(m.chat, tag, m.sender, semana) <= COINS.TOPE_HASHTAG_SEMANA) {
        ganarCoins(m.chat, m.sender, COINS.HASHTAG, `hashtag_${tag}`);
        premio = ` 🪙 +${COINS.HASHTAG}`;
      }

      await client.sendText(m.chat, `${config.emoji} *${config.nombre} #${numero}* registrada.${premio}`, m);
    }
  } catch (e) {
    console.error("[hashtags] ERROR:", e);
  }
  return;
};

export default plugin;
