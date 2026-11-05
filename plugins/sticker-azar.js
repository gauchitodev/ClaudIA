import { mandarStickerAlAzar, cuantosStickers } from "../lib/stickers-grupo.js";

// .stickerazar: one of the stickers this group has sent, at random (lib/stickers-grupo.js).
const plugin = {};
plugin.cmd = ["stickerazar", "stickerrandom"];
plugin.onlyGroup = true;

plugin.run = async (m, { client }) => {
  if (!cuantosStickers(m.chat)) return client.sendText(m.chat, "Todavía no tengo stickers de este grupo: los voy juntando de los que mandan ustedes.", m);
  if (!(await mandarStickerAlAzar(client, m.chat, m))) return client.sendText(m.chat, "No pude mandar el sticker, probá de nuevo.", m);
};

export default plugin;
