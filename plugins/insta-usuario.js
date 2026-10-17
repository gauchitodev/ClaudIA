import { mandarConImagen } from "../lib/con-imagen.js";

const plugin = {};
plugin.cmd = ["ig"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text }) => {
  if (!text) return client.sendText(m.chat, txt.instaUsuarioNull, m);
  if (text.startsWith("@")) {
    text = text.slice(1);
  }
  m.react("🤳");

  const image = "https://telegra.ph/file/1af5d76a06d74180fac0d.jpg";
  const instagramUrl = `https://instagram.com/${text}`;
  const str = `
*[🤳🏻] 𝙸𝙽𝚂𝚃𝙰𝙶𝚁𝙰𝙼 𝙳𝙴:* @${m.sender.split("@")[0]}

*[👤] 𝚄𝚂𝚄𝙰𝚁𝙸𝙾:* @${text}

*[📌] 𝙴𝙽𝙻𝙰𝙲𝙴:* ${instagramUrl}`.trim();

  // The picture is a decoration: what matters is the link, and it goes even if the picture doesn't come.
  await mandarConImagen(client, m.chat, image, str, m, "ig");
};

export default plugin;
