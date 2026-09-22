// Who is who inside a group, and how to actually remove them.
//
// In newer groups WhatsApp identifies each participant by their LID (...@lid) and the number (...@s.whatsapp.net)
// may never arrive: Baileys only fills in participant.phoneNumber when the server sends phone_number. Anything
// stored by number (the blacklist, warnings) has to cross-reference both identities before writing or removing, and
// removal must use the same id the group lists that person under: handing the number to a LID-addressed group
// throws no exception, it returns an error status you have to check by hand.
import { getUser } from "../database-functions.js";
import { lidMencionado } from "./menciones.js";

// Find someone among a group's participants by either of their two identities.
export function buscarEnGrupo(participants, { jid, lid } = {}) {
  if (!participants?.length) return null;
  return participants.find((p) => (lid && p.id === lid) || (jid && (p.id === jid || p.phoneNumber === jid))) || null;
}

// Someone's two identities, starting from one or more known ids. They're filled in from the database (users, which
// only has people who wrote at some point) and from the group participants, which sometimes carry the number of
// someone who never spoke.
export function identidadesDe(id, participants) {
  const ids = (Array.isArray(id) ? id : [id]).filter(Boolean);
  if (ids.length === 0) return { jid: null, lid: null, participante: null };

  let lid = ids.find((v) => v.endsWith("@lid")) || null;
  let jid = ids.find((v) => v.endsWith("@s.whatsapp.net")) || null;
  if (!lid && jid) lid = getUser(jid)?.lid || null;
  if (!jid && lid) jid = getUser(lid)?.jid || null;

  const participante = buscarEnGrupo(participants, { jid, lid });
  if (participante) {
    // The id the group lists the person under wins over a LID built from typed digits, which may be a phone number
    // disguised as a LID and not exist at all.
    if (participante.id?.endsWith("@lid") && (!lid || !getUser(lid))) lid = participante.id;
    if (!jid && participante.phoneNumber) jid = participante.phoneNumber;
  }
  return { jid, lid, participante };
}

// Remove, promote or demote while checking what WhatsApp answers: groupParticipantsUpdate does not fail when the
// group rejects the change, it returns the status inside the result ("200" is ok; 403 no permission, 404 not in the group).
export async function cambiarParticipante(client, chat, id, accion) {
  if (!id) return { ok: false, status: "sin-id" };
  try {
    const resultado = await client.groupParticipantsUpdate(chat, [id], accion);
    const status = String(resultado?.[0]?.status ?? "200");
    return { ok: status === "200", status };
  } catch (e) {
    return { ok: false, status: e?.message || "error" };
  }
}

export const expulsar = (client, chat, id) => cambiarParticipante(client, chat, id, "remove");

// Who a command points at, resolved to an id that exists in the database: it joins parsing the mention with the
// identity cross-reference, which is what has to happen before writing anything under that person's name. "quien" is
// the id to write with (null when there is no row), and "participante" is how the group lists them, which is what
// removal takes.
export function destinatario(m, text, participants) {
  // A hand-typed "+598 99 111 222" comes last: a real mention or a quoted message always wins over it.
  const conMas = String(text || "").match(/\+\d[\d\s-]*/);
  const mencionado = lidMencionado(m, text) || (conMas ? `${conMas[0].replace(/[^\d]/g, "")}@s.whatsapp.net` : null);
  if (!mencionado) return { mencionado: null, quien: null, objetivo: null, lid: null, jid: null, participante: null };

  // lidMencionado resolves a typed phone number only when the database knows it. For someone who never wrote there's no
  // row, "<digits>@lid" matches nobody, and the number form has to be tried against the group's participants.
  const digitos = String(mencionado).split("@")[0];
  const ids = getUser(mencionado) ? [mencionado] : [mencionado, `${digitos}@s.whatsapp.net`];
  const { lid, jid, participante } = identidadesDe(ids, participants);
  const quien = [lid, jid, mencionado].find((id) => id && getUser(id)) || null;

  // "quien" is for writing to the database (it definitely has a row) and "objetivo" for what does not need one, like
  // fetching the profile picture of someone who never wrote.
  return { mencionado, quien, objetivo: quien || participante?.id || lid || jid || mencionado, lid, jid, participante };
}
