import { leerRedPersona, tarjetaPedida, CATALOGO_PERSONA } from "../lib/redes-persona.js";

// .x @usuario, .threads @usuario, .github usuario…: your profile on that network for the group, as a card with the
// link, the way .ig does with Instagram and .tt with TikTok (lib/redes-persona.js, tarjetaPedida). With someone
// mentioned, theirs as they loaded it with .misredes; alone, yours. Discord has no profile links, and .discord is the
// group's.
const plugin = {};
plugin.cmd = ["x", "twitter", "threads", "bluesky", "bsky", "mastodon", "facebook", "fb", "youtube", "yt", "twitch", "spotify", "github", "steam", "linkedin", "telegram", "tg"];

plugin.run = async (m, { client, text, command, participants }) => {
  const red = leerRedPersona(command);
  const r = await tarjetaPedida(red, { client, m, text, participants, comando: command, uso: `Pasame tu usuario o el link de tu ${CATALOGO_PERSONA[red].nombre}: .${command} @usuario.` });
  await client.sendText(m.chat, r.texto, m, r.mentions ? { mentions: r.mentions } : undefined);
};

export default plugin;
