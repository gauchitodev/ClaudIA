// Someone's own social links, for their profile in a group (.misredes, plugins/misredes.js): each one loads theirs, by
// username or by link, in the group where they want them shown (users.inGroup[chat].redes, as .notagall's choice is
// kept), and .perfil lists them. They're personal data: nobody loads someone else's, an admin can take one out, and
// the AI never gets them (the group's, lib/redes.js, do go).
import { getUser, updateUserInGroup } from "../database-functions.js";
import { nombreDe } from "./menciones.js";
import { lidMencionadoActual } from "./identidad.js";
import { leerLink, esDe } from "./redes.js";

export const REDES_PERSONA = { MAX_LARGO: 200 };

// Each network: the domains a link of theirs may have (any subdomain), and how a username becomes a link. Discord has
// no profile links, so the username is kept as typed; Mastodon lives on any instance, so a @usuario@instancia goes to
// that instance and a link may be of any domain; the web takes any http(s) link.
export const CATALOGO_PERSONA = {
  instagram: { nombre: "Instagram", emoji: "📸", dominios: ["instagram.com"], link: (u) => `https://instagram.com/${u}` },
  x: { nombre: "X", emoji: "🐦", dominios: ["x.com", "twitter.com"], link: (u) => `https://x.com/${u}` },
  tiktok: { nombre: "TikTok", emoji: "🎵", dominios: ["tiktok.com"], link: (u) => `https://tiktok.com/@${u}` },
  threads: { nombre: "Threads", emoji: "🧵", dominios: ["threads.net", "threads.com"], link: (u) => `https://threads.net/@${u}` },
  bluesky: { nombre: "Bluesky", emoji: "🦋", dominios: ["bsky.app"], link: (u) => `https://bsky.app/profile/${u.includes(".") ? u : `${u}.bsky.social`}` },
  mastodon: { nombre: "Mastodon", emoji: "🐘", dominios: null, link: null },
  facebook: { nombre: "Facebook", emoji: "📘", dominios: ["facebook.com", "fb.com", "fb.me"], link: (u) => `https://facebook.com/${u}` },
  youtube: { nombre: "YouTube", emoji: "▶️", dominios: ["youtube.com", "youtu.be"], link: (u) => `https://youtube.com/@${u}` },
  twitch: { nombre: "Twitch", emoji: "🎥", dominios: ["twitch.tv"], link: (u) => `https://twitch.tv/${u}` },
  spotify: { nombre: "Spotify", emoji: "🎧", dominios: ["spotify.com"], link: (u) => `https://open.spotify.com/user/${u}` },
  github: { nombre: "GitHub", emoji: "🐙", dominios: ["github.com"], link: (u) => `https://github.com/${u}` },
  steam: { nombre: "Steam", emoji: "🎮", dominios: ["steamcommunity.com"], link: (u) => `https://steamcommunity.com/id/${u}` },
  linkedin: { nombre: "LinkedIn", emoji: "💼", dominios: ["linkedin.com"], link: (u) => `https://linkedin.com/in/${u}` },
  telegram: { nombre: "Telegram", emoji: "✈️", dominios: ["t.me", "telegram.me"], link: (u) => `https://t.me/${u}` },
  discord: { nombre: "Discord", emoji: "👾", dominios: null, link: null, texto: true },
  web: { nombre: "Web", emoji: "🌐", dominios: null, link: null },
};
const ALIAS = { insta: "instagram", ig: "instagram", twitter: "x", fb: "facebook", yt: "youtube", tg: "telegram", bsky: "bluesky", masto: "mastodon", sitio: "web", pagina: "web" };
const sinAcentos = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
export const listaDeRedesPersona = () => Object.keys(CATALOGO_PERSONA).join(", ");

export function leerRedPersona(palabra) {
  const k = sinAcentos(palabra);
  return CATALOGO_PERSONA[k] ? k : ALIAS[k] || null;
}

const USUARIO = /^@?([\w.-]{1,64})$/;
const USUARIO_MASTODON = /^@?([\w.-]+)@([\w-]+(?:\.[\w-]+)+)$/;
const USUARIO_DISCORD = /^@?([a-z0-9._]{2,32}(?:#\d{4})?)$/i;

// What's kept for a network out of what was typed: the link, built from the username when one was given, or the
// username itself for Discord. { valor } or { error }.
export function valorDe(red, texto) {
  const c = CATALOGO_PERSONA[red];
  const t = String(texto || "").trim();
  if (!t) return { error: c.texto ? `Pasame tu usuario de ${c.nombre}: .misredes ${red} usuario` : c.link ? `Pasame tu usuario o el link: .misredes ${red} @usuario` : `Pasame el link completo, con https://: .misredes ${red} https://…` };
  if (t.length > REDES_PERSONA.MAX_LARGO) return { error: `Muy largo: como mucho ${REDES_PERSONA.MAX_LARGO} caracteres.` };
  if (c.texto) {
    const m = USUARIO_DISCORD.exec(t);
    return m ? { valor: m[1] } : { error: `Pasame tu usuario de ${c.nombre}, sin link: .misredes ${red} usuario` };
  }
  const link = leerLink(t);
  if (link) return c.dominios && !esDe(link, c.dominios) ? { error: `Ese link no es de ${c.nombre}: tiene que ser de ${c.dominios.join(" o ")}.` } : { valor: link };
  if (red === "mastodon") {
    const m = USUARIO_MASTODON.exec(t);
    return m ? { valor: `https://${m[2]}/@${m[1]}` } : { error: "Pasame tu usuario de Mastodon con su instancia (@usuario@instancia) o el link." };
  }
  const m = c.link ? USUARIO.exec(t) : null;
  if (m) return { valor: c.link(m[1]) };
  return { error: c.link ? `Pasame tu usuario o el link: .misredes ${red} @usuario` : `Pasame el link completo, con https://: .misredes ${red} https://…` };
}

export function redesPersonaDe(lid, chat) {
  const r = getUser(lid)?.inGroup?.[chat]?.redes;
  return r && typeof r === "object" && !Array.isArray(r) ? r : {};
}
// A network as it's shown: the link, or "Discord: usuario".
const mostrar = (red, valor) => (CATALOGO_PERSONA[red].texto ? `${CATALOGO_PERSONA[red].nombre}: ${valor}` : valor);

export function fijarRedPersona(lid, chat, palabra, texto) {
  const red = leerRedPersona(palabra);
  if (!red) return { ok: false, error: `No conozco esa red. Las que van: ${listaDeRedesPersona()}.` };
  const v = valorDe(red, texto);
  if (v.error) return { ok: false, error: v.error };
  if (!updateUserInGroup(lid, chat, { redes: { ...redesPersonaDe(lid, chat), [red]: v.valor } })) return { ok: false, error: "No pude guardarlo, probá de nuevo en un rato." };
  const c = CATALOGO_PERSONA[red];
  return { ok: true, red, valor: v.valor, mensaje: `${c.emoji} Listo: tu ${c.nombre} quedó en tu perfil de este grupo: ${mostrar(red, v.valor)}` };
}

// One network, or every one with "todo". mensaje is for whoever takes their own out; mensajeAjeno, for the admin who
// takes someone else's.
export function borrarRedPersona(lid, chat, palabra) {
  const redes = redesPersonaDe(lid, chat);
  const nombre = nombreDe(lid);
  if (/^tod[oa]s?$/i.test(String(palabra || ""))) {
    if (!Object.keys(redes).length) return { ok: false, error: "No hay redes cargadas en este grupo." };
    if (!updateUserInGroup(lid, chat, { redes: {} })) return { ok: false, error: "No pude guardarlo, probá de nuevo en un rato." };
    return { ok: true, red: null, mensaje: "🗑️ Listo, saqué todas tus redes de este grupo.", mensajeAjeno: `🗑️ Listo, le saqué todas las redes a ${nombre} en este grupo.` };
  }
  const red = leerRedPersona(palabra);
  if (!red) return { ok: false, error: `¿Cuál saco? .misredes borrar instagram, o .misredes borrar todo. Van: ${listaDeRedesPersona()}.` };
  const c = CATALOGO_PERSONA[red];
  if (!redes[red]) return { ok: false, error: `No hay ${c.nombre} cargado en este grupo.` };
  const { [red]: _, ...resto } = redes;
  if (!updateUserInGroup(lid, chat, { redes: resto })) return { ok: false, error: "No pude guardarlo, probá de nuevo en un rato." };
  return { ok: true, red, mensaje: `🗑️ Listo, saqué tu ${c.nombre} de este grupo.`, mensajeAjeno: `🗑️ Listo, le saqué el ${c.nombre} a ${nombre} en este grupo.` };
}

// .misredes: someone's networks in this group, theirs (esPropio) or another's, named and not tagged.
export function textoRedesPersona(lid, chat, { esPropio = false } = {}) {
  const redes = redesPersonaDe(lid, chat);
  const lineas = Object.keys(CATALOGO_PERSONA)
    .filter((r) => redes[r])
    .map((r) => `${CATALOGO_PERSONA[r].emoji} ${CATALOGO_PERSONA[r].nombre}: ${redes[r]}`);
  if (!lineas.length) return esPropio ? `🔗 No tenés redes cargadas en este grupo. Cargá una con .misredes instagram @usuario (o el link). Van: ${listaDeRedesPersona()}.` : `🔗 ${nombreDe(lid)} no tiene redes cargadas en este grupo.`;
  return `${esPropio ? "🔗 *Tus redes en este grupo*" : `🔗 *Redes de ${nombreDe(lid)} en este grupo*`}\n${lineas.join("\n")}`;
}

// The profile's username out of its link, for the cards: the last piece of the path ("xuru", "xuru.bsky.social").
export function usuarioDe(link) {
  try {
    const { hostname, pathname } = new URL(link);
    const partes = pathname.split("/").filter(Boolean);
    return (partes.at(-1) || hostname).replace(/^@/, "");
  } catch {
    return String(link);
  }
}

// A card to share a profile with the group: whose it is, the username and the link (Discord has no link).
export function tarjetaDeRed(red, valor, deQuien) {
  const c = CATALOGO_PERSONA[red];
  const usuario = c.texto ? valor : usuarioDe(valor);
  return [`${c.emoji} *${c.nombre} de @${deQuien.split("@")[0]}*`, `👤 @${usuario}`, ...(c.texto ? [] : [`🔗 ${valor}`])].join("\n");
}

const VIDEO_DE_YOUTUBE = /\/(watch|shorts)\b|youtu\.be\//i;

// What the commands that share a network's profile with the group (.ig, .tt, .igdl and .x, .threads and the rest in
// plugins/tarjeta-red.js) answer for what came after them, as { texto, mentions }. A username or a link, as
// .misredes takes them: the card. Someone mentioned (an "@" with digits in the text, as WhatsApp writes a mention):
// their profile, as they loaded it with .misredes in this group, or that they loaded none. Nothing: one's own, loaded
// the same way, or how it's used (uso). comando is the one typed, for the answers that name it.
export async function tarjetaPedida(red, { client, m, text, participants, comando, uso }) {
  const c = CATALOGO_PERSONA[red];
  const t = String(text || "").trim();
  if (/@\d{3,}/.test(t)) {
    const quien = await lidMencionadoActual(client, m, t, participants);
    if (quien) {
      const valor = redesPersonaDe(quien, m.chat)[red];
      if (!valor) return { texto: `${c.emoji} ${nombreDe(quien)} no tiene ${c.nombre} cargado en este grupo: se carga con .misredes ${red} @usuario.` };
      return { texto: tarjetaDeRed(red, valor, quien), mentions: [quien] };
    }
  }
  if (!t) {
    const propio = redesPersonaDe(m.sender, m.chat)[red];
    if (propio) return { texto: tarjetaDeRed(red, propio, m.sender), mentions: [m.sender] };
    return { texto: `${c.emoji} ${uso} Si lo cargás con .misredes ${red} @usuario, después alcanza con .${comando} solo.` };
  }
  const v = valorDe(red, t);
  if (v.error) return { texto: `❌ ${v.error.replace(`.misredes ${red}`, `.${comando}`)}` };
  if (red === "youtube" && VIDEO_DE_YOUTUBE.test(v.valor)) return { texto: `▶️ Eso es un video: para bajarlo, .video <link> (o .play, el audio). Para mandar tu canal: .${comando} @usuario` };
  return { texto: tarjetaDeRed(red, v.valor, m.sender), mentions: [m.sender] };
}

// .perfil's line: every network in one line, the links without their https:// and www.; "" with none.
export function lineaDeRedes(lid, chat) {
  const redes = redesPersonaDe(lid, chat);
  const partes = Object.keys(CATALOGO_PERSONA)
    .filter((r) => redes[r])
    .map((r) => `${CATALOGO_PERSONA[r].emoji} ${CATALOGO_PERSONA[r].texto ? mostrar(r, redes[r]) : redes[r].replace(/^https?:\/\/(www\.)?/i, "")}`);
  return partes.length ? `🔗 ${partes.join(" · ")}` : "";
}
