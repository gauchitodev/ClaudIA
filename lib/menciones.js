// Who a command refers to: the message's mention (which may arrive as @lid or @jid, and is resolved to a lid), the
// "@number" written in the text, or the author of the quoted message. Returns the lid or null.
// It uses /@(\d+)/ and not "@[0-9\s]+" like the old plugins did: with spaces, a number following the mention (the
// stars in .calificar @persona 5, for instance) got glued onto the person's number.
import { getUser, lidDeNumero } from "../database-functions.js";

// "@<digits>" typed by hand, instead of picked from WhatsApp's mention list, may be a LID or a phone number: which one
// shows up depends on the group and on the client. A known LID wins, then a known phone number (resolved to its LID);
// with neither on record it's taken as a LID, which is what real mentions carry nowadays. Building "<digits>@lid"
// blindly turned every typed phone number into a LID that matches nobody.
export function lidDeDigitos(digitos) {
  const comoLid = `${digitos}@lid`;
  if (getUser(comoLid)) return comoLid;
  return lidDeNumero(`${digitos}@s.whatsapp.net`) || comoLid;
}

export function lidMencionado(m, text) {
  const primera = m?.mentionedJid?.[0];
  if (primera) return primera.endsWith("@lid") ? primera : lidDeNumero(primera) || primera;
  const digitos = String(text || "").match(/@(\d{3,})/);
  if (digitos) return lidDeDigitos(digitos[1]);
  return m?.quoted?.sender || null;
}

// Everyone a command points at, for the ones that take more than one. What the message carries as mentions comes
// first; failing that, the typed "@number"s; failing that, the author of the quoted message.
export function lidsMencionados(m, text) {
  const mencionados = (m?.mentionedJid || []).map((j) => (j.endsWith("@lid") ? j : lidDeNumero(j) || j));
  if (mencionados.length) return [...new Set(mencionados)];
  const tipeados = [...String(text || "").matchAll(/@(\d{3,})/g)].map(([, digitos]) => lidDeDigitos(digitos));
  if (tipeados.length) return [...new Set(tipeados)];
  return m?.quoted?.sender ? [m.quoted.sender] : [];
}

// How to name someone without tagging them: their nickname or WhatsApp name, and failing that "alguien", because the
// digits of their id would be their LID, which only the admins get to see (.id). For rankings and long lists, where
// mentioning everyone sends each of them a notification. It takes the id alone: it's handed to .map() as is. A WhatsApp
// name is whatever the person typed: an "@" with digits in it would tag whoever those digits are, since sendText turns
// every "@<digits>" into a mention (parseMention in lib/wa-socket.js), and so would "@@<digits>" with only one "@" taken
// out. Claudia is named by her own ids, which may have no row: otherwise a "@Claudia" in a message would read "@alguien".
export function nombreDe(lid) {
  const yo = globalThis.client?.user;
  if (lid && (lid === yo?.lid || lid === yo?.jid)) return "Claudia";
  const u = getUser(lid);
  return (u?.apodo || u?.pushName || "").replace(/@+(?=\d)/g, "").trim() || "alguien";
}

// A text the AI wrote, or someone typed (an alert, a post for sale), without the "@<digits>" that sendText turns into
// real mentions (parseMention in lib/wa-socket.js, with this same pattern): asked to "repeat" a list of numbers, Claudia
// tagged thirty people in a group with mentions off and .tagall blocked. A LID the bot knows is named instead; any other
// digits stay, without the "@": looking a phone number up would tell whose it is.
export const sinMenciones = (texto) => String(texto || "").replace(/@([0-9]{5,16}|0)/g, (_, digitos) => (getUser(`${digitos}@lid`) ? nombreDe(`${digitos}@lid`) : digitos));

// A text with its mentions the way WhatsApp shows them, "@Name", for where it won't turn them into names: a sticker, a
// voice note, a sticker pack's name. A mention travels in the text as "@" and the digits of the id it points at, a LID
// nowadays, which only the admins get to see (.id): ".ttp @persona" drew it on the sticker. Named are the message's own
// mentions (mencionados, its mentionedJid) and any LID the bot knows; someone without a name is "alguien". Other digits
// stay as typed: looking a phone number up would tell whose it is. arroba: false leaves the "@" out, to read it aloud,
// and a name that starts with digits goes without it too: "@" and digits is a mention, and .recordá answers with this
// text (a WhatsApp name of digits tagged whoever those digits are).
export function conNombres(texto, mencionados = [], { arroba = true } = {}) {
  const porDigitos = new Map();
  for (const id of mencionados || []) {
    const [usuario = "", dominio] = String(id).split("@");
    const digitos = usuario.split(":")[0];
    if (/^\d+$/.test(digitos) && dominio) porDigitos.set(digitos, `${digitos}@${dominio}`);
  }
  return String(texto || "").replace(/@(\d{5,16})(?!\d)/g, (tal, digitos) => {
    const id = porDigitos.get(digitos) || (getUser(`${digitos}@lid`) ? `${digitos}@lid` : null);
    if (!id) return tal;
    const nombre = nombreDe(id);
    return `${arroba && !/^\d/.test(nombre) ? "@" : ""}${nombre}`;
  });
}
