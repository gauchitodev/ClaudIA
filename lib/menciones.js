// A quién se refiere un comando: la mención del mensaje (que puede venir como @lid o como @jid, y se resuelve a lid),
// el "@número" escrito en el texto, o el autor del mensaje citado. Devuelve el lid o null.
// Se usa /@(\d+)/ y no "@[0-9\s]+" como en los plugins viejos: con espacios, un número que viene después de la
// mención (por ejemplo las estrellas de .calificar @persona 5) se pegaba al número de la persona.
import { getUser } from "../database-functions.js";

export function lidMencionado(m, text) {
  const primera = m?.mentionedJid?.[0];
  if (primera) return primera.endsWith("@lid") ? primera : getUser(primera)?.lid || primera;
  const digitos = String(text || "").match(/@(\d{3,})/);
  if (digitos) return `${digitos[1]}@lid`;
  return m?.quoted?.sender || null;
}
