import { stickerDeTexto } from "../lib/canvas.js";
import { sticker } from "../lib/sticker.js";

const plugin = {};
plugin.cmd = ["ttp"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text }) => {
  if (!text && !m.quoted) return client.sendText(m.chat, "Ingresa un texto.", m);
  m.react("⏳");
  const png = await stickerDeTexto(text || m.quoted.text || "");
  const stik = await sticker(png, false);
  await client.sendFile(m.chat, stik, null, null);
};

export default plugin;
