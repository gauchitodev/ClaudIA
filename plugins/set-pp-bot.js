import { S_WHATSAPP_NET } from "@whiskeysockets/baileys";
import { fotoDePerfil } from "../lib/canvas.js";

const updatePictureProfile = async (content, client) => {
  try {
    const media = { image: await fotoDePerfil(content, 720) };
    await client.query({
      tag: "iq",
      attrs: {
        target: undefined, // undefined for pp bot, 'xx@g.us' for group
        to: S_WHATSAPP_NET,
        type: "set",
        xmlns: "w:profile:picture",
      },
      content: [
        {
          tag: "picture",
          attrs: { type: "image" },
          content: Buffer.from(media.image),
        },
      ],
    });
    return { status: true };
  } catch (e) {
    console.log(e);
    return { status: false };
  }
};

const plugin = {};
plugin.cmd = ["setppbot"];
plugin.onlyOwner = true;

plugin.run = async (m, { client }) => {
  const q = m.quoted ? m.quoted : m;
  const mime = (q.msg || q).mimetype || q.mediaType || "";
  if (mime === "image/jpeg" || mime === "image/png") {
    const media = await q.download();
    const response = await updatePictureProfile(media, client);
    if (response.status) {
      client.sendText(m.chat, "Listo.", m);
    } else {
      await m.react("✖️");
    }
  } else {
    await client.sendText(m.chat, txt.defaultImage, m);
  }
};

export default plugin;
