// Per-group blacklist: who is on it, and removing them from the group when they turn up.
// The identity cross-reference (LID vs number) and the removal itself live in lib/identidad.js, because anything
// that stores people by number needs them, not just this.
import { isBlacklisted, recordarLidEnListaNegra } from "../database-functions.js";
import { identidadesDe, expulsar } from "./identidad.js";

// Are they on this group's blacklist? Returns the entry plus the resolved identities, and stores the LID if it just
// turned up, so next time they're recognized right away.
export function estaEnListaNegra(id, chat, participants) {
  const ids = (Array.isArray(id) ? id : [id]).filter(Boolean);
  const { jid, lid, participante } = identidadesDe(ids, participants);
  const entrada = isBlacklisted([...ids, jid, lid], chat);
  if (!entrada) return null;
  if (lid) recordarLidEnListaNegra(entrada.chat, entrada.jid, lid);
  return { entrada, jid, lid, participante };
}

// Every identity a participant brings. The participants event hands out objects ({ id, phoneNumber, lid, admin }),
// not strings, each one with both identities whenever the server sent them: exactly what the blacklist needs to
// cross-reference. Treating them as strings threw on every join. Bare ids are still accepted.
const idsDe = (p) => (typeof p === "string" ? [p] : [p?.id, p?.phoneNumber, p?.lid].filter(Boolean));

// Remove from the group anyone on the blacklist. "participantes" are the ones from the participants event (or
// whichever need checking); "participants" is the group's metadata. Returns what was removed and what failed, with
// "original" pointing at the entry that came in.
export async function expulsarDeListaNegra(client, chat, participantes, participants) {
  const expulsados = [];
  const fallados = [];
  for (const p of participantes || []) {
    const ids = idsDe(p);
    if (!ids.length) continue;
    const encontrado = estaEnListaNegra(ids, chat, participants);
    if (!encontrado) continue;
    // The id the group lists the person under is the only one WhatsApp accepts for removing them. The event's own id
    // is exactly that, even when the metadata is a step behind.
    const objetivo = encontrado.participante?.id || (typeof p === "string" ? null : p.id) || encontrado.lid || encontrado.jid || ids[0];
    const { ok, status } = await expulsar(client, chat, objetivo);
    if (ok) expulsados.push({ id: objetivo, original: p, entrada: encontrado.entrada });
    else fallados.push({ id: objetivo, original: p, status });
  }
  if (fallados.length) console.error("[lista negra] no se pudo expulsar de", chat, fallados.map((f) => `${f.id} (${f.status})`).join(", "));
  return { expulsados, fallados };
}
