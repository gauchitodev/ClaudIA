// The group's social links (.redes): an admin loads them, anyone sees them, and Claudia has them in her prompt to hand
// over when asked (plugins/_auto-ia.js). Kept per group in chats.redes as JSON, like the rules (lib/reglas.js). They
// used to be one set for the whole bot, from config.toml (.links, .discord), the same in every group: of that, only the
// bot's channel stays, as the default where a group loaded no channel of its own; the group's invite link, when the
// bot can get it, is this group's and goes with them too (plugins/redes.js).
import { getChat, updateChat } from "../database-functions.js";
import { configuracion } from "./configuracion.js";

export const REDES = { MAX_LARGO: 200 };

// The networks, in the order .redes lists them, with the domains a link of theirs may have (any subdomain of them) and,
// for the channel, the path: a group invite is whatsapp.com too.
export const CATALOGO = {
  instagram: { nombre: "Instagram", emoji: "📸", dominios: ["instagram.com"] },
  facebook: { nombre: "Facebook", emoji: "📘", dominios: ["facebook.com", "fb.com", "fb.me"] },
  x: { nombre: "X", emoji: "🐦", dominios: ["x.com", "twitter.com"] },
  tiktok: { nombre: "TikTok", emoji: "🎵", dominios: ["tiktok.com"] },
  youtube: { nombre: "YouTube", emoji: "▶️", dominios: ["youtube.com", "youtu.be"] },
  twitch: { nombre: "Twitch", emoji: "🎥", dominios: ["twitch.tv"] },
  spotify: { nombre: "Spotify", emoji: "🎧", dominios: ["spotify.com"] },
  discord: { nombre: "Discord", emoji: "🎮", dominios: ["discord.gg", "discord.com"] },
  telegram: { nombre: "Telegram", emoji: "✈️", dominios: ["t.me", "telegram.me"] },
  canal: { nombre: "Canal de WhatsApp", emoji: "📣", dominios: ["whatsapp.com"], ruta: "/channel/" },
  grupo: { nombre: "Link de invitación", emoji: "👥", dominios: ["chat.whatsapp.com"] },
  web: { nombre: "Web", emoji: "🌐", dominios: null },
};
const ALIAS = { insta: "instagram", ig: "instagram", fb: "facebook", twitter: "x", yt: "youtube", tg: "telegram", sitio: "web", pagina: "web", channel: "canal", group: "grupo" };
const sinAcentos = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
export const listaDeRedes = () => Object.keys(CATALOGO).join(", ");

// The network a word names ("instagram", "insta", "Twitter"), or null.
export function leerRed(palabra) {
  const k = sinAcentos(palabra);
  return CATALOGO[k] ? k : ALIAS[k] || null;
}

function guardadas(chat) {
  try {
    const r = JSON.parse(getChat(chat)?.redes || "{}");
    return r && typeof r === "object" && !Array.isArray(r) ? r : {};
  } catch {
    return {};
  }
}

// The group's links by network: what it loaded, and the bot's channel (config.toml, [canal]) where it loaded none.
export function redesDe(chat) {
  const propias = guardadas(chat);
  const todas = {};
  for (const red of Object.keys(CATALOGO)) {
    const link = propias[red] || (red === "canal" ? configuracion.canalConfig?.enlace || "" : "");
    if (link) todas[red] = link;
  }
  return todas;
}
export const tieneRedes = (chat) => Object.keys(redesDe(chat)).length > 0;

// A link as typed, if it's one: http(s), parseable, no spaces. The text is kept as it came, not as URL would write it.
// Someone's own links (lib/redes-persona.js) go through this and esDe too.
export function leerLink(texto) {
  const t = String(texto || "").trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return null;
  try {
    new URL(t);
    return t;
  } catch {
    return null;
  }
}
// Whether a link is of one of those domains (or a subdomain of them), with that path when one is asked for.
export const esDe = (link, dominios, ruta = null) => {
  if (!dominios) return true;
  const { hostname, pathname } = new URL(link);
  const host = hostname.toLowerCase();
  return dominios.some((d) => host === d || host.endsWith(`.${d}`)) && (!ruta || pathname.startsWith(ruta));
};
const dominioVale = (red, link) => esDe(link, CATALOGO[red].dominios, CATALOGO[red].ruta);

export function fijarRed(chat, palabra, link) {
  const red = leerRed(palabra);
  if (!red) return { ok: false, error: `No conozco esa red. Las que van: ${listaDeRedes()}.` };
  const url = leerLink(link);
  if (!url) return { ok: false, error: `Pasame el link completo, con https://: .redes ${red} https://…` };
  if (url.length > REDES.MAX_LARGO) return { ok: false, error: `Muy largo: como mucho ${REDES.MAX_LARGO} caracteres.` };
  if (!dominioVale(red, url)) return { ok: false, error: `Ese link no es de ${CATALOGO[red].nombre}: tiene que ser de ${CATALOGO[red].dominios.join(" o ")}${CATALOGO[red].ruta ? `, con ${CATALOGO[red].ruta}` : ""}.` };
  const propias = guardadas(chat);
  propias[red] = url;
  if (!updateChat(chat, { redes: JSON.stringify(propias) })) return { ok: false, error: "No pude guardarlo, probá de nuevo en un rato." };
  return { ok: true, red, mensaje: `${CATALOGO[red].emoji} Listo: ${CATALOGO[red].nombre} del grupo cargado. Cualquiera lo ve con .redes, y yo lo paso si me lo piden.` };
}

export function borrarRed(chat, palabra) {
  const red = leerRed(palabra);
  if (!red) return { ok: false, error: `No conozco esa red. Las que van: ${listaDeRedes()}.` };
  const propias = guardadas(chat);
  if (!propias[red]) return { ok: false, error: `Este grupo no tiene ${CATALOGO[red].nombre} cargado.` };
  delete propias[red];
  if (!updateChat(chat, { redes: JSON.stringify(propias) })) return { ok: false, error: "No pude guardarlo, probá de nuevo en un rato." };
  return { ok: true, red, mensaje: `🗑️ Listo, borré el ${CATALOGO[red].nombre} del grupo.` };
}

// .redes: every link, or one network's; grupoInvitacion is this group's invite link, when the bot could get it, for
// the groups that loaded none.
export function textoRedes(chat, { red = null, grupoInvitacion = "" } = {}) {
  const todas = redesDe(chat);
  if (grupoInvitacion && !todas.grupo) todas.grupo = grupoInvitacion;
  if (red) {
    const c = CATALOGO[red];
    return todas[red] ? `${c.emoji} ${c.nombre} del grupo:\n${todas[red]}` : `${c.emoji} Este grupo no tiene ${c.nombre} cargado. Un admin lo pone con .redes ${red} <link>.`;
  }
  const lineas = Object.keys(CATALOGO)
    .filter((r) => todas[r])
    .map((r) => `${CATALOGO[r].emoji} ${CATALOGO[r].nombre}: ${todas[r]}`);
  if (!lineas.length) return `🔗 Este grupo no tiene redes cargadas. Un admin las pone con .redes instagram <link> (o ${listaDeRedes().replace("instagram, ", "")}).`;
  return `🔗 *Redes del grupo*\n${lineas.join("\n")}`;
}

// For Claudia's prompt: the links, to hand over as they are when someone asks; "" with none.
export function textoRedesParaPrompt(chat) {
  const todas = redesDe(chat);
  const partes = Object.keys(CATALOGO)
    .filter((r) => todas[r])
    .map((r) => `${CATALOGO[r].nombre}: ${todas[r]}`);
  return partes.length ? `Redes y links del grupo (si alguien te los pide, pasalos tal cual, sin cambiarlos): ${partes.join(" · ")}` : "";
}
