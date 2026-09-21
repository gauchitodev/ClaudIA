// Quién es quién dentro de un grupo, y cómo sacarlo de verdad.
//
// En los grupos nuevos WhatsApp identifica a cada participante por su LID (...@lid) y el número (...@s.whatsapp.net)
// puede no venir nunca: Baileys solo completa participant.phoneNumber si el servidor manda phone_number. Cualquier
// cosa que se guarde por número (la lista negra, las advertencias) necesita cruzar las dos identidades antes de
// escribir o de expulsar, y hay que expulsar con el mismo id con el que el grupo lista a esa persona: mandarle el
// número a un grupo que trabaja por LID no tira excepción, devuelve un status de error que hay que mirar a mano.
import { getUser } from "../database-functions.js";
import { lidMencionado } from "./menciones.js";

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

// A quién apunta un comando, resuelto a un id que exista en la base: junta el parseo de la mención con el cruce de
// identidades, que es lo que hay que hacer antes de escribir algo a nombre de esa persona. "quien" es el id con el
// que escribir (null si no hay fila), y "participante" cómo lo lista el grupo, que es con lo que se lo expulsa.
export function destinatario(m, text, participants) {
  const mencionado = lidMencionado(m, text);
  if (!mencionado) return { mencionado: null, quien: null, lid: null, jid: null, participante: null };

  // lidMencionado arma "<dígitos>@lid" con lo que se haya tipeado: si esos dígitos son un teléfono, esa fila no
  // existe y hay que probar también la forma de número.
  const digitos = String(mencionado).split("@")[0];
  const ids = getUser(mencionado) ? [mencionado] : [mencionado, `${digitos}@s.whatsapp.net`];
  const { lid, jid, participante } = identidadesDe(ids, participants);
  return { mencionado, quien: [lid, jid, mencionado].find((id) => id && getUser(id)) || null, lid, jid, participante };
}
