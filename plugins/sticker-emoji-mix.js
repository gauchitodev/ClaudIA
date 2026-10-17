import { sticker } from "../lib/sticker.js";

const plugin = {};
plugin.cmd = ["emojimix"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text, args, usedPrefix, command }) => {
  if (!args[0]) return client.sendText(m.chat, txt.emojiMixNull(usedPrefix, command), m);
  if (!globalThis.tenorApiKey) return client.sendText(m.chat, "Falta configurar la API key de Tenor en config.toml (tenorApiKey).", m);
  const [emoji1, emoji2] = text.split("+").map((e) => (e || "").trim());
  if (!emoji1 || !emoji2) return client.sendText(m.chat, txt.emojiMixNull(usedPrefix, command), m);
  const anu = await fetchJson(`https://tenor.googleapis.com/v2/featured?key=${globalThis.tenorApiKey}&contentfilter=high&media_filter=png_transparent&component=proactive&collection=emoji_kitchen_v5&q=${encodeURIComponent(emoji1)}_${encodeURIComponent(emoji2)}`);
  if (!anu?.results?.length) return client.sendText(m.chat, "No encontré una mezcla para esos emojis.", m);
  // Tenor can return up to 20 mixes; 3 is plenty and doesn't flood the chat. A sticker that couldn't be made
  // (sticker() returns its error) is skipped: it used to go out as an empty ".bin" file.
  let mandados = 0;
  for (const res of anu.results.slice(0, 3)) {
    const stiker = await sticker(false, res.url);
    if (!Buffer.isBuffer(stiker) || !stiker.length) continue;
    await client.sendFile(m.chat, stiker, null, null, m);
    mandados++;
  }
  if (!mandados) return client.sendText(m.chat, "No pude armar el sticker de esa mezcla, probá de nuevo en un rato.", m);
};

export default plugin;

const fetchJson = async (url, options) => (await fetch(url, options)).json();
