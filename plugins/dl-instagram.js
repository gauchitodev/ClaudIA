import { encolarDescarga } from "../lib/cola-descargas.js";
import { bajarYEnviar, esInstagram } from "../lib/ytdlp.js";

// .instagram <link>: downloads the post, reel or video with yt-dlp. It used to use Delirius's API, whose domain no
// longer exists. Instagram demands a logged-in session: Instagram cookies are needed in cookies.txt, the same file
// .play uses.
const plugin = {};
plugin.cmd = ["instagram", "igdl"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text }) => {
  const url = (text || "").trim().split(/\s+/)[0];
  if (!url) return client.sendText(m.chat, txt.dlInstaNull, m);
  if (!esInstagram(url)) return client.sendText(m.chat, "*[❕]* Ingrese un enlace de Instagram válido (post, reel o video)", m);

  m.react("⏳");
  const adelante = encolarDescarga(() => bajarYEnviar({ client, m, url, textoExito: txt.dlInstaSuccess, textoError: "❌ No pude bajar eso de Instagram. Puede ser privado, o Instagram pide iniciar sesión; probá de nuevo más tarde." }));
  if (adelante > 0) await client.sendText(m.chat, `⏳ Tu descarga está en la cola. Hay ${adelante} antes que la tuya.`, m);
};

export default plugin;
