import { addExif } from "../lib/sticker.js";

const plugin = {};
plugin.cmd = ["wm"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text }) => {
  if (!m.quoted) return client.sendText(m.chat, txt.wmNull, m);

  const mime = m.quoted.mimetype || "";
  if (!/webp/.test(mime)) return client.sendText(m.chat, txt.wmNull, m);

  try {
    const [packname, ...partesAutor] = text.split("|");
    const author = partesAutor.join("|");
    const img = await m.quoted.download();
    if (!img) return client.sendText(m.chat, txt.wmNull, m);
    const stiker = await addExif(img, packname || "", author || "");
    await client.sendFile(m.chat, stiker, "sticker.webp", "", m);
  } catch (e) {
    console.error(e);
    await client.sendText(m.chat, txt.wmNull, m);
  }
};

export default plugin;
