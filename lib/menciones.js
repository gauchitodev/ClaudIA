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

// Todas las personas a las que apunta un comando, para los que aceptan más de una. Se prioriza lo que el mensaje trae
// como menciones; si no hay, los "@número" tipeados; y si no, el autor del citado.
export function lidsMencionados(m, text) {
  const mencionados = (m?.mentionedJid || []).map((j) => (j.endsWith("@lid") ? j : getUser(j)?.lid || j));
  if (mencionados.length) return [...new Set(mencionados)];
  const tipeados = [...String(text || "").matchAll(/@(\d{3,})/g)].map(([, digitos]) => `${digitos}@lid`);
  if (tipeados.length) return [...new Set(tipeados)];
  return m?.quoted?.sender ? [m.quoted.sender] : [];
}

// Cómo nombrar a alguien sin etiquetarlo: su apodo o su nombre de WhatsApp, y si no, el número. Para rankings y listas
// largas, donde mencionar a todos les manda una notificación a cada uno.
export function nombreDe(lid) {
  const u = getUser(lid);
  return (u?.apodo || u?.pushName || "").trim() || String(lid).split("@")[0];
}
