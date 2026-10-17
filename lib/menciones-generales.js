// The calls to everyone (.tagall, .tagall2, .ht, .ht2, a poll's call to vote and Claudia's .tagall): every member as
// the group lists them, except Claudia herself and whoever opted out in that group with .notagall
// (inGroup[chat].sinTagall), unless an admin forces it with .tagall -f. A mention notifies even in a muted group, and
// there was no way out of these. It isn't in lib/menciones.js because lib/identidad.js imports from there: the identity
// cross-reference used here would have made the two modules depend on each other.
import { getUser } from "../database-functions.js";
import { idsDeParticipante } from "./identidad.js";

// Whether someone opted out of the calls to everyone in a group. The LID rows go first and the first explicit true or
// false wins: an older database may hold a second row for the same person, keyed by number. getUser goes without the
// chat on purpose: with it, it writes an inGroup entry for every member it's asked about.
export function noRecibeLlamados(chatId, ids) {
  const ordenados = [...new Set((ids || []).filter(Boolean))].sort((a, b) => b.endsWith("@lid") - a.endsWith("@lid"));
  for (const id of ordenados) {
    const valor = getUser(id)?.inGroup?.[chatId]?.sinTagall;
    if (typeof valor === "boolean") return valor;
  }
  return false;
}

// Claudia as a member of the group: by LID, or by number in the groups that list people that way (lib/bienvenida.js).
const esClaudia = (client, p) => [p?.id, p?.lid, p?.phoneNumber].some((id) => id && (id === client?.user?.lid || id === client?.user?.jid));

// The members to mention, as the group lists them (p.id), and how many were left out for having opted out. The plugins
// used to mention everyone, Claudia included, with an excludeJids list that excluded nobody.
export function mencionesParaTodos(chatId, participants, { client = globalThis.client, forzar = false } = {}) {
  const ids = [];
  let fuera = 0;
  for (const p of participants || []) {
    if (!p?.id || esClaudia(client, p)) continue;
    if (!forzar && noRecibeLlamados(chatId, idsDeParticipante(p))) {
      fuera++;
      continue;
    }
    ids.push(p.id);
  }
  return { ids, fuera };
}

// ".tagall -f Mañana no hay reunión": the flag only counts as the first word, and it's taken out of the message. The
// iPhone turns "--" into a dash, so "—force" counts too.
export function separarForzado(texto) {
  const t = String(texto || "");
  const encontrado = t.match(/^\s*(?:-f|--force|[—–]force)(?=\s|$)\s*/i);
  return encontrado ? { forzar: true, texto: t.slice(encontrado[0].length) } : { forzar: false, texto: t };
}

export const TEXTOS_LLAMADOS = {
  forzado: "📢 Aviso forzado: les llega también a quienes pidieron no recibir los llamados a todos.",
  soloAdmins: "❌ El -f (forzar el aviso) es solo para los admins del grupo.",
};

export const pieFuera = (n) => `🔕 ${n === 1 ? "1 persona no recibe" : `${n} personas no reciben`} menciones generales (.notagall)`;

// Nobody to mention: everyone opted out, or the member list didn't come (the group's metadata failed).
export const textoSinNadie = (fuera) =>
  fuera > 0 ? "🔕 No hay a quién mencionar: todos pidieron no recibir los llamados a todos (.notagall). Un admin puede forzarlo con .tagall -f." : "No pude ver la lista de miembros del grupo; probá de nuevo en un rato.";

const LEER_MAS = String.fromCharCode(8206).repeat(4001); // pushes the list of mentions behind WhatsApp's "read more"

// .tagall's message, .tagall2's too: what was said, then who it doesn't reach (or that it was forced), in the visible
// part, and the mentions behind the "read more".
export function textoTagall({ texto = "", ids = [], fuera = 0, forzado = false } = {}) {
  const nota = forzado ? TEXTOS_LLAMADOS.forzado : fuera > 0 ? pieFuera(fuera) : "";
  return `*[ 🗣️ 🇭 🇴 🇱 🇦❕]*\n\n*MENSAJE:* ${texto || "_no_establecido_"}${nota ? `\n\n${nota}` : ""}\n\n${LEER_MAS}${ids.map((id) => `@${id.split("@")[0]}`).join(" ")}`;
}
