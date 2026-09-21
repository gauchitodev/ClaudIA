// Ratings between people after a deal. They're stored per group but the reputation belongs to the person across
// every group the bot is in, like the global blacklist: a good or bad seller is one everywhere.
import { guardarCalificacion, reputacionDe, ultimasCalificaciones, getCalificacion, calificacionesRecibidas, actualizarCalificacion, borrarCalificacion as borrarEnBase } from "../database-functions.js";
import { duracion } from "./tiempo.js";

export const REPUTACION = { MIN: 1, MAX: 5, MAX_COMENTARIO: 120 };

const mencion = (id) => `@${id.split("@")[0]}`;
const estrellas = (n) => "⭐".repeat(Math.max(1, Math.round(n)));
const promedioTexto = (p) => p.toFixed(1).replace(".", ",");

// "4,5 de 5 (12 calificaciones)" or null when they have none
export function resumenReputacion(para) {
  const r = reputacionDe(para);
  if (!r.cantidad) return null;
  return `${promedioTexto(r.promedio)} de ${REPUTACION.MAX} (${r.cantidad} ${r.cantidad === 1 ? "calificación" : "calificaciones"})`;
}

export function calificar(chat, de, para, puntos, comentario = "", ahora = Date.now()) {
  if (!para) return { ok: false, error: "¿A quién? Mencionalo: .calificar @persona 5 buen vendedor, o respondé a un mensaje suyo." };
  if (para === de) return { ok: false, error: "A vos mismo no." };
  if (!Number.isInteger(puntos) || puntos < REPUTACION.MIN || puntos > REPUTACION.MAX) return { ok: false, error: `Las estrellas van de ${REPUTACION.MIN} a ${REPUTACION.MAX}: .calificar @persona 5 buen vendedor` };
  const inicioMes = new Date(ahora);
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const limpio = String(comentario || "").replace(/\s+/g, " ").trim().slice(0, REPUTACION.MAX_COMENTARIO);
  const r = guardarCalificacion(chat, de, para, puntos, limpio, inicioMes.getTime(), ahora);
  return { ok: true, mensaje: `${estrellas(puntos)} ${r.actualizada ? "Actualicé tu calificación de este mes para" : "Calificaste a"} ${mencion(para)}${limpio ? `: "${limpio}"` : ""}. Ahora tiene ${resumenReputacion(para)}.`, mentions: [para] };
}

export function textoReputacion(para, esPropio = false) {
  const resumen = resumenReputacion(para);
  const quien = esPropio ? "Tu reputación" : `Reputación de ${mencion(para)}`;
  if (!resumen) return { texto: `⭐ ${quien}: todavía sin calificaciones. Después de una compraventa, la otra parte califica con .calificar @persona 5 <comentario>.`, mentions: [para] };
  const ultimas = ultimasCalificaciones(para, 3).map((c) => `${estrellas(c.estrellas)}${c.comentario ? ` "${c.comentario}"` : ""} — ${mencion(c.de)}`);
  return { texto: `⭐ ${quien}: *${resumen}*\n${ultimas.join("\n")}`, mentions: [para, ...ultimasCalificaciones(para, 3).map((c) => c.de)] };
}

// ---------- admin corrections (malicious ratings) ----------
// Reputation is global, but each rating was made in a group: it can be touched by an admin of that group, by the
// owner, or by whoever made it (delete only).

export function textoCalificaciones(para, chatActual, esPropio = false, ahora = Date.now()) {
  const lista = calificacionesRecibidas(para);
  const quien = esPropio ? "Tus calificaciones" : `Calificaciones de ${mencion(para)}`;
  if (!lista.length) return { texto: `⭐ ${quien}: ninguna todavía.`, mentions: [para] };
  const lineas = lista.map((c) => `*#${c.id}* ${estrellas(c.estrellas)}${c.comentario ? ` "${c.comentario}"` : ""} — ${mencion(c.de)} · hace ${duracion(ahora - c.fecha)}${c.chat === chatActual ? "" : " · en otro grupo"}`);
  return {
    texto: `⭐ ${quien} (${lista.length}, promedio ${resumenReputacion(para)}):\n${lineas.join("\n")}\n\nAdmins: .calificaciones borrar N · .calificaciones editar N <estrellas> [comentario]`,
    mentions: [para, ...new Set(lista.map((c) => c.de))],
  };
}

function puedeTocar(c, quien, borrar) {
  if (quien.isOwner) return true;
  if (borrar && c.de === quien.lid) return true;
  return quien.isAdmin && c.chat === quien.chat;
}

const sinPermiso = (c, quien, borrar) =>
  c.chat !== quien.chat && !quien.isOwner
    ? `La #${c.id} se hizo en otro grupo: la maneja un admin de ahí (o el owner).`
    : `Solo un admin del grupo${borrar ? ", quien la hizo," : ""} o el owner puede ${borrar ? "borrar" : "editar"} esa calificación.`;

// quien: { lid, chat, isAdmin, isOwner }
export function borrarCalificacion(id, quien) {
  if (!Number.isInteger(id)) return { ok: false, error: "¿Cuál? Poné el número que muestra .calificaciones @persona, por ejemplo .calificaciones borrar 12" };
  const c = getCalificacion(id);
  if (!c) return { ok: false, error: `No hay ninguna calificación #${id}.` };
  if (!puedeTocar(c, quien, true)) return { ok: false, error: sinPermiso(c, quien, true) };
  borrarEnBase(id);
  const resumen = resumenReputacion(c.para);
  return { ok: true, mensaje: `🗑️ Borré la calificación #${id} (${estrellas(c.estrellas)} de ${mencion(c.de)} a ${mencion(c.para)}). ${mencion(c.para)} ahora tiene ${resumen || "ninguna calificación"}.`, mentions: [c.de, c.para] };
}

export function editarCalificacion(id, puntos, comentario, quien) {
  if (!Number.isInteger(id)) return { ok: false, error: "¿Cuál? Poné el número que muestra .calificaciones @persona, por ejemplo .calificaciones editar 12 4 comentario" };
  const c = getCalificacion(id);
  if (!c) return { ok: false, error: `No hay ninguna calificación #${id}.` };
  if (!puedeTocar(c, quien, false)) return { ok: false, error: sinPermiso(c, quien, false) };
  if (!Number.isInteger(puntos) || puntos < REPUTACION.MIN || puntos > REPUTACION.MAX) return { ok: false, error: `Las estrellas van de ${REPUTACION.MIN} a ${REPUTACION.MAX}: .calificaciones editar ${id} 4 comentario` };
  const limpio = String(comentario || "").replace(/\s+/g, " ").trim().slice(0, REPUTACION.MAX_COMENTARIO);
  actualizarCalificacion(id, puntos, limpio);
  return { ok: true, mensaje: `✏️ La calificación #${id} de ${mencion(c.de)} a ${mencion(c.para)} quedó en ${estrellas(puntos)}${limpio ? ` "${limpio}"` : ""}. ${mencion(c.para)} ahora tiene ${resumenReputacion(c.para)}.`, mentions: [c.de, c.para] };
}
