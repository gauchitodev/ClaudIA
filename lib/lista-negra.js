// Lista negra: reconocer a la persona dentro de un grupo y expulsarla de verdad.
//
// El lío que resuelve este archivo: en los grupos nuevos WhatsApp identifica a cada participante por su LID (...@lid)
// y el número (...@s.whatsapp.net) puede no venir nunca — Baileys solo completa participant.phoneNumber si el
// servidor manda phone_number. La lista negra se anota por número, así que hay que cruzar las dos identidades, y
// expulsar con el mismo id con el que el grupo lista a esa persona: mandarle el número a un grupo que trabaja por LID
// no tira excepción, devuelve un status de error que hay que mirar a mano.
import { getUser, isBlacklisted, recordarLidEnListaNegra } from "../database-functions.js";

// Buscar a alguien entre los participantes de un grupo por cualquiera de sus dos identidades.
export function buscarEnGrupo(participants, { jid, lid } = {}) {
  if (!participants?.length) return null;
  return participants.find((p) => (lid && p.id === lid) || (jid && (p.id === jid || p.phoneNumber === jid))) || null;
}

// Las dos identidades de alguien, a partir de uno o varios ids conocidos. Se completan con la base (users, que solo
// tiene a quien escribió alguna vez) y con los participantes del grupo, que a veces traen el número de quien nunca habló.
export function identidadesDe(id, participants) {
  const ids = (Array.isArray(id) ? id : [id]).filter(Boolean);
  if (ids.length === 0) return { jid: null, lid: null, participante: null };

  let lid = ids.find((v) => v.endsWith("@lid")) || null;
  let jid = ids.find((v) => v.endsWith("@s.whatsapp.net")) || null;
  if (!lid && jid) lid = getUser(jid)?.lid || null;
  if (!jid && lid) jid = getUser(lid)?.jid || null;

  const participante = buscarEnGrupo(participants, { jid, lid });
  if (participante) {
    if (!lid && participante.id?.endsWith("@lid")) lid = participante.id;
    if (!jid && participante.phoneNumber) jid = participante.phoneNumber;
  }
  return { jid, lid, participante };
}

// Expulsar mirando lo que contesta WhatsApp: groupParticipantsUpdate no falla cuando el grupo rechaza la expulsión,
// devuelve el status adentro del resultado ("200" es ok; 403 sin permiso, 404 no está en el grupo).
export async function expulsar(client, chat, id) {
  if (!id) return { ok: false, status: "sin-id" };
  try {
    const resultado = await client.groupParticipantsUpdate(chat, [id], "remove");
    const status = String(resultado?.[0]?.status ?? "200");
    return { ok: status === "200", status };
  } catch (e) {
    return { ok: false, status: e?.message || "error" };
  }
}

// ¿Está en la lista negra de este grupo? Devuelve la entrada más las identidades resueltas, y de paso guarda el LID
// si lo descubrió recién, para que la próxima vez se lo reconozca de una.
export function estaEnListaNegra(id, chat, participants) {
  const ids = (Array.isArray(id) ? id : [id]).filter(Boolean);
  const { jid, lid, participante } = identidadesDe(ids, participants);
  const entrada = isBlacklisted([...ids, jid, lid], chat);
  if (!entrada) return null;
  if (lid) recordarLidEnListaNegra(entrada.chat, entrada.jid, lid);
  return { entrada, jid, lid, participante };
}

// Sacar del grupo a quien esté en la lista negra. "ids" son los del evento de participantes (o los que haga falta
// revisar); "participants" es la metadata fresca del grupo. Devuelve lo que se expulsó y lo que falló.
export async function expulsarDeListaNegra(client, chat, ids, participants) {
  const expulsados = [];
  const fallados = [];
  for (const id of ids || []) {
    const encontrado = estaEnListaNegra(id, chat, participants);
    if (!encontrado) continue;
    // El id con el que el grupo lista a la persona es el único que WhatsApp acepta para expulsarla.
    const objetivo = encontrado.participante?.id || encontrado.lid || encontrado.jid || id;
    const { ok, status } = await expulsar(client, chat, objetivo);
    if (ok) expulsados.push({ id: objetivo, original: id, entrada: encontrado.entrada });
    else fallados.push({ id: objetivo, original: id, status });
  }
  if (fallados.length) console.error("[lista negra] no se pudo expulsar de", chat, fallados.map((f) => `${f.id} (${f.status})`).join(", "));
  return { expulsados, fallados };
}
