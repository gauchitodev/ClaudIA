import { stickerDeTexto, MAX_LETRAS_STICKER } from "../lib/canvas.js";
import { sticker } from "../lib/sticker.js";

const plugin = {};
plugin.cmd = ["ttp"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text }) => {
  if (!text && !m.quoted) return client.sendText(m.chat, "Ingresa un texto.", m);
  const texto = text || m.quoted.text || "";
  if (texto.length > MAX_LETRAS_STICKER) return client.sendText(m.chat, `Muy largo para un sticker: como mucho ${MAX_LETRAS_STICKER} letras.`, m);
  m.react("⏳");
  const png = await stickerDeTexto(texto);
  const stik = await sticker(png, false);
  await client.sendFile(m.chat, stik, null, null);
};

export default plugin;
