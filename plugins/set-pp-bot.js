import { S_WHATSAPP_NET } from "@whiskeysockets/baileys";
import Jimp from "jimp-legacy";

async function resizeImg(image, height) {
  let jimp = await Jimp.read(image);
  let min = jimp.getWidth();
  let max = jimp.getHeight();
  let outputRatio = height / Math.max(max, min);
  let cropped = jimp.crop(0, 0, min, max);
  return {
    image: await cropped.resize(Math.floor(min * outputRatio), Math.floor(max * outputRatio), Jimp.RESIZE_BILINEAR).getBufferAsync(Jimp.MIME_JPEG),
  };
}
const updatePictureProfile = async (content, client) => {
  return new Promise(async (resolve) => {
    try {
      const media = await resizeImg(content, 720);
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
      resolve({ status: true });
    } catch (e) {
      console.log(e);
      resolve({ status: false });
    }
  });
};

let plugin = {};
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
