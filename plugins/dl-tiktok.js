import { encolarDescarga } from "../lib/cola-descargas.js";
import { bajarYEnviar, esTikTok } from "../lib/ytdlp.js";

// .tt <link>: downloads the video with yt-dlp. It used to use TikMate's API, which stopped answering.
const plugin = {};
plugin.cmd = ["tt", "tiktok", "dltiktok"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text }) => {
  const url = (text || "").trim().split(/\s+/)[0];
  if (!url) return client.sendText(m.chat, txt.tiktokNull, m);
  if (!esTikTok(url)) return client.sendText(m.chat, txt.tiktokLinkNull, m);

  m.react("⏳");
  const adelante = encolarDescarga(() => bajarYEnviar({ client, m, url, textoExito: txt.tiktokSuccess, textoError: "❌ No pude bajar ese TikTok. Puede ser privado, estar borrado o TikTok no me dejó esta vez; probá de nuevo en un rato." }));
  if (adelante > 0) await client.sendText(m.chat, `⏳ Tu descarga está en la cola. Hay ${adelante} antes que la tuya.`, m);
};

export default plugin;
