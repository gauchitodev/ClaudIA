// Who's writing to Claudia, for her chat's prompt (plugins/_auto-ia.js). Of whoever talked to her she knew what she had
// learned chatting (lib/memoria-persona.js) and how they asked to be addressed (lib/genero.js), and nothing of what
// anyone in the group knows of them: that they're one of the people who made her, how long they've been around, that
// tomorrow is their birthday. All of it was in the database already.
//
// It's background, and it says so: told a person's job with every message, she dragged it in where it had nothing to
// do (plugins/_auto-ia.js gives her that one only when work or money is the subject).
import { getCumple } from "../database-functions.js";
import { rangoPara, nombreDeRango, mensajesEn } from "./rangos.js";
import { generoDe } from "./genero.js";
import { diasHasta, edad, saludadoHoy } from "./cumpleanos.js";
import { DIA_MS } from "./tiempo.js";

export const QUIEN_ESCRIBE = {
  CUMPLE_CERCA_DIAS: 7, // a birthday this close is worth knowing of
};

// The same words the manual uses for who asks (lib/manual-claudia.js): the owner is whoever config.toml lists, and an
// admin is WhatsApp's or the bot's own (.adminbot).
function rol({ isOwner, isAdmin, isMod }) {
  if (isOwner) return "es owner del bot: de la gente que te programa y te mantiene, y le tenés confianza";
  if (isAdmin) return "es admin del grupo";
  if (isMod) return "tiene el rol de moderador del bot en este grupo";
  return "";
}

const tantos = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Since the bot first saw them in the group, which is what the ranks go by (lib/rangos.js): how long they've been
// writing there, and the rank that gave them, in their gender. "" for whoever has no row of this group.
function antiguedad(chat, usuario, user, ahora) {
  const desde = user?.inGroup?.[chat]?.desde;
  if (!(desde > 0)) return "";
  const dias = Math.max(0, Math.floor((ahora - desde) / DIA_MS));
  const rango = nombreDeRango(rangoPara(dias, mensajesEn(chat, user)), generoDe(usuario));
  let tiempo;
  if (dias < 1) tiempo = "empezó a escribir en este grupo hoy";
  else if (dias < 60) tiempo = `hace ${tantos(dias, "día", "días")} que escribe en este grupo`;
  else if (dias < 365) tiempo = `hace ${Math.floor(dias / 30)} meses que escribe en este grupo`;
  else {
    const anios = Math.floor(dias / 365);
    const meses = Math.floor((dias % 365) / 30);
    tiempo = `hace ${tantos(anios, "año", "años")}${meses ? ` y ${tantos(meses, "mes", "meses")}` : ""} que escribe en este grupo`;
  }
  return `${tiempo} (su rango acá: ${rango})`;
}

// Their birthday, when it's close: today (and whether the bot's greeting already went out in the group, so she doesn't
// give it twice), tomorrow, within the week, or yesterday. It's noted per group (.cumple), under whichever of their ids
// they wrote with then.
function cumple(chat, ids, ahora) {
  const usuario = ids.find((id) => id && getCumple(chat, id));
  if (!usuario) return "";
  const c = getCumple(chat, usuario);
  const hoy = new Date(ahora);
  const faltan = diasHasta(c.dia, c.mes, hoy);
  if (faltan === 0) {
    const cuantos = c.anio ? ` (cumple ${edad(c, hoy)})` : "";
    return saludadoHoy(chat, usuario, hoy) ? `hoy es su cumpleaños${cuantos}, y el saludo ya se lo mandaste al grupo esta mañana` : `hoy es su cumpleaños${cuantos}, y todavía no le dijiste nada`;
  }
  if (faltan === 1) return "mañana es su cumpleaños";
  if (faltan <= QUIEN_ESCRIBE.CUMPLE_CERCA_DIAS) return `su cumpleaños es en ${faltan} días`;
  if (diasHasta(c.dia, c.mes, new Date(ahora - DIA_MS)) === 0) return "ayer fue su cumpleaños";
  return "";
}

// The line for the prompt, or "" when there's nothing to tell. In private only who they are to the bot: the rest is a
// group's. usuario and numero: their two ids, as the message brings them.
export function quienEscribe({ chat, usuario, numero = null, user = null, nombre = "esta persona", esGrupo = true, isOwner = false, isAdmin = false, isMod = false, ahora = Date.now() }) {
  const datos = [rol({ isOwner, isAdmin, isMod })];
  if (esGrupo) datos.push(antiguedad(chat, usuario, user, ahora), cumple(chat, [usuario, numero], ahora));
  const sabidos = datos.filter(Boolean);
  if (!sabidos.length) return "";
  return `Sobre ${nombre}, para que sepas con quién hablás (es de fondo: no lo saques si no viene al caso): ${sabidos.join("; ")}.`;
}
