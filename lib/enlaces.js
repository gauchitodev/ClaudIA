// What counts as a link, for the anti-links (plugins/_all-anti-links.js, _anti-Link-grupos-canales.js and
// _anti-link-plus.js) and for what reaches Claudia's memory late (lib/memoria-corta.js), in one place: what came while
// the bot was down, and a link would have deleted, can't slip past a narrower copy of the patterns.
import { parse } from "tldts";

// Every word used to be parsed as if it were a domain, so "no.se" (Sweden), "si.no" (Norway) or "bueno.al" (Albania),
// written without a space after the dot, counted as links. Now the word has to LOOK like one: http/www, or a domain
// with a known suffix.
export const TERMINACIONES = /\.(com|net|org|io|co|app|gg|tv|xyz|info|dev|link|ly|to|uy|ar|cl|br|mx|tk|ml|lat)(\/|$)/i;

// The domain (without its suffix) of a word that looks like a link, or null.
export function detectarLink(palabra) {
  const w = palabra.replace(/^[("'<[¡¿]+|[)"'>\].,;:!?¡¿]+$/g, ""); // strips surrounding punctuation
  if (!w) return null;
  const explicito = /^(https?:\/\/|www\.)/i.test(w);
  const pareceDominio = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(w) && TERMINACIONES.test(w);
  if (!explicito && !pareceDominio) return null;
  const info = parse(w);
  return info.isIcann && info.domainWithoutSuffix ? info.domainWithoutSuffix : null;
}

// A real WhatsApp group or channel link (chat.whatsapp.com/CODE); writing "grupo de whatsapp" doesn't count.
export const LINK_GRUPO = /chat\.whatsapp\.com\/[A-Za-z0-9]{6,}/i;
export const LINK_CANAL = /whatsapp\.com\/channel\/[A-Za-z0-9]{6,}/i;

// Each one demands the full domain with the slash: "tiktok.com/..." yes, "hablemos de tiktok" no. (An older one had
// /t.me/ unescaped, which also caught "time", "tome", "tame"...) Without the "g" flag, which would make test() carry
// its position from one text to the next.
export const LINK_TIKTOK = /\b(?:www\.|vm\.|vt\.)?tiktok\.com\/\S+/i;
export const LINK_TELEGRAM = /\b(?:t\.me|telegram\.(?:me|org|dog))\/\S+/i;
export const LINK_INSTAGRAM = /\b(?:www\.)?instagram\.com\/\S+/i;

// Whether a text has anything any of the anti-links would take for a link, or a word that starts like one (http, www)
// whatever its domain.
export function tieneEnlace(texto) {
  const t = String(texto || "");
  if (!t) return false;
  if ([LINK_GRUPO, LINK_CANAL, LINK_TIKTOK, LINK_TELEGRAM, LINK_INSTAGRAM].some((patron) => patron.test(t))) return true;
  return t.split(/\s+/).some((palabra) => /^[("'<[¡¿]*(https?:\/\/|www\.)/i.test(palabra) || detectarLink(palabra) !== null);
}
