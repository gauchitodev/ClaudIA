// Lista negra de personas por grupo: quién está anotado, y sacarlo del grupo cuando aparece.
// El cruce de identidades (LID vs número) y la expulsión en sí viven en lib/identidad.js, porque los necesita
// cualquier cosa que guarde gente por número, no solo esto.
import { isBlacklisted, recordarLidEnListaNegra } from "../database-functions.js";
import { identidadesDe, expulsar } from "./identidad.js";

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
