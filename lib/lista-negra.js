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

// Remove from the group anyone on the blacklist. "ids" are the ones from the participants event (or whichever need
// checking); "participants" is the group's fresh metadata. Returns what was removed and what failed.
export async function expulsarDeListaNegra(client, chat, ids, participants) {
  const expulsados = [];
  const fallados = [];
  for (const id of ids || []) {
    const encontrado = estaEnListaNegra(id, chat, participants);
    if (!encontrado) continue;
    // The id the group lists the person under is the only one WhatsApp accepts for removing them.
    const objetivo = encontrado.participante?.id || encontrado.lid || encontrado.jid || id;
    const { ok, status } = await expulsar(client, chat, objetivo);
    if (ok) expulsados.push({ id: objetivo, original: id, entrada: encontrado.entrada });
    else fallados.push({ id: objetivo, original: id, status });
  }
  if (fallados.length) console.error("[lista negra] no se pudo expulsar de", chat, fallados.map((f) => `${f.id} (${f.status})`).join(", "));
  return { expulsados, fallados };
}
