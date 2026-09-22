// Who a command refers to: the message's mention (which may arrive as @lid or @jid, and is resolved to a lid), the
// "@number" written in the text, or the author of the quoted message. Returns the lid or null.
// It uses /@(\d+)/ and not "@[0-9\s]+" like the old plugins did: with spaces, a number following the mention (the
// stars in .calificar @persona 5, for instance) got glued onto the person's number.
import { getUser } from "../database-functions.js";

// "@<digits>" typed by hand, instead of picked from WhatsApp's mention list, may be a LID or a phone number: which one
// shows up depends on the group and on the client. A known LID wins, then a known phone number (resolved to its LID);
// with neither on record it's taken as a LID, which is what real mentions carry nowadays. Building "<digits>@lid"
// blindly turned every typed phone number into a LID that matches nobody.
export function lidDeDigitos(digitos) {
  const comoLid = `${digitos}@lid`;
  if (getUser(comoLid)) return comoLid;
  return getUser(`${digitos}@s.whatsapp.net`)?.lid || comoLid;
}

export function lidMencionado(m, text) {
  const primera = m?.mentionedJid?.[0];
  if (primera) return primera.endsWith("@lid") ? primera : getUser(primera)?.lid || primera;
  const digitos = String(text || "").match(/@(\d{3,})/);
  if (digitos) return lidDeDigitos(digitos[1]);
  return m?.quoted?.sender || null;
}

// Everyone a command points at, for the ones that take more than one. What the message carries as mentions comes
// first; failing that, the typed "@number"s; failing that, the author of the quoted message.
export function lidsMencionados(m, text) {
  const mencionados = (m?.mentionedJid || []).map((j) => (j.endsWith("@lid") ? j : getUser(j)?.lid || j));
  if (mencionados.length) return [...new Set(mencionados)];
  const tipeados = [...String(text || "").matchAll(/@(\d{3,})/g)].map(([, digitos]) => lidDeDigitos(digitos));
  if (tipeados.length) return [...new Set(tipeados)];
  return m?.quoted?.sender ? [m.quoted.sender] : [];
}

// How to name someone without tagging them: their nickname or WhatsApp name, and failing that their number. For
// rankings and long lists, where mentioning everyone sends each of them a notification.
export function nombreDe(lid) {
  const u = getUser(lid);
  return (u?.apodo || u?.pushName || "").trim() || String(lid).split("@")[0];
}
