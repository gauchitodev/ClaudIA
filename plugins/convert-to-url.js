import uploadImage from "../lib/upload-image.js";

let plugin = {};
plugin.cmd = ["tourl", "upload"];
plugin.botAdmin = true;

plugin.run = async (m, { client }) => {
  const q = m.quoted ? m.quoted : m;
  const mime = (q.msg || q).mimetype || "";
  if (!mime) return client.sendText(m.chat, `[❗] 𝚁𝙴𝚂𝙿𝙾𝙽𝙳𝙰 𝙰 𝚄𝙽𝙰 𝙸𝙼𝙰𝙶𝙴𝙽 𝙾 𝚅𝙸𝙳𝙴𝙾.`, m);
  const media = await q.download();
  const link = await uploadImage(media);
  const caption = `👉𝙀𝙉𝙇𝘼𝘾𝙀:\n${link}`;
  client.sendText(m.chat, caption, m);
};

export default plugin;
