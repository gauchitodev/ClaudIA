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
    // El id con el que el grupo lista a la persona manda sobre un LID armado con dígitos tipeados, que puede ser un
    // teléfono disfrazado de LID y no existir.
    if (participante.id?.endsWith("@lid") && (!lid || !getUser(lid))) lid = participante.id;
    if (!jid && participante.phoneNumber) jid = participante.phoneNumber;
  }
  return { jid, lid, participante };
}

// Sacar, poner o quitar admin mirando lo que contesta WhatsApp: groupParticipantsUpdate no falla cuando el grupo
// rechaza el cambio, devuelve el status adentro del resultado ("200" es ok; 403 sin permiso, 404 no está en el grupo).
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

// A quién apunta un comando, resuelto a un id que exista en la base: junta el parseo de la mención con el cruce de
// identidades, que es lo que hay que hacer antes de escribir algo a nombre de esa persona. "quien" es el id con el
// que escribir (null si no hay fila), y "participante" cómo lo lista el grupo, que es con lo que se lo expulsa.
export function destinatario(m, text, participants) {
  // El "+598 99 111 222" escrito a mano va último: una mención de verdad o un citado siempre mandan sobre él.
  const conMas = String(text || "").match(/\+\d[\d\s-]*/);
  const mencionado = lidMencionado(m, text) || (conMas ? `${conMas[0].replace(/[^\d]/g, "")}@s.whatsapp.net` : null);
  if (!mencionado) return { mencionado: null, quien: null, objetivo: null, lid: null, jid: null, participante: null };

  // lidMencionado arma "<dígitos>@lid" con lo que se haya tipeado: si esos dígitos son un teléfono, esa fila no
  // existe y hay que probar también la forma de número.
  const digitos = String(mencionado).split("@")[0];
  const ids = getUser(mencionado) ? [mencionado] : [mencionado, `${digitos}@s.whatsapp.net`];
  const { lid, jid, participante } = identidadesDe(ids, participants);
  const quien = [lid, jid, mencionado].find((id) => id && getUser(id)) || null;

  // "quien" sirve para escribir en la base (tiene fila seguro) y "objetivo" para lo que no la necesita, como pedir
  // una foto de perfil de alguien que nunca escribió.
  return { mencionado, quien, objetivo: quien || participante?.id || lid || jid || mencionado, lid, jid, participante };
}
