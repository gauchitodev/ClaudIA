// Who is who inside a group, and how to actually remove them.
//
// In newer groups WhatsApp identifies each participant by their LID (...@lid) and the number (...@s.whatsapp.net)
// may never arrive: Baileys only fills in participant.phoneNumber when the server sends phone_number. Anything
// stored by number (the blacklist, warnings) has to cross-reference both identities before writing or removing, and
// removal must use the same id the group lists that person under: handing the number to a LID-addressed group
// throws no exception, it returns an error status you have to check by hand.
import { setTimeout as esperar } from "node:timers/promises";
import { getUser, lidDeNumero } from "../database-functions.js";
import { lidMencionado, lidEnElGrupo } from "./menciones.js";

export const IDENTIDAD = {
  CONSULTA_MS: 3000, // how long it waits for WhatsApp's answer about a number (lidSegunWhatsApp), as .inactivos does
};
// Swappable from the tests.
export const _dep = { esperar };

// The ids a participant of a group event (someone joining or leaving) may be known by: whatever the event brings (id,
// lid, phoneNumber) and, for a number, the LID the database knows them by. For the cleanups on leaving (lib/roles.js,
// lib/compraventa.js) and for when someone came in (lib/contexto-chat.js).
export function idsDeParticipante(participante) {
  const crudos = typeof participante === "string" ? [participante] : [participante?.id, participante?.lid, participante?.phoneNumber];
  const ids = new Set(crudos.filter((id) => typeof id === "string" && id));
  for (const id of [...ids]) {
    const lid = id.endsWith("@lid") ? null : lidDeNumero(id);
    if (lid) ids.add(lid);
  }
  return [...ids];
}

// Whether two ids, or two lists of them, are the same person: an id in common, counting the LID the database knows for a
// number. One message may bring someone's number and the next their LID: compared as they came, whoever replied to their
// own photo with .vendo heard it wasn't theirs, and couldn't close their own post. A LID isn't turned into a number: a
// recycled number has two people's LIDs, and through it they'd be one.
export function mismaPersona(a, b) {
  const ids = (x) => (Array.isArray(x) ? x : [x]).flatMap((id) => idsDeParticipante(id));
  const deA = new Set(ids(a));
  return ids(b).some((id) => deA.has(id));
}

// Whether a group's participant is this person, by either of their two identities. A group that lists people by LID
// names them by it (id) and may bring the number apart (phoneNumber); one that lists them by number, the other way
// around (lid): Baileys' groupMetadata. Looking at the id alone, in those groups the bot wouldn't see itself as admin,
// nor a WhatsApp admin whose message brings their LID.
export const esParticipante = (p, { jid, lid } = {}) => Boolean(p) && Boolean((lid && (p.id === lid || p.lid === lid)) || (jid && (p.id === jid || p.phoneNumber === jid)));

// Find someone among a group's participants by either of their two identities: by the LID first, which is theirs for
// good, and only failing that by the number, which moves on (recycled, or its owner changed numbers) while the database
// may still have it on whoever had it before. Looking for either in the group's order, ".kick @persona" removed whoever
// came first with the number the person's row still had.
export function buscarEnGrupo(participants, { jid, lid } = {}) {
  if (!participants?.length) return null;
  return (lid && participants.find((p) => esParticipante(p, { lid }))) || participants.find((p) => esParticipante(p, { jid, lid })) || null;
}

// "Is this person in the group?" as a lid -> boolean, for the lists that only show a group's own people (.familias,
// .listaparejas): couples and families are stored by lid, and the group may list someone by number.
export const estaEnGrupo = (participants) => (lid) => Boolean(buscarEnGrupo(participants, { lid, jid: getUser(lid)?.jid }));

// Someone's two identities, starting from one or more known ids. They're filled in from the database (users, which
// only has people who wrote at some point) and from the group participants, which sometimes carry the number of
// someone who never spoke. Given only the number, the LID is whoever the group lists with it, who has it now: the one
// the database knows may be whoever had it before, a number that moved on to someone who hasn't written where the bot
// is. lidDeLaBase says the LID came only from the database, which is right most of the time and still a guess:
// recorded on a blacklist entry, whoever was listed got back in as soon as they came with their own LID.
export function identidadesDe(id, participants) {
  const ids = (Array.isArray(id) ? id : [id]).filter(Boolean);
  if (ids.length === 0) return { jid: null, lid: null, participante: null, lidDeLaBase: false };

  let lid = ids.find((v) => v.endsWith("@lid")) || null;
  let jid = ids.find((v) => v.endsWith("@s.whatsapp.net")) || null;
  if (!lid && jid) lid = lidEnElGrupo(participants, jid);
  const deLaBase = !lid && jid ? lidDeNumero(jid) : null;
  if (deLaBase) lid = deLaBase;
  if (!jid && lid) jid = getUser(lid)?.jid || null;

  const participante = buscarEnGrupo(participants, { jid, lid });
  if (participante) {
    // The id the group lists the person under wins over a LID built from typed digits, which may be a phone number
    // disguised as a LID and not exist at all. A group that lists people by number brings the LID apart.
    const lidDelGrupo = participante.id?.endsWith("@lid") ? participante.id : participante.lid;
    if (lidDelGrupo && (!lid || !getUser(lid))) lid = lidDelGrupo;
    if (!jid) jid = participante.id?.endsWith("@s.whatsapp.net") ? participante.id : participante.phoneNumber || null;
  }
  return { jid, lid, participante, lidDeLaBase: Boolean(deLaBase) && lid === deLaBase };
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

// The LID WhatsApp has now for a number, asking its server, or null. The one the database knows may be whoever had the
// number before (recycled, or left by its owner for another), and so may the one Baileys keeps: its lidMapping answers
// from its own store when it has the number there, and asks the server only when it doesn't (Signal/lid-mapping.js).
// This is the question it asks then, USync's LID query (pnFromLIDUSync, Socket/socket.js), made always. At most
// CONSULTA_MS: a command doesn't hang on WhatsApp. Baileys is loaded only to ask.
export async function lidSegunWhatsApp(client, numero) {
  if (typeof client?.executeUSyncQuery !== "function" || !String(numero || "").endsWith("@s.whatsapp.net")) return null;
  const { USyncQuery, USyncUser } = await import("@whiskeysockets/baileys");
  const consulta = new USyncQuery().withLIDProtocol().withContext("background").withUser(new USyncUser().withId(numero));
  const tope = _dep.esperar(IDENTIDAD.CONSULTA_MS, null, { ref: false });
  const respuesta = await Promise.race([Promise.resolve().then(() => client.executeUSyncQuery(consulta)).catch(() => null), tope]);
  const lid = respuesta?.list?.find((r) => r?.lid)?.lid; // asked about one number, whatever comes is about it
  return typeof lid === "string" && lid.endsWith("@lid") ? lid.replace(/:\d+@/, "@") : null;
}

// Who a command points at, resolved to an id that exists in the database: it joins parsing the mention with the
// identity cross-reference, which is what has to happen before writing anything under that person's name. "quien" is
// the id to write with (null when there is no row), and "participante" is how the group lists them, which is what
// removal takes. segunWhatsApp, { lid, numero }, is who WhatsApp said has the number the command named them by
// (destinatarioActual).
export function destinatario(m, text, participants, segunWhatsApp = null) {
  // A hand-typed "+598 99 111 222" comes last: a real mention or a quoted message always wins over it.
  const conMas = String(text || "").match(/\+\d[\d\s-]*/);
  const mencionado = lidMencionado(m, text, participants) || (conMas ? `${conMas[0].replace(/[^\d]/g, "")}@s.whatsapp.net` : null);
  if (!mencionado) return { mencionado: null, quien: null, objetivo: null, lid: null, jid: null, participante: null };

  // That's who it is, and their row only if they have one: by the number, the database may still read whoever had it.
  if (segunWhatsApp) {
    const { lid, jid, participante } = identidadesDe([segunWhatsApp.lid, segunWhatsApp.numero], participants);
    const quien = getUser(lid) ? lid : null;
    return { mencionado: segunWhatsApp.numero, quien, objetivo: quien || participante?.id || lid, lid, jid, participante };
  }

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

// The number a command names someone by, when that's all it brings of them and the group doesn't pair it with a LID:
// typed (".kick +598…", or "@598…" typed by hand, which isn't a LID the bot knows) or a mention by number. null for a
// LID mention, a quoted message, or digits of a LID the bot knows. The same order as lidMencionado and destinatario.
function numeroSinLid(m, text, participants) {
  const primera = m?.mentionedJid?.[0];
  const digitos = String(text || "").match(/@(\d{3,})/)?.[1];
  const conMas = String(text || "").match(/\+\d[\d\s-]*/)?.[0];
  let numero = null;
  if (primera) numero = primera.endsWith("@s.whatsapp.net") ? primera : null;
  else if (digitos) numero = digitos.length >= 7 && !getUser(`${digitos}@lid`) ? `${digitos}@s.whatsapp.net` : null;
  else if (!m?.quoted?.sender && conMas) numero = `${conMas.replace(/[^\d]/g, "")}@s.whatsapp.net`;
  return numero && !lidEnElGrupo(participants, numero) ? numero : null;
}

// destinatario, for the commands that do something to the person: when they're named only by a number the group doesn't
// pair with a LID, WhatsApp is asked who has it now (lidSegunWhatsApp). With the database's guess, which may be whoever
// had the number before, ".kick +598…" removed them, ".advertir" and ".mute" landed on them, and ".rd" deleted their
// data. Without an answer in time, destinatario's guess, as before.
export async function destinatarioActual(client, m, text, participants) {
  const numero = numeroSinLid(m, text, participants);
  const lid = numero ? await lidSegunWhatsApp(client, numero) : null;
  return destinatario(m, text, participants, lid ? { lid, numero } : null);
}

// lidMencionado, the same way, for the roles (.moderador @598…, .adminbot): the role went to whoever had the number.
export async function lidMencionadoActual(client, m, text, participants) {
  const numero = numeroSinLid(m, text, participants);
  return (numero && (await lidSegunWhatsApp(client, numero))) || lidMencionado(m, text, participants);
}
