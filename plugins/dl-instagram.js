import { encolarDescarga } from "../lib/cola-descargas.js";
import { bajarYEnviar, esInstagram } from "../lib/ytdlp.js";
import { tarjetaPedida } from "../lib/redes-persona.js";

// .instagram <link>: downloads the post, reel or video with yt-dlp. It used to use Delirius's API, whose domain no
// longer exists. Instagram demands a logged-in session: Instagram cookies are needed in cookies.txt, the same file
// .play uses. Anything but a post's link (a username, a profile's link, someone mentioned, nothing) is the profile's
// card, as .ig gives it (lib/redes-persona.js, tarjetaPedida).
const plugin = {};
plugin.cmd = ["instagram", "igdl"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text, command, participants }) => {
  const url = (text || "").trim().split(/\s+/)[0];
  if (!url || !esInstagram(url)) {
    const r = await tarjetaPedida("instagram", { client, m, text, participants, comando: command, uso: `Pasame el link de un post o un reel para bajarlo, o tu usuario para mandar tu perfil: .${command} @usuario.` });
    return client.sendText(m.chat, r.texto, m, r.mentions ? { mentions: r.mentions } : undefined);
  }

  m.react("⏳");
  const adelante = encolarDescarga(() => bajarYEnviar({ client, m, url, textoExito: txt.dlInstaSuccess, textoError: "❌ No pude bajar eso de Instagram. Puede ser privado, o Instagram pide iniciar sesión; probá de nuevo más tarde." }));
  if (adelante > 0) await client.sendText(m.chat, `⏳ Tu descarga está en la cola. Hay ${adelante} antes que la tuya.`, m);
};

export default plugin;
