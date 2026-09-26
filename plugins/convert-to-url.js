import uploadImage from "../lib/upload-image.js";
import { puedeRecuperarCitado } from "../lib/vista-unica.js";

const plugin = {};
plugin.cmd = ["tourl", "upload"];
plugin.botAdmin = true;

plugin.run = async (m, { client, isAdmin, isOwner }) => {
  // Someone else's view-once would end up behind a public link (see lib/vista-unica.js).
  if (!puedeRecuperarCitado(m, { isAdmin, isOwner })) return client.sendText(m.chat, txt.recoveryOnceRestrict, m);
  const q = m.quoted ? m.quoted : m;
  const mime = (q.msg || q).mimetype || "";
  if (!mime) return client.sendText(m.chat, `[❗] 𝚁𝙴𝚂𝙿𝙾𝙽𝙳𝙰 𝙰 𝚄𝙽𝙰 𝙸𝙼𝙰𝙶𝙴𝙽 𝙾 𝚅𝙸𝙳𝙴𝙾.`, m);
  const media = await q.download();
  const link = await uploadImage(media);
  const caption = `👉𝙀𝙉𝙇𝘼𝘾𝙀:\n${link}`;
  client.sendText(m.chat, caption, m);
};

export default plugin;
