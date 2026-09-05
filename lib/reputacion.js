// Calificaciones entre personas después de una compraventa. Se guardan por grupo pero la reputación es de la
// persona en todos los grupos del bot, como la lista negra global: un buen o mal vendedor lo es en todos lados.
import { guardarCalificacion, reputacionDe, ultimasCalificaciones } from "../database-functions.js";

export const REPUTACION = { MIN: 1, MAX: 5, MAX_COMENTARIO: 120 };

const mencion = (id) => `@${id.split("@")[0]}`;
const estrellas = (n) => "⭐".repeat(Math.max(1, Math.round(n)));
const promedioTexto = (p) => p.toFixed(1).replace(".", ",");

// "4,5 de 5 (12 calificaciones)" o null si no tiene
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
