import { sticker } from "../lib/sticker.js";

let plugin = {};
plugin.cmd = ["emojimix"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text, args, usedPrefix, command }) => {
  if (!args[0]) return client.sendText(m.chat, txt.emojiMixNull(usedPrefix, command), m);
  if (!globalThis.tenorApiKey) return client.sendText(m.chat, "Falta configurar la API key de Tenor en config.toml (tenorApiKey).", m);
  const [emoji1, emoji2] = text.split("+").map((e) => (e || "").trim());
  if (!emoji1 || !emoji2) return client.sendText(m.chat, txt.emojiMixNull(usedPrefix, command), m);
  let anu = await fetchJson(`https://tenor.googleapis.com/v2/featured?key=${globalThis.tenorApiKey}&contentfilter=high&media_filter=png_transparent&component=proactive&collection=emoji_kitchen_v5&q=${encodeURIComponent(emoji1)}_${encodeURIComponent(emoji2)}`);
  if (!anu?.results?.length) return client.sendText(m.chat, "No encontré una mezcla para esos emojis.", m);
  // Tenor puede devolver hasta 20 mezclas; con 3 alcanza y no se inunda el chat.
  for (let res of anu.results.slice(0, 3)) {
    const stiker = await sticker(false, res.url);
    await client.sendFile(m.chat, stiker, null, null, m);
  }
};

export default plugin;

const fetchJson = async (url, options) => (await fetch(url, options)).json();
