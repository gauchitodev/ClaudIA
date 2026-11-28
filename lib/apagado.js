// The bot out of a group: switched off there by its admins (.claudia off, plugins/claudia.js) or the group banned by an
// owner (.banchat). Every part of the bot asks here before reading, doing or saying anything in a group: the dispatcher
// (handle-message.js), the group's events (lib/participantes.js, lib/reacciones.js), the scheduled tasks
// (chatsConOpcion and the rest of lib/tareas-programadas.js) and the pending ones (lib/pendientes.js). What's sent to a
// group switched off is dropped too (lib/envios.js), but for the answers to the commands that work there. .banchat lets
// the owners through, as it always did; .claudia off, nobody. .banchat used to stop only the commands and some hooks:
// the moderation kept going, the greeting to a "hola" too, and most of the scheduled tasks never asked.
import { getChat, correrPlazosDelGrupo } from "../database-functions.js";
import { claveDia } from "./actividad.js";

// Whether a chat's row says the bot is out of it, switched off or banned: for the loops that already have the row.
export const estaFuera = (fila) => Boolean(fila && (Number(fila.apagadoDesde) > 0 || fila.isBanned));

// "apagado" (.claudia off), "baneado" (.banchat) or null, for a group by its id. Not for a private chat: neither goes
// there.
export function fueraDelGrupo(chat, fila = null) {
  if (!String(chat || "").endsWith("@g.us")) return null;
  const datos = fila || getChat(chat);
  if (Number(datos?.apagadoDesde) > 0) return "apagado";
  if (datos?.isBanned) return "baneado";
  return null;
}

// When the bot is back in a group (.claudia on, from "desde"): what was going on goes on from where it was, as if the
// time off hadn't passed (correrPlazosDelGrupo). The streaks by the bot's calendar days: one alive when it went off
// goes on from the day before it came back.
export function reanudarPlazos(chat, desde, ahora = Date.now()) {
  const dia = (ms, antes = 0) => {
    const d = new Date(ms);
    d.setDate(d.getDate() - antes);
    return claveDia(d);
  };
  const otroDia = dia(ahora) !== dia(desde);
  return correrPlazosDelGrupo(chat, desde, ahora, otroDia ? { antesDeApagar: dia(desde, 1), ayerDeVuelta: dia(ahora, 1) } : {});
}
