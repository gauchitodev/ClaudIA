// General anti-links: it deletes messages containing any link.
// It used to parse every word as if it were a domain, so "no.se" (Sweden), "si.no" (Norway) or "bueno.al" (Albania)
// — written without a space after the dot — counted as links.
// Now the word has to LOOK like a link: http/www, or a domain with a known suffix.
import { parse } from "tldts";

const TERMINACIONES = /\.(com|net|org|io|co|app|gg|tv|xyz|info|dev|link|ly|to|uy|ar|cl|br|mx|tk|ml|lat)(\/|$)/i;

function detectarLink(palabra) {
  const w = palabra.replace(/^[("'<[¡¿]+|[)"'>\].,;:!?¡¿]+$/g, ""); // strips surrounding punctuation
  if (!w) return null;
  const explicito = /^(https?:\/\/|www\.)/i.test(w);
  const pareceDominio = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(w) && TERMINACIONES.test(w);
  if (!explicito && !pareceDominio) return null;
  const info = parse(w);
  return info.isIcann && info.domainWithoutSuffix ? info.domainWithoutSuffix : null;
}

const plugin = (m) => m;

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
  // stayed on screen. The warning quotes nothing, so it doesn't need the message to still be there.
  await m.delete();
  client.sendText(m.chat, txt.allAntiLinks(m.sender, foundLink), null, { mentions: [m.sender] }).catch(console.error);
  return;
};

export default plugin;
