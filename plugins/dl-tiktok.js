import { encolarDescarga } from "../lib/cola-descargas.js";
import { bajarYEnviar, esTikTok, esVideoDeTikTok } from "../lib/ytdlp.js";
import { tarjetaPedida } from "../lib/redes-persona.js";
import txt from "../lib/strings.js";

// .tt <link>: downloads the video with yt-dlp. It used to use TikMate's API, which stopped answering. .tt @usuario, or
// a profile's link: a card with that profile for the group, as .ig does; with someone mentioned, theirs as they loaded
// it with .misredes, and alone, yours (lib/redes-persona.js, tarjetaPedida).
const plugin = {};
plugin.cmd = ["tt", "tiktok", "dltiktok"];
plugin.botAdmin = true;

const PERFIL = /^https?:\/\/(www\.|m\.)?tiktok\.com\/@[\w.-]+\/?(?:[?#]\S*)?$/i;

plugin.run = async (m, { client, text, command, participants }) => {
  const url = (text || "").trim().split(/\s+/)[0];
  if (!url || !esTikTok(url) || PERFIL.test(url)) {
    const r = await tarjetaPedida("tiktok", { client, m, text, participants, comando: command, uso: `Pasame el link de un TikTok para bajarlo, o tu usuario para mandar tu perfil: .${command} @usuario.` });
    return client.sendText(m.chat, r.texto, m, r.mentions ? { mentions: r.mentions } : undefined);
  }
  if (!esVideoDeTikTok(url)) return client.sendText(m.chat, `❌ Ese link no es de un video: colecciones o hashtags enteros no los bajo. Mandame el link de un TikTok en particular, o un usuario (.${command} @usuario) para mandar su perfil.`, m);

  m.react("⏳");
  const adelante = encolarDescarga(() => bajarYEnviar({ client, m, url, textoExito: txt.tiktokSuccess, textoError: "❌ No pude bajar ese TikTok. Puede ser privado, estar borrado o TikTok no me dejó esta vez; probá de nuevo en un rato." }));
  if (adelante > 0) await client.sendText(m.chat, `⏳ Tu descarga está en la cola. Hay ${adelante} antes que la tuya.`, m);
};

export default plugin;
