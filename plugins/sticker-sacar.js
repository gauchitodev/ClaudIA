import { sacarSticker } from "../lib/stickers-grupo.js";

// .sacarsticker, answering a sticker: Claudia stops sending it in this group, and doesn't keep it again if someone sends
// it back (lib/stickers-grupo.js). For the admins: it's how an offensive one gets out of her draw.
const plugin = {};
plugin.cmd = ["sacarsticker", "borrarsticker"];
plugin.onlyGroup = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, usedPrefix, command }) => {
  if (!m.quoted || !/sticker/i.test(m.quoted.mediaType || m.quoted.mtype || "")) return client.sendText(m.chat, `Respondé al sticker que querés que no mande más con ${usedPrefix}${command}.`, m);
  const buffer = await m.quoted.download?.().catch(() => null);
  if (!buffer) return client.sendText(m.chat, "No pude bajar ese sticker, probá de nuevo.", m);
  const tenia = sacarSticker(m.chat, buffer);
  return client.sendText(m.chat, tenia ? "Listo, ese sticker no lo mando más en este grupo." : "Ese no lo tenía guardado, pero ya no lo voy a guardar.", m);
};

export default plugin;
