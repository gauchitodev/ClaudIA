// Who is who, for the whole bot, and how to actually remove someone. Everyone has a LID (...@lid), theirs for good,
// and a number (...@s.whatsapp.net), which moves on: recycled, or left by its owner for another. The same question
// asked several ways got several answers once a number changed hands, so they're answered here, and this file imports
// nothing else of the bot's but the database: lib/menciones.js and the rest ask it.
//
// In newer groups WhatsApp identifies each participant by their LID (...@lid) and the number (...@s.whatsapp.net)
// may never arrive: Baileys only fills in participant.phoneNumber when the server sends phone_number. Anything
// stored by number (the blacklist, warnings) has to cross-reference both identities before writing or removing, and
// removal must use the same id the group lists that person under: handing the number to a LID-addressed group
// throws no exception, it returns an error status you have to check by hand.
import { setTimeout as esperar } from "node:timers/promises";
import { getUser, lidDeNumero, jidDeLid, esOwner, numerosDeOwners } from "../database-functions.js";
// The owners' ids in one query, their numbers and the LIDs of all their rows: for what goes over a whole group at once
// (.inactivos), where esOwnerDe for each member was a query per member and id.
export { idsDeOwners } from "../database-functions.js";

export const IDENTIDAD = {
  CONSULTA_MS: 3000, // how long it waits for WhatsApp's answer about a number (lidSegunWhatsApp), as .inactivos does
};
// Swappable from the tests.
export const _dep = { esperar };

// The ids a group participant comes with, as the group gives them, without asking the database: its id, and the lid or
// the phoneNumber it brings apart. A bare id is itself.
export function idsDelGrupo(participante) {
  const crudos = typeof participante === "string" ? [participante] : [participante?.id, participante?.lid, participante?.phoneNumber];
  return crudos.filter((id) => typeof id === "string" && id);
}

// The bot's own two ids, from its connection (lib/wa-socket.js takes the device out of them).
export const idsDelBot = (client = globalThis.client) => [client?.user?.lid, client?.user?.jid].filter(Boolean);

// Whether an id, any id of a list, or a group participant (by any id it comes with) is the bot, by its LID or by its
// number.
export function esElBot(x, client = globalThis.client) {
  const suyos = idsDelBot(client);
  return (Array.isArray(x) ? x : idsDelGrupo(x)).some((id) => id && suyos.includes(id));
}

// Whether this id, or any of these, is one of the bot's owners, for leaving them alone (moderation, notices, ranks):
// esOwner takes the number or a LID (through the owner's rows), and a person may come with both. One too many is no
// harm there. An owner's powers go by esOwnerConfirmado.
export const esOwnerDe = (ids) => (Array.isArray(ids) ? ids : [ids]).some((id) => esOwner(id));

// Who has an owner's powers: by their number, or by the LID WhatsApp says has it now, and no other. With any row that
// had the owner's number, a row that kept it from before (whoever had it, or the owner's old one) had the powers until
// the owner wrote with the number again: .backup sent it the whole database, and .addowner made it stay. Until WhatsApp
// answers, the owner is recognized by the number the message brings.
export const OWNERS = {
  CONFIRMAR_CADA_MS: 6 * 60 * 60 * 1000, // how often WhatsApp is asked again while the bot runs
};
// Owner number -> the LID WhatsApp said has it.
export const ownersConfirmados = new Map();

// Whether any of these ids has an owner's powers: an owner's number, or the LID WhatsApp said has it. A message may
// bring both (handle-message).
export function esOwnerConfirmado(ids) {
  const numeros = numerosDeOwners();
  const lids = numeros.map((n) => ownersConfirmados.get(n)).filter(Boolean);
  return (Array.isArray(ids) ? ids : [ids]).some((id) => typeof id === "string" && (numeros.includes(id) || lids.includes(id)));
}

// Asks WhatsApp which LID has each owner's number now, all at once (lidSegunWhatsApp), and keeps each answer: one that
// doesn't come, or comes without a LID, leaves the last one there was. When the bot connects and every
// CONFIRMAR_CADA_MS after (confirmarOwnersCadaTanto), and for whoever .addowner adds.
export async function confirmarOwners(client = globalThis.client) {
  await Promise.all(
    numerosDeOwners().map(async (numero) => {
      const lid = await lidSegunWhatsApp(client, numero);
      if (lid) ownersConfirmados.set(numero, lid);
    }),
  );
}

let cadaTanto = null;
// main.js, when the connection opens: the owners now, and again every CONFIRMAR_CADA_MS while the bot runs, on the
// connection there is then. The timer doesn't keep the process going. Returns the first question, answered.
export function confirmarOwnersCadaTanto() {
  const ahora = confirmarOwners().catch(() => {});
  if (!cadaTanto) {
    cadaTanto = setInterval(() => confirmarOwners().catch(() => {}), OWNERS.CONFIRMAR_CADA_MS);
    cadaTanto.unref?.();
  }
  return ahora;
}

// A group participant's two identities as the group gives them, without asking the database: the LID (its id in a group
// that lists people by LID, its lid in one that lists them by number) and the number (the other way around), each null
// when the group doesn't bring it.
export function identidadDelGrupo(participante) {
  const ids = idsDelGrupo(participante);
  return { lid: ids.find((id) => id.endsWith("@lid")) || null, jid: ids.find((id) => id.endsWith("@s.whatsapp.net")) || null };
}

// The ids a participant of a group event (someone joining or leaving) may be known by: whatever the event brings (id,
// lid, phoneNumber) and, when it brings only a number, the LID the database knows for it. With the LID in hand, the
// database's may be whoever had the number before: when the one who has it now left, the other one lost their roles
// and their sales. For the cleanups on leaving (lib/roles.js, lib/compraventa.js) and for when someone came in
// (lib/contexto-chat.js).
export function idsDeParticipante(participante) {
  const ids = new Set(idsDelGrupo(participante));
  if ([...ids].some((id) => id.endsWith("@lid"))) return [...ids];
  for (const id of [...ids]) {
    const lid = lidDeNumero(id);
    if (lid) ids.add(lid);
  }
  return [...ids];
}

// Every id someone may come under, from these: the given ones and, for a number, the LID the database knows for it;
// with conSuNumero, for a LID also the number the database knows for it. A LID taken to a number may reach whoever has
// the number now, which is why mismaPersona doesn't: it's for where a match only protects someone or finds what's
// theirs, the owners and the bot's roles in .inactivos, or a warning kept under either id.
export function idsDe(ids, { conSuNumero = false } = {}) {
  const todos = new Set((Array.isArray(ids) ? ids : [ids]).filter((id) => typeof id === "string" && id));
  for (const id of [...todos]) {
    const otro = id.endsWith("@lid") ? (conSuNumero ? jidDeLid(id) : null) : lidDeNumero(id);
    if (otro) todos.add(otro);
  }
  return [...todos];
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
// came first with the number the person's row still had. By the number, never someone the group lists with another
// LID: the number is theirs now, and ".kick" replying to an old message of whoever had it removed them.
export function buscarEnGrupo(participants, { jid, lid } = {}) {
  if (!participants?.length) return null;
  return (lid && participants.find((p) => esParticipante(p, { lid }))) || participants.find((p) => esParticipante(p, { jid }) && !conOtraLid(p, lid)) || null;
}

// Whether the group lists this participant with a LID other than this one. A device's (…:12@lid) is the person's own,
// and what isn't a LID tells nothing.
function conOtraLid(p, lid) {
  const suya = p.id?.endsWith("@lid") ? p.id : p.lid;
  const sinDispositivo = (id) => id.replace(/:\d+@/, "@");
  return Boolean(lid?.endsWith("@lid") && suya?.endsWith("@lid")) && sinDispositivo(suya) !== sinDispositivo(lid);
}

// "Is this person in the group?" as a lid -> boolean, for the lists that only show a group's own people (.familias,
// .listaparejas): couples and families are stored by lid, and the group may list someone by number.
export const estaEnGrupo = (participants) => (lid) => Boolean(buscarEnGrupo(participants, { lid, jid: getUser(lid)?.jid }));

// ---------- whom a message names ----------

// "@<digits>" typed by hand, instead of picked from WhatsApp's mention list, may be a LID or a phone number: which one
// shows up depends on the group and on the client. A known LID wins (it has a row, or the group lists it), then whoever
// the group lists with that phone number, who has it now, then the LID the database knows for the number, which may be
// whoever had it before; with none of them it's taken as a LID, which is what real mentions carry nowadays. Building
// "<digits>@lid" blindly turned every typed phone number into a LID that matches nobody. participants are the group's,
// when at hand: with the database alone, ".mute @598…" landed on whoever had the number before.
export function lidDeDigitos(digitos, participants = null) {
  const comoLid = `${digitos}@lid`;
  if (getUser(comoLid) || (participants || []).some((p) => esParticipante(p, { lid: comoLid }))) return comoLid;
  const comoNumero = `${digitos}@s.whatsapp.net`;
  return lidEnElGrupo(participants, comoNumero) || lidDeNumero(comoNumero) || comoLid;
}

// The LID of whoever a group lists with this number (as its id in a group that lists people by number, as phoneNumber
// in one that lists them by LID), or null: who has the number now, as WhatsApp says.
export function lidEnElGrupo(participants, jid) {
  const p = jid ? (participants || []).find((v) => v?.id === jid || v?.phoneNumber === jid) : null;
  return (p?.id?.endsWith("@lid") ? p.id : p?.lid) || null;
}

// An id to a LID: a LID stays as it is, and a number goes to whoever the group lists with it, failing that to the LID
// the database knows for it (which may be whoever had it before), and with neither, to the number itself (oElMismo) or
// null.
export function lidDe(id, participants = null, { oElMismo = true } = {}) {
  if (typeof id !== "string") return null;
  if (id.endsWith("@lid")) return id;
  return lidEnElGrupo(participants, id) || lidDeNumero(id) || (oElMismo ? id : null);
}

// What a message says about whom it points at, read the same way by lidMencionado, destinatario and numeroSinLid: its
// first mention, the first "@<digits>" typed in the text, the author of the message it quotes, and a "+number" typed by
// hand. /@(\d+)/ and not "@[0-9\s]+" as the old plugins had: with spaces, a number following the mention (the stars in
// .calificar @persona 5) got glued onto the person's. Each reader keeps its own order among them.
function leerMencion(m, text) {
  const texto = String(text || "");
  return { mencion: m?.mentionedJid?.[0] || null, digitos: texto.match(/@(\d{3,})/)?.[1] || null, citado: m?.quoted?.sender || null, conMas: texto.match(/\+\d[\d\s-]*/)?.[0] || null };
}

// Who a command points at: the message's mention (which may arrive as @lid or by number, and is resolved to a LID), the
// "@number" written in the text, or the author of the quoted message. Returns the LID or null. A number, mentioned or
// typed, is whoever the group lists with it: the LID the database knows for it may be whoever had it before, a number
// that moved on to someone who hasn't written where the bot is, and ".moderador @persona" gave them the role.
// participants are the group's, when at hand.
export function lidMencionado(m, text, participants) {
  const { mencion, digitos, citado } = leerMencion(m, text);
  if (mencion) return lidDe(mencion, participants);
  if (digitos) return lidDeDigitos(digitos, participants);
  return citado;
}

// Everyone a command points at, for the ones that take more than one. What the message carries as mentions comes
// first; failing that, the typed "@number"s; failing that, the author of the quoted message. A number is whoever the
// group lists with it, as in lidMencionado.
export function lidsMencionados(m, text, participants = null) {
  const mencionados = (m?.mentionedJid || []).map((j) => lidDe(j, participants));
  if (mencionados.length) return [...new Set(mencionados)];
  const tipeados = [...String(text || "").matchAll(/@(\d{3,})/g)].map(([, digitos]) => lidDeDigitos(digitos, participants));
  if (tipeados.length) return [...new Set(tipeados)];
  return m?.quoted?.sender ? [m.quoted.sender] : [];
}

// ---------- both identities ----------

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

// The id the group lists whoever wrote a message under, which is the one WhatsApp takes for removing, promoting or
// demoting them: their LID alone (m.sender), in a group that lists people by number, came back with an error status
// nobody read, and nothing happened.
export const idDelAutor = (m, participants) => buscarEnGrupo(participants, { lid: m.sender, jid: m.senderJid })?.id || m.sender;

// The LID WhatsApp has now for a number, asking its server, or null. The one the database knows may be whoever had the
// number before (recycled, or left by its owner for another), and so may the one Baileys keeps: its lidMapping answers
// from its own store when it has the number there, and asks the server only when it doesn't (Signal/lid-mapping.js).
// This is the question it asks then, USync's LID query (pnFromLIDUSync, Socket/socket.js), made always. At most
// CONSULTA_MS: a command doesn't hang on WhatsApp. Baileys is loaded only to ask.
export async function lidSegunWhatsApp(client, numero) {
  if (typeof client?.executeUSyncQuery !== "function" || !String(numero || "").endsWith("@s.whatsapp.net")) return null;
  const { USyncQuery, USyncUser } = await import("@whiskeysockets/baileys");
  const consulta = new USyncQuery().withLIDProtocol().withContext("background").withUser(new USyncUser().withId(numero));
  // The cap keeps the process going while it lasts, and it's called off once there's an answer, so it doesn't hold the
  // process up after one either: called off, it rejects into the race, which is over by then and takes no notice. Not
  // keeping it going (ref: false), it left the wait to whatever else did: with nothing else, as in a test where
  // WhatsApp never answers, the process ran out in the middle of it, and on Node 22 the test runner gave up on that
  // test and on every one after it in the file.
  const reloj = new AbortController();
  const tope = _dep.esperar(IDENTIDAD.CONSULTA_MS, null, { signal: reloj.signal });
  const respuesta = await Promise.race([Promise.resolve().then(() => client.executeUSyncQuery(consulta)).catch(() => null), tope]);
  reloj.abort();
  const lid = respuesta?.list?.find((r) => r?.lid)?.lid; // asked about one number, whatever comes is about it
  return typeof lid === "string" && lid.endsWith("@lid") ? lid.replace(/:\d+@/, "@") : null;
}

// These ids and, for the ones whose other identity the database doesn't know, the one in WhatsApp's own map (Baileys'
// lidMapping, from node_modules): an owner, or a mod given the role by number, who never wrote anywhere the bot is had
// no row, and in a group listed by LID they were tagged. All of them in one question each way (getPNsForLIDs,
// getLIDsForPNs), which may ask WhatsApp, and at most `tope` for both: it used to ask one person at a time, each with a
// wait of its own, and with WhatsApp slow every .inactivos waited that long times the people it didn't know.
export async function conElMapaDeWhatsApp(client, ids, tope = IDENTIDAD.CONSULTA_MS) {
  const todos = new Set(ids);
  const mapa = client?.signalRepository?.lidMapping;
  if (typeof mapa?.getLIDsForPNs !== "function" || typeof mapa?.getPNsForLIDs !== "function") return todos;
  const sinLaOtra = [...todos].filter((id) => !(id.endsWith("@lid") ? jidDeLid(id) : lidDeNumero(id)?.endsWith("@lid")));
  if (!sinLaOtra.length) return todos;
  // The cap keeps the process going while it lasts and is called off once both answers are in, as lidSegunWhatsApp's.
  const reloj = new AbortController();
  const espera = _dep.esperar(tope, null, { signal: reloj.signal });
  const preguntar = (cuales, consulta) => (cuales.length ? Promise.race([Promise.resolve().then(() => consulta.call(mapa, cuales)).catch(() => null), espera]) : null);
  const respuestas = await Promise.all([preguntar(sinLaOtra.filter((id) => id.endsWith("@lid")), mapa.getPNsForLIDs), preguntar(sinLaOtra.filter((id) => !id.endsWith("@lid")), mapa.getLIDsForPNs)]);
  reloj.abort();
  // Pairs of { lid, pn }, which may bring the device: "59899…:0@s.whatsapp.net".
  for (const par of respuestas.flatMap((r) => (Array.isArray(r) ? r : []))) for (const id of [par?.lid, par?.pn]) if (typeof id === "string") todos.add(id.replace(/:\d+@/, "@"));
  return todos;
}

// Who a command points at, resolved to an id that exists in the database: it joins parsing the mention with the
// identity cross-reference, which is what has to happen before writing anything under that person's name. "quien" is
// the id to write with (null when there is no row), and "participante" is how the group lists them, which is what
// removal takes. segunWhatsApp, { lid, numero }, is who WhatsApp said has the number the command named them by
// (destinatarioActual).
export function destinatario(m, text, participants, segunWhatsApp = null) {
  // A hand-typed "+598 99 111 222" comes last: a real mention or a quoted message always wins over it.
  const { mencion, digitos, conMas } = leerMencion(m, text);
  const mencionado = lidMencionado(m, text, participants) || (conMas ? `${conMas.replace(/[^\d]/g, "")}@s.whatsapp.net` : null);
  if (!mencionado) return { mencionado: null, quien: null, objetivo: null, lid: null, jid: null, participante: null };

  // That's who it is, and their row only if they have one: by the number, the database may still read whoever had it.
  if (segunWhatsApp) {
    const { lid, jid, participante } = identidadesDe([segunWhatsApp.lid, segunWhatsApp.numero], participants);
    const quien = getUser(lid) ? lid : null;
    return { mencionado: segunWhatsApp.numero, quien, objetivo: quien || participante?.id || lid, lid, jid, participante };
  }

  // Typed "@<digits>" nothing is known of (no row, and the group neither lists them as a LID nor pairs them as a number
  // with one) may still be the number of someone who never wrote, in a group that lists them by number alone: that form
  // is tried against the group's participants. Only then: for a mention or a quoted message, whose LID is real, it made
  // up a number out of the LID's digits, which .id showed, .bloquear tried to block and .addowner wrote down.
  const sinSaber = !mencion && digitos && !getUser(mencionado) && !buscarEnGrupo(participants, { lid: mencionado });
  const ids = sinSaber ? [mencionado, `${digitos}@s.whatsapp.net`] : [mencionado];
  const { lid, jid, participante } = identidadesDe(ids, participants);
  const quien = [lid, jid, mencionado].find((id) => id && getUser(id)) || null;

  // "quien" is for writing to the database (it definitely has a row) and "objetivo" for what does not need one, like
  // fetching the profile picture of someone who never wrote.
  return { mencionado, quien, objetivo: quien || participante?.id || lid || jid || mencionado, lid, jid, participante };
}

// Whose data a command that only shows it is about (.bal, .mitimba, .inventario, .racha): the LID of whoever it names,
// as destinatario reads them, and failing that whoever wrote it. Named, it's them even without a row, someone who never
// wrote: going back to the asker then, ".mitimba @persona" showed the asker's own. It's the LID the group pairs a
// number with, who has it now: destinatario's "quien" may be whoever had it before. Pointing at the bot, usually by
// replying to a casino result, is asking for one's own: the bot never plays. null when it names nobody the bot can
// tell, a number no one has on record or a name typed by hand after an "@" instead of picked from WhatsApp's list: the
// asker's own, there, was an answer to something else.
export function deQuienEs(client, m, text, participants) {
  const { mencionado, lid } = destinatario(m, text, participants);
  if (!mencionado) return String(text || "").includes("@") ? null : m.sender;
  return esElBot([mencionado, lid], client) ? m.sender : lid;
}

// What those commands answer when deQuienEs can't tell whose: how to name the person so it can.
export const noSeDeQuien = (que, comando) => `No sé de quién querés ver ${que}: elegí a la persona de la lista que aparece al escribir @, o respondé un mensaje suyo con ${comando}.`;

// The number a command names someone by, when that's all it brings of them and the group doesn't pair it with a LID:
// typed (".kick +598…", or "@598…" typed by hand, which isn't a LID the bot knows) or a mention by number. null for a
// LID mention, a quoted message, or digits of a LID the bot knows or the group lists: those digits are a LID, and
// asking WhatsApp about them as a number only made the command wait. The same order as lidMencionado and destinatario.
function numeroSinLid(m, text, participants) {
  const { mencion, digitos, citado, conMas } = leerMencion(m, text);
  let numero = null;
  if (mencion) numero = mencion.endsWith("@s.whatsapp.net") ? mencion : null;
  else if (digitos) numero = digitos.length >= 7 && !getUser(`${digitos}@lid`) && !buscarEnGrupo(participants, { lid: `${digitos}@lid` }) ? `${digitos}@s.whatsapp.net` : null;
  else if (!citado && conMas) numero = `${conMas.replace(/[^\d]/g, "")}@s.whatsapp.net`;
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
