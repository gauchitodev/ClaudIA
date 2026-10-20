import { stickerDeTexto, MAX_LETRAS_STICKER } from "../lib/canvas.js";
import { sticker } from "../lib/sticker.js";
import { conNombres } from "../lib/menciones.js";

// Swappable from the tests.
export const _dep = { stickerDeTexto };

const plugin = {};
plugin.cmd = ["ttp"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text }) => {
  if (!text && !m.quoted) return client.sendText(m.chat, "Ingresa un texto.", m);
  // Mentions drawn as names, not as the LID digits they carry in the text (lib/menciones.js).
  const texto = text ? conNombres(text, m.mentionedJid) : conNombres(m.quoted.text, m.quoted.contextInfo?.mentionedJid);
  if (texto.length > MAX_LETRAS_STICKER) return client.sendText(m.chat, `Muy largo para un sticker: como mucho ${MAX_LETRAS_STICKER} letras.`, m);
  m.react("⏳");
  const png = await _dep.stickerDeTexto(texto);
  const stik = await sticker(png, false);
  await client.sendFile(m.chat, stik, null, null);
};

export default plugin;
