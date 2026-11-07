// General anti-links: it deletes messages containing any link. What looks like one (and what "no.se" or "si.no"
// doesn't) is in lib/enlaces.js.
import { detectarLink } from "../lib/enlaces.js";
import txt from "../lib/strings.js";

const plugin = (m) => m;
plugin.moderacion = true; // runs before the other hooks (hooksEnOrden, load-functions.js)

plugin.before = async (m, { client, isMod, isBotAdmin, isOwner, participants, chat }) => {
  if (!m.isGroup || !isBotAdmin || isMod || isOwner) return;
  if (!chat.allAntiLinks || !m.text) return;
  const groupAdmins = participants.filter((p) => p.admin);

  let foundLink = null;
  for (const palabra of m.text.split(/\s+/)) {
    foundLink = detectarLink(palabra);
    if (foundLink) break;
  }
  if (!foundLink) return;

  if (chat.antiDelete) {
    return client.sendText(m.chat, txt.allAntiLinksDelete, m, { mentions: [m.sender, ...groupAdmins.map((v) => v.id)] });
  }
  // Delete first: deletions go out at once (lib/envios.js), but behind an awaited warning waiting its turn, the link
  // stayed on screen. The warning quotes nothing, so it doesn't need the message to still be there. Marked as
  // moderated, Claudia leaves it alone (plugins/_auto-ia.js).
  m.moderado = true;
  await m.delete();
  client.sendText(m.chat, txt.allAntiLinks(m.sender, foundLink), null, { mentions: [m.sender] }).catch(console.error);
  return;
};

export default plugin;
