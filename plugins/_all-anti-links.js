// Anti-links general: borra mensajes con cualquier link.
// Antes analizaba cada palabra como si fuera un dominio, así que "no.se" (Suecia), "si.no" (Noruega)
// o "bueno.al" (Albania) — escritos sin espacio después del punto — contaban como links.
// Ahora la palabra tiene que PARECER un link: http/www, o dominio con una terminación conocida.
import { parse } from "tldts";

const TERMINACIONES = /\.(com|net|org|io|co|app|gg|tv|xyz|info|dev|link|ly|to|uy|ar|cl|br|mx|tk|ml|lat)(\/|$)/i;

function detectarLink(palabra) {
  const w = palabra.replace(/^[("'<[¡¿]+|[)"'>\].,;:!?¡¿]+$/g, ""); // limpia puntuación alrededor
  if (!w) return null;
  const explicito = /^(https?:\/\/|www\.)/i.test(w);
  const pareceDominio = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(w) && TERMINACIONES.test(w);
  if (!explicito && !pareceDominio) return null;
  const info = parse(w);
  return info.isIcann && info.domainWithoutSuffix ? info.domainWithoutSuffix : null;
}

let plugin = (m) => m;

plugin.before = async function (m, { client, isAdmin, isBotAdmin, isOwner, participants, chat }) {
  if (!m.isGroup || !isBotAdmin || isAdmin || isOwner) return;
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
  await client.sendText(m.chat, txt.allAntiLinks(m.sender, foundLink), null, { mentions: [m.sender] });
  await m.delete();
  return;
};

export default plugin;
