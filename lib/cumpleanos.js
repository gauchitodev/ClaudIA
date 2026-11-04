// Group birthdays: everyone notes theirs with .cumple 14/03/1995, the year included (an admin can note anyone's with
// .setcumple, and delete it with .delcumple), and on the day, from 9 onwards, Claudia wishes them a happy birthday,
// says how many they turn and mentions them in the group they signed up in, if they're still in it. No coins, no
// prizes. The check runs every 5 minutes from tareas-programadas.js and is recorded so nobody gets greeted twice on the
// same day. The ones noted before the year was asked for have none: they're greeted without the age.
import { setCumple, getCumple, borrarCumple, cumplesDeChat, cumplesDeHoy, periodoCerrado, marcarPeriodoCerrado, desmarcarPeriodoCerrado, getUser } from "../database-functions.js";
import { metadataDe } from "./cache-grupos.js";
import { estaEnGrupo } from "./identidad.js";
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
  const { fecha: c, error } = leerFecha(t, ahora, { ejemplo: ".cumple 14/03/1995", tendria: "tendrías" });
  if (error) return { ok: false, error };
  setCumple(chat, usuario, c.dia, c.mes, c.anio);
  return { ok: true, mensaje: `🎂 Anotado: tu cumple es el ${c.dia} de ${MESES[c.mes - 1]} de ${c.anio}. Ese día te saludo en el grupo por tus ${aniosQueCumple(c, ahora)}.` };
}

// .setcumple: an admin notes someone else's birthday, for whoever doesn't note theirs or noted it wrong, with .cumple's
// checks; "borrar" deletes it, as .delcumple does. usuario is who it's for, as .perfil reads them, and what's noted is
// theirs as if they had noted it: they see it with .cumple, and can change or delete it. The answer tags them, so they
// know.
export function anotarCumpleDe(chat, usuario, texto, ahora = new Date()) {
  const t = String(texto || "").trim();
  if (!t) return { ok: false, error: "Poné la fecha, con el año: .setcumple @persona 14/03/1995 (día/mes/año). Para borrarlo: .delcumple @persona" };
  if (/^(borrar|quitar|eliminar)$/i.test(t)) return borrarCumpleDe(chat, [usuario]);
  const { fecha: c, error } = leerFecha(t, ahora, { ejemplo: ".setcumple @persona 14/03/1995", tendria: "tendría" });
  if (error) return { ok: false, error };
  setCumple(chat, usuario, c.dia, c.mes, c.anio);
  return { ok: true, mensaje: `🎂 Anotado: el cumple de ${mencion(usuario)} es el ${c.dia} de ${MESES[c.mes - 1]} de ${c.anio}. Ese día le mando el saludo en el grupo por sus ${aniosQueCumple(c, ahora)}.`, mentions: [usuario] };
}

// An admin deletes someone's birthday in this group (.delcumple, and .setcumple's "borrar"), under whichever of their
// ids it was noted: ids are the person's as the command read them (their LID, their number, the one their row is
// under). The answer tags them and says which day it was, so the admin sees it was the one they meant.
export function borrarCumpleDe(chat, ids) {
  const anotados = [...new Set(ids.filter(Boolean))].map((usuario) => ({ usuario, c: getCumple(chat, usuario) })).filter(({ c }) => c);
  if (!anotados.length) return { ok: false, error: "Esa persona no tenía cumple anotado." };
  for (const { usuario } of anotados) borrarCumple(chat, usuario);
  const [{ usuario, c }] = anotados;
  return { ok: true, mensaje: `🗑️ Listo, borré el cumple de ${mencion(usuario)} (${c.dia} de ${MESES[c.mes - 1]}).`, mentions: [usuario] };
}

// The date in "14/03/1995", checked: { fecha: { dia, mes, anio } }, or { error } saying what's wrong with it. ejemplo
// is how to write it with the command at hand, and tendria who'd have the age of a year taken for a typo: "tendrías"
// for one's own birthday, "tendría" for someone else's.
function leerFecha(t, ahora, { ejemplo, tendria }) {
  const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{4}|\d{2}))?$/);
  if (!m) return { error: `No entendí la fecha. Poné día/mes/año, por ejemplo ${ejemplo}` };
  // The year is a must: the greeting says how many they turn. It used to be read and dropped.
  if (!m[3]) return { error: `Poné también el año: ${ejemplo} (día/mes/año).` };
  const c = { dia: Number(m[1]), mes: Number(m[2]), anio: anioEntero(m[3], ahora) };
  if (c.mes < 1 || c.mes > 12 || c.dia < 1 || c.dia > DIAS_POR_MES[c.mes - 1] || (esCumpleDe29(c.dia, c.mes) && !bisiesto(c.anio))) return { error: "Esa fecha no existe." };
  const anios = edad(c, ahora);
  if (anios < 0) return { error: "Esa fecha todavía no llegó: fijate el año." };
  if (anios < CUMPLE.EDAD_MINIMA || anios > CUMPLE.EDAD_MAXIMA) return { error: `Con ese año ${tendria} ${textoAnios(anios)}: fijate el año.` };
  return { fecha: c };
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

// .cumples: the group's birthdays, the nearest first. enElGrupo, a lid -> boolean as estaEnGrupo gives it
// (lib/identidad.js), sets apart whoever isn't in the group anymore: they're not greeted (chequearCumpleanos), and an
// admin deletes theirs with .delcumple. Without it, with no list of the group at hand, they all go together.
export function textoCumples(chat, ahora = new Date(), enElGrupo = null) {
  const lista = cumplesDeChat(chat);
  if (lista.length === 0) return { texto: "Nadie anotó su cumple todavía. Anotá el tuyo con .cumple 14/03/1995", mentions: [] };
  const ordenados = lista.map((c) => ({ ...c, faltan: diasHasta(c.dia, c.mes, ahora) })).sort((a, b) => a.faltan - b.faltan);
  const idos = enElGrupo ? ordenados.filter((c) => !enElGrupo(c.usuario)) : [];
  const estan = ordenados.filter((c) => !idos.includes(c));
  const fecha = (c) => `${String(c.dia).padStart(2, "0")}/${String(c.mes).padStart(2, "0")}`;
  // Without the year, the ones noted before .cumple asked for it: the line says so, and it tags them.
  const anios = (c) => (c.anio ? `cumple ${aniosQueCumple(c, ahora)}` : "le falta el año");
  const lineas = estan.map((c) => `${fecha(c)} ${mencion(c.usuario)} — ${c.faltan === 0 ? "¡es hoy! 🎉" : c.faltan === 1 ? "mañana" : `en ${c.faltan} días`} (${anios(c)})`);
  const bloques = [`🎂 *Cumpleaños del grupo*\n${lineas.join("\n") || "Nadie de los que están anotó su cumple todavía. Anotá el tuyo con .cumple 14/03/1995"}`];
  if (idos.length) bloques.push(`🚪 *Ya no están en el grupo* (no los saludo; un admin borra su cumple con .delcumple)\n${idos.map((c) => `${fecha(c)} ${mencion(c.usuario)}`).join("\n")}`);
  return { texto: bloques.join("\n\n"), mentions: [...estan, ...idos].map((c) => c.usuario) };
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

// Whether someone is still in the group, by its list (lib/cache-grupos.js), or null when there's none to look at.
async function sigueEnElGrupo(chat, usuario) {
  const participants = (await metadataDe(globalThis.client, chat))?.participants;
  return participants?.length ? estaEnGrupo(participants)(usuario) : null;
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
    // Whoever left the group isn't greeted there: it tagged someone who was gone. Their birthday stays noted (an admin
    // deletes it with .delcumple), and if they come back, they're greeted on the next one. With no list of the group at
    // hand, greeted as before: better a greeting for someone gone than none for someone there.
    if ((await sigueEnElGrupo(c.chat, c.usuario)) === false) continue;
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
