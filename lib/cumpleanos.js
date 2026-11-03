// Group birthdays: everyone notes theirs with .cumple 14/03/1995, the year included, and on the day, from 9 onwards,
// Claudia wishes them a happy birthday, says how many they turn and mentions them in the group they signed up in. No
// coins, no prizes. The check runs every 5 minutes from tareas-programadas.js and is recorded so nobody gets greeted
// twice on the same day. The ones noted before the year was asked for have none: they're greeted without the age.
import { setCumple, getCumple, borrarCumple, cumplesDeChat, cumplesDeHoy, periodoCerrado, marcarPeriodoCerrado, desmarcarPeriodoCerrado, getUser } from "../database-functions.js";
import { volverAIntentar } from "./avisos-programados.js";
import { preguntarIA } from "./ia.js";
import { DIA_MS } from "./tiempo.js";
import { elegirAlAzar } from "./azar.js";
import { memoriaDe } from "./memoria-persona.js";
import { sinMenciones } from "./menciones.js";

// A year that makes someone younger than EDAD_MINIMA or older than EDAD_MAXIMA is taken for a typo.
export const CUMPLE = { HORA_SALUDO: 9, EDAD_MINIMA: 5, EDAD_MAXIMA: 120 };
export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_POR_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const mencion = (lid) => `@${lid.split("@")[0]}`;
const textoAnios = (n) => `${n} ${n === 1 ? "año" : "años"}`;
// Where the AI is told to put the mention in its greeting, and how it may come back (case, accent).
const MARCA_MENCION = "@MENCION";
const MARCA = /@menci[oó]n\b/i;

// "95" is 1995 and "05" is 2005: two digits are the last year ending in them that isn't past this one.
function anioEntero(digitos, ahora) {
  const n = Number(digitos);
  return digitos.length === 4 ? n : ahora.getFullYear() - ((ahora.getFullYear() - n) % 100);
}

export function registrarCumple(chat, usuario, texto, ahora = new Date()) {
  const t = String(texto || "").trim();
  if (!t) {
    const c = getCumple(chat, usuario);
    if (!c) return { ok: false, error: "Anotá tu cumple con .cumple 14/03/1995 (día/mes/año)" };
    // Noted before .cumple asked for the year: still greeted, without the age, until they note it again with it.
    if (!c.anio) return { ok: true, mensaje: `🎂 Tu cumple está anotado el ${c.dia} de ${MESES[c.mes - 1]}, pero sin el año: volvé a anotarlo con el año (.cumple 14/03/1995) y ese día digo cuántos cumplís. Para borrarlo: .cumple borrar` };
    return { ok: true, mensaje: `🎂 Tu cumple está anotado el ${c.dia} de ${MESES[c.mes - 1]} de ${c.anio} (tenés ${edad(c, ahora)}). Para cambiarlo: .cumple 14/03/1995 · para borrarlo: .cumple borrar` };
  }
  if (/^(borrar|quitar|eliminar)$/i.test(t)) {
    return borrarCumple(chat, usuario) ? { ok: true, mensaje: "🗑️ Listo, borré tu cumple." } : { ok: false, error: "No tenías cumple anotado." };
  }
  const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{4}|\d{2}))?$/);
  if (!m) return { ok: false, error: "No entendí la fecha. Poné día/mes/año, por ejemplo .cumple 14/03/1995" };
  // The year is a must: the greeting says how many they turn. It used to be read and dropped.
  if (!m[3]) return { ok: false, error: "Poné también el año: .cumple 14/03/1995 (día/mes/año)." };
  const c = { dia: Number(m[1]), mes: Number(m[2]), anio: anioEntero(m[3], ahora) };
  if (c.mes < 1 || c.mes > 12 || c.dia < 1 || c.dia > DIAS_POR_MES[c.mes - 1] || (esCumpleDe29(c.dia, c.mes) && !bisiesto(c.anio))) return { ok: false, error: "Esa fecha no existe." };
  const anios = edad(c, ahora);
  if (anios < 0) return { ok: false, error: "Esa fecha todavía no llegó: fijate el año." };
  if (anios < CUMPLE.EDAD_MINIMA || anios > CUMPLE.EDAD_MAXIMA) return { ok: false, error: `Con ese año tendrías ${textoAnios(anios)}: fijate el año.` };
  setCumple(chat, usuario, c.dia, c.mes, c.anio);
  return { ok: true, mensaje: `🎂 Anotado: tu cumple es el ${c.dia} de ${MESES[c.mes - 1]} de ${c.anio}. Ese día te saludo en el grupo por tus ${aniosQueCumple(c, ahora)}.` };
}

const bisiesto = (anio) => (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
// The 29 February birthdays are celebrated on the 28th in the years without a 29th: they used to be greeted only in
// leap years, and .cumples said "¡es hoy!" on 1 March (that's where new Date rolls 29/02 over to).
const esCumpleDe29 = (dia, mes) => dia === 29 && mes === 2;
const fechaDelCumple = (anio, dia, mes) => (esCumpleDe29(dia, mes) && !bisiesto(anio) ? new Date(anio, 1, 28) : new Date(anio, mes - 1, dia));

// days until the next birthday with that day and month (0 = it's today)
export function diasHasta(dia, mes, ahora = new Date()) {
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  let fecha = fechaDelCumple(ahora.getFullYear(), dia, mes);
  if (fecha < hoy) fecha = fechaDelCumple(ahora.getFullYear() + 1, dia, mes);
  return Math.round((fecha - hoy) / DIA_MS);
}

// How old someone is with that birthday, or null without the year. The ones of 29/02 turn a year older on the 28th in
// the years without a 29th, the day they're greeted.
export function edad({ dia, mes, anio }, ahora = new Date()) {
  if (!anio) return null;
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  return ahora.getFullYear() - anio - (fechaDelCumple(ahora.getFullYear(), dia, mes) > hoy ? 1 : 0);
}

// How many they turn on their next birthday, or today's if it's today; null without the year.
const aniosQueCumple = (c, ahora = new Date()) => (c.anio ? edad(c, ahora) + (diasHasta(c.dia, c.mes, ahora) === 0 ? 0 : 1) : null);

export function textoCumples(chat, ahora = new Date()) {
  const lista = cumplesDeChat(chat);
  if (lista.length === 0) return { texto: "Nadie anotó su cumple todavía. Anotá el tuyo con .cumple 14/03/1995", mentions: [] };
  const ordenados = lista.map((c) => ({ ...c, faltan: diasHasta(c.dia, c.mes, ahora) })).sort((a, b) => a.faltan - b.faltan);
  // Without the year, the ones noted before .cumple asked for it: the line says so, and it tags them.
  const anios = (c) => (c.anio ? `cumple ${aniosQueCumple(c, ahora)}` : "le falta el año");
  const lineas = ordenados.map((c) => `${String(c.dia).padStart(2, "0")}/${String(c.mes).padStart(2, "0")} ${mencion(c.usuario)} — ${c.faltan === 0 ? "¡es hoy! 🎉" : c.faltan === 1 ? "mañana" : `en ${c.faltan} días`} (${anios(c)})`);
  return { texto: `🎂 *Cumpleaños del grupo*\n${lineas.join("\n")}`, mentions: ordenados.map((c) => c.usuario) };
}

// With what she learned of the person in that group only: the memory used to be one for the whole bot, and a secret
// told in private could end up in the greeting to the family group. anios is how many they turn, or null for the ones
// noted without the year.
async function saludoPara(usuario, chat, anios) {
  const user = getUser(usuario);
  const nombre = user?.apodo || user?.pushName || "";
  const memoria = memoriaDe(usuario, chat);
  const fijos = anios
    ? [
        `🎂 ¡Feliz cumple ${mencion(usuario)}! ¡${anios} años! Que la pases lindo hoy 🎉`,
        `🎉 Hoy ${mencion(usuario)} cumple ${anios} años, ¡felicidades! Que venga un año bueno 🎂`,
        `🥳 ¡Feliz cumpleaños ${mencion(usuario)}! ${anios} años, a festejar como corresponde 🎂`,
      ]
    : [
        `🎂 ¡Feliz cumple ${mencion(usuario)}! Que la pases lindo hoy 🎉`,
        `🎉 Hoy cumple ${mencion(usuario)}, ¡felicidades! Que venga un año bueno 🎂`,
        `🥳 ¡Feliz cumpleaños ${mencion(usuario)}! A festejar como corresponde 🎂`,
      ];
  let texto = elegirAlAzar(fijos);
  if (globalThis.geminiApiKey) {
    // The AI gets a mark where the mention goes, not the digits of the id, which are the person's LID or phone number;
    // the mention goes in afterwards. What it writes can't tag anyone else (sinMenciones).
    const r = await preguntarIA(
      `Hoy es el cumpleaños de ${nombre || "una persona del grupo"}${memoria ? ` (lo que sabés de esta persona por charlas anteriores en este grupo: ${memoria})` : ""}.${anios ? ` Cumple ${anios} años: decilo en el saludo.` : ""} Escribí un saludo de cumpleaños para el grupo, corto (2 o 3 frases), cálido y con tu onda, sin inventar datos. Empezá el mensaje con el texto exacto "${MARCA_MENCION}" para mencionarla. Solo el saludo, sin comillas ni explicaciones.`,
    ).catch(() => ({ ok: false }));
    if (r.ok && r.texto && r.texto.length < 500) {
      const saludo = sinMenciones(r.texto);
      texto = MARCA.test(saludo) ? saludo.replace(MARCA, mencion(usuario)).replace(new RegExp(MARCA.source, "gi"), "") : `${mencion(usuario)} ${saludo}`;
    }
  }
  return { texto, mentions: [usuario] };
}

// Runs every 5 minutes from tareas-programadas.js
export async function chequearCumpleanos(ahora = new Date()) {
  if (ahora.getHours() < CUMPLE.HORA_SALUDO) return;
  const hoy = `${ahora.getFullYear()}-${ahora.getMonth() + 1}-${ahora.getDate()}`;
  const [dia, mes] = [ahora.getDate(), ahora.getMonth() + 1];
  const tambienLos29 = dia === 28 && mes === 2 && !bisiesto(ahora.getFullYear());
  for (const c of [...cumplesDeHoy(dia, mes), ...(tambienLos29 ? cumplesDeHoy(29, 2) : [])]) {
    const tipo = `cumple:${c.usuario}`;
    if (periodoCerrado(c.chat, tipo, hoy)) continue;
    marcarPeriodoCerrado(c.chat, tipo, hoy);
    try {
      const saludo = await saludoPara(c.usuario, c.chat, aniosQueCumple(c, ahora));
      await globalThis.client.sendMessage(c.chat, { text: saludo.texto, mentions: saludo.mentions });
    } catch (e) {
      console.error("[cumpleaños] no se pudo saludar:", e.message);
      // Marked before sending so two passes can't both greet: a failed send is tried again on the next one.
      if (volverAIntentar(`${c.chat}|${tipo}|${hoy}`)) desmarcarPeriodoCerrado(c.chat, tipo, hoy);
    }
  }
}
