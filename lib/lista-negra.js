// Per-group blacklist: who is on it, and removing them from the group when they turn up.
// The identity cross-reference (LID vs number) and the removal itself live in lib/identidad.js, because anything
// that stores people by number needs them, not just this.
import { isBlacklisted, recordarLidEnListaNegra } from "../database-functions.js";
import { identidadesDe, expulsar, idsDelGrupo, buscarEnGrupo, esOwnerConfirmado, ownerSinConfirmar, confirmarOwnerNuevo } from "./identidad.js";

// Whether the list keeps them out of this group: the entry plus the resolved identities, or null. It stores the LID if
// it just turned up, so next time they're recognized right away. The bot's owners, as for their powers
// (esOwnerParaLaLista), it never keeps out, and that is asked before looking: looking stores the LID, and an owner the
// group lists with their number had theirs written on the entry of whoever had it before. The one listed got in, and
// the owner was removed wherever they came without the number.
// An entry under an owner's number WhatsApp hasn't said who has yet can only have matched by the number in the
// person's row, since one the event or the group brings makes them an owner: the owner's own row, or that of whoever
// had the number before. WhatsApp is asked (confirmarOwnerNuevo), as the owner's commands ask it about an old number
// (numeroActual). With no answer they're kept out all the same, as an owner's powers wait for it, but their LID isn't
// written on the entry, and the owner gets in once WhatsApp answers. Not asking, an owner whose event brought only
// their LID was removed, with their LID written on the entry.
export async function estaEnListaNegra(id, chat, participants) {
  const ids = (Array.isArray(id) ? id : [id]).filter(Boolean);
  if (!ids.length || esOwnerParaLaLista(ids, participants)) return null;
  const { jid, lid, participante, lidDeLaBase } = identidadesDe(ids, participants);
  const entrada = isBlacklisted([...ids, jid, lid], chat);
  if (!entrada) return null;
  if (ownerSinConfirmar(entrada.jid)) {
    await confirmarOwnerNuevo();
    if (esOwnerParaLaLista(ids, participants)) return null;
  }
  // Only a LID that came with the person, in the event or in the group: the one the database knows for their number may
  // be whoever had it before, and recorded, the one listed got back in as soon as they came with their own.
  if (lid && !lidDeLaBase && !ownerSinConfirmar(entrada.jid)) recordarLidEnListaNegra(entrada.chat, entrada.jid, lid);
  return { entrada, jid, lid, participante };
}

// Whether whoever comes with these ids is one of the bot's owners, as for their powers (esOwnerConfirmado): by the ids
// that come with them, and by the ones the group lists them with, whose number is theirs now. Not by the rows, as
// esOwnerDe goes for leaving them alone: someone else's row that still had an owner's number got them past the list
// when they came in, and they were removed only once they wrote. An owner WhatsApp hasn't confirmed yet, whose event
// brings only their LID, is asked about if an entry is under their number (estaEnListaNegra).
export function esOwnerParaLaLista(ids, participants) {
  const suyos = ids.filter((id) => typeof id === "string" && id);
  const enElGrupo = buscarEnGrupo(participants, { lid: suyos.find((id) => id.endsWith("@lid")), jid: suyos.find((id) => id.endsWith("@s.whatsapp.net")) });
  return esOwnerConfirmado([...suyos, ...idsDelGrupo(enElGrupo)]);
}

// Remove from the group anyone on the blacklist. "participantes" are the ones from the participants event (or
// whichever need checking); "participants" is the group's metadata. Returns what was removed and what failed, with
// "original" pointing at the entry that came in.
export async function expulsarDeListaNegra(client, chat, participantes, participants) {
  const expulsados = [];
  const fallados = [];
  for (const p of participantes || []) {
    // All of the participant's ids: the participants event hands out objects ({ id, phoneNumber, lid, admin }), not
    // strings, each one with both identities whenever the server sent them, which is what the blacklist needs to
    // cross-reference. Treating them as strings threw on every join. Bare ids are still accepted.
    const ids = idsDelGrupo(p);
    // The bot's owners are left alone (estaEnListaNegra), as when they write (plugins/_manejador-lista-negra.js): an
    // entry of someone listed before .ln could tell they were an owner removed them as soon as they came in.
    const encontrado = await estaEnListaNegra(ids, chat, participants);
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
