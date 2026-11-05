import { mandarStickerAlAzar, mandarSticker, buscarSticker, cuantosStickers } from "../lib/stickers-grupo.js";

// .stickerazar: one of the stickers this group has sent, at random; .stickerazar <words> (risa, perro, enojo), one whose
// description has any of them (lib/stickers-grupo.js).
const plugin = {};
plugin.cmd = ["stickerazar", "stickerrandom"];
plugin.onlyGroup = true;

plugin.run = async (m, { client, text = "" }) => {
  if (!cuantosStickers(m.chat)) return client.sendText(m.chat, "Todavía no tengo stickers de este grupo: los voy juntando de los que mandan ustedes.", m);
  const pedido = text.trim();
  if (pedido) {
    const sha = buscarSticker(m.chat, pedido);
    if (!sha) return client.sendText(m.chat, `No tengo ninguno de "${pedido.slice(0, 40)}" (o todavía no los miré todos).`, m);
    if (!(await mandarSticker(client, m.chat, sha, m))) return client.sendText(m.chat, "No pude mandar el sticker, probá de nuevo.", m);
    return;
  }
  if (!(await mandarStickerAlAzar(client, m.chat, m))) return client.sendText(m.chat, "No pude mandar el sticker, probá de nuevo.", m);
};

export default plugin;
