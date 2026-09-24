// Claudia's initiative: in the groups that switch it on (.iniciativa on), a few times a day she glances at the chat
// the way anyone picks up their phone, reads what she missed and sometimes reacts, answers something said a while ago
// or comments. Most of the time she just reads. This file holds the knobs, the regexes, the feedback (did anyone answer
// her?) and the .iniciativa status; the rules that decide whether she may speak are
// in lib/tacto.js, and the glance itself in lib/vistazos.js.
import { getChat, estadoIniciativa, intervencionesDesde, ecoDeIntervenciones, marcarIntervencionRespondida, marcarUltimaPropiaRespondida, sumarReaccionAIntervencion } from "../database-functions.js";
import { claveDia } from "./actividad.js";
import { DIA_MS, duracion, textoFecha } from "./tiempo.js";

const MIN = 60 * 1000;
const HORA = 60 * MIN;

// Mutable, like ACTIVIDAD, so the tests can move them.
export const INICIATIVA = {
  DESDE_HORA: 9, // she's awake from 09:00 to 22:59 (the tablet's local time)
  HASTA_HORA: 23,
  VISTAZOS_DIA: 8, // glances a day the random schedule aims for (the gap after each one makes it a bit fewer)
  VISTAZOS_MAX_DIA: 12, // hard cap, glances brought forward by a burst included
  SEPARACION_MIN_MS: 40 * MIN, // after a glance, the next one never comes sooner than this
  PERFIL_DIAS: 14, // days of hourly activity that decide at what hours she tends to glance
  VENCIDO_MS: 20 * MIN, // a glance this overdue (the bot was down) isn't done late: a new time is drawn
  PRIMERA_LECTURA_MS: 30 * MIN, // switched on, the first glance reads at most this far back
  LECTURA_MAX_MS: 12 * HORA, // and no glance ever reads further back than this
  MAX_LEIDOS: 80, // people's messages read per glance (the newest ones)
  CONTEXTO_PREVIO: 5, // already-read lines she gets to know what they were talking about
  TOPE_LLAMADAS_DIA: 60, // AI calls a day for glances, all groups together: a 429 here also idles the model for the chat
  TOPE_TEXTOS_DIA: 3, // messages a day of her own, per group
  TOPE_REACCIONES_DIA: 8,
  REACCIONES_POR_VISTAZO: 2,
  REACCION_MAX_EDAD_MS: 3 * HORA, // reacting to something older looks like a bot digging through the chat
  RESPUESTA_MAX_EDAD_MS: 6 * HORA,
  MIN_NUEVOS_PARA_HABLAR: 4, // with less new conversation than this she can react, not write
  VIVO_MS: 30 * MIN, // the last message from someone must be this recent for her to write: no talking to an empty room
  PAUSA_TRAS_HABLAR_MS: 10 * MIN, // after she says anything (named or on her own), she doesn't start anything for this long
  MANO_A_MANO_MENSAJES: 8, // this many messages in a row between the same two people, inside the window, is their chat
  MANO_A_MANO_VENTANA_MS: 15 * MIN,
  JUEGO_RECIENTE_MS: 5 * MIN, // a game message this recent means a game is on
  PAUSA_TEMA_SERIO_MS: 2 * HORA, // a death, a hospital: she stays out for a while
  RESPUESTA_POR_NOMBRE_MS: 15 * MIN, // naming her this soon after one of her messages counts as answering it
  RAFAGA_MENSAJES: 8, // this many messages in RAFAGA_VENTANA_MS is the phone buzzing: the next glance comes forward
  RAFAGA_VENTANA_MS: 2 * MIN,
  RAFAGA_DEMORA_MIN_MS: MIN, // and it comes one to three minutes later, not at once
  RAFAGA_DEMORA_MAX_MS: 3 * MIN,
  RAFAGA_ENFRIAMIENTO_MS: 30 * MIN,
  MAX_LARGO_TEXTO: 300,
  PODA_DIAS: 90, // intervenciones older than this are dropped
};

// The only reactions she uses on her own. None of the bot's system reactions (❌ ⏳ ☑️ ✅ 🤳 🕒 🕐 🔥 🔒 📷 🍿 ❗ ✖️ ✔️ ⚠️ 🪙 🙅)
// are here, so a reaction of hers never reads as the bot's machinery.
export const EMOJIS_INICIATIVA = ["😂", "🤣", "😅", "❤️", "😍", "🥲", "😢", "😮", "👀", "🤔", "👍", "👏", "🙌", "💯", "🙏"];

// Lowercase and without accents. Every regex below runs on this: in JS, \b only knows ASCII letters, so /muri[oó]\b/
// never matches "murió".
export const normalizar = (texto) =>
  String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// The words that make Claudia consider herself addressed (plugins/_auto-ia.js uses them too).
export const PALABRAS_CLAVE = ["bot", "claudia", "tabbot"];
export const NOMBRA_A_CLAUDIA = new RegExp(`\\b(${PALABRAS_CLAVE.join("|")})\\b`);
export const TEMA_SERIO =
  /\b(velorio|funeral|sepelio|entierro|fallecio|fallecid[oa]s?|fallecimiento|murio|se nos fue|q\.? ?e\.? ?p\.? ?d|descanse en paz|en paz descanse|condolencias|pesame|luto|hospital|sanatorio|cti|internad[oa]s?|internaron|diagnostic\w*|cancer|tumor|quimio\w*|accidente|suicid\w*)\b/;

// ---------- feedback ----------

// Called by the hook (plugins/_iniciativa.js) on the messages of a group with initiative on. Only messages that name
// her or quote her matter: quoting one of her spontaneous texts, or naming her soon after one, counts as an answer to it.
// Returns "respondida" or null.
export function registrarMensajeDelGrupo(m, ahora = Date.now()) {
  if (!m?.text) return null;
  const texto = normalizar(m.text);
  const laCita = Boolean(m.quoted?.fromMe);
  const laNombra = NOMBRA_A_CLAUDIA.test(texto);
  if (!laCita && !laNombra) return null;
  if (laCita && marcarIntervencionRespondida(m.chat, m.quoted.id)) return "respondida";
  if (laNombra && marcarUltimaPropiaRespondida(m.chat, ahora - INICIATIVA.RESPUESTA_POR_NOMBRE_MS)) return "respondida";
  return null;
}

// A reaction to one of her messages (main.js, messages.reaction). It never throws: it runs inside the ranking loop.
export function registrarReaccionAClaudia(chat, mensajeId) {
  try {
    return sumarReaccionAIntervencion(chat, mensajeId);
  } catch (e) {
    console.error("[iniciativa] no se pudo contar una reacción:", e?.message || e);
    return false;
  }
}

// ---------- .iniciativa ----------

export const inicioDelDia = (ahora) => new Date(ahora).setHours(0, 0, 0, 0);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export function textoIniciativa(chat, ahora = Date.now()) {
  const fila = getChat(chat);
  if (fila?.iniciativa !== 1) {
    return "🙋 *Iniciativa de Claudia*: apagada.\n\nPrendida, a veces miro el grupo por mi cuenta (unas pocas veces por día, nunca de noche) y, si viene al caso, reacciono o comento algo. La prende un admin con .iniciativa on";
  }
  const e = estadoIniciativa(chat);
  const hoy = intervencionesDesde(chat, inicioDelDia(ahora));
  const textos = hoy.filter((i) => i.tipo === "respuesta" || i.tipo === "comentario").length;
  const reacciones = hoy.filter((i) => i.tipo === "reaccion").length;
  const vistazos = e.dia === claveDia(new Date(ahora)) ? e.vistazos : 0;

  const lineas = [];
  if (fila.charla === 0) lineas.push("⚠️ La charla está apagada (.charla): mientras tanto no miro el grupo.");
  lineas.push(`Hoy: ${plural(vistazos, "vistazo", "vistazos")}, ${plural(textos, "mensaje", "mensajes")} y ${plural(reacciones, "reacción", "reacciones")} por mi cuenta.`);
  if (e.silencioHasta > ahora) lineas.push(`🤐 Callada hasta ${textoFecha(e.silencioHasta, ahora)} (${e.silencioMotivo || "pausa"}).`);
  else if (e.proximoVistazo > ahora) lineas.push(`👀 Próximo vistazo: ${textoFecha(e.proximoVistazo, ahora)}.`);
  const ultimo = globalThis.decisionesVistazo?.get(chat);
  if (ultimo) lineas.push(`Último vistazo, hace ${duracion(Math.max(0, ahora - ultimo.fecha))}: ${ultimo.resumen}`);
  const eco = ecoDeIntervenciones(chat, ahora - 7 * DIA_MS);
  if (eco.total > 0) lineas.push(`Últimos 7 días: ${plural(eco.total, "mensaje", "mensajes")} por mi cuenta, ${eco.conEco} con respuesta o reacción.`);
  lineas.push(`Topes por día: ${INICIATIVA.TOPE_TEXTOS_DIA} mensajes y ${INICIATIVA.TOPE_REACCIONES_DIA} reacciones. .iniciativa off la apaga.`);
  return `🙋 *Iniciativa de Claudia*: prendida.\n\n${lineas.join("\n")}`;
}
