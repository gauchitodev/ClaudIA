import { sticker } from "../lib/sticker.js";
import { getUser } from "../database-functions.js";

const plugin = {};
plugin.cmd = ["qc"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text }) => {
  if (!text && !m.quoted?.text) return client.sendText(m.chat, txt.stickerQcNull, m);

  let quoteText, quoteSender, quoteName;

  if (m.quoted && m.quoted.text) {
    quoteText = m.quoted.text.trim();
    quoteSender = m.quoted.sender;
    const quotedUser = getUser(quoteSender);
    quoteName = quotedUser?.pushName || quoteSender.split("@")[0];
  } else {
    quoteText = text.trim();
    quoteSender = m.sender;
    quoteName = m.name;
  }

  if (quoteText.length > 310) return client.sendText(m.chat, txt.stickerQcMaxLetters, m);

  const pp = await client.profilePictureUrl(quoteSender, "image").catch((_) => "https://i.ibb.co/dyk5QdQ/1212121212121212.png");

  const obj = {
    type: "quote",
    format: "png",
    backgroundColor: "#000000",
    width: 512,
    height: 768,
    scale: 2,
    messages: [
      {
        entities: [],
        avatar: true,
        from: {
          id: 1,
          name: quoteName,
          photo: {
            url: pp,
          },
        },
        text: quoteText,
        replyMessage: {},
      },
    ],
  };

  const res = await fetch("https://bot.lyo.su/quote/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj), signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`el servicio de citas respondió ${res.status}`);
  const json = await res.json();
  const buffer = Buffer.from(json.result.image, "base64");
  const stiker = await sticker(buffer, false);
  if (stiker) return client.sendFile(m.chat, stiker, "sticker.webp", "");
};

export default plugin;
