// Group activity: the daily streak. Writing at least RACHA_MENSAJES_DIA "real" messages (two words or more, not
// counting commands) in a day earns coins, and the prize grows with consecutive days up to RACHA_MAX. What is
// rewarded is the active day, not the number of messages, so firing off twenty "jaja"s gets you nowhere.
import { sumarMensajeDiario, getRacha, setRacha, ganarCoins, mensajesPorHora, mensajesPorDia, primerDiaActividadHoraria, podarActividadHoraria, enviosBotPorDia } from "../database-functions.js";
import { COINS, monedasActivas } from "./urucoins.js";
import { DIA_MS } from "./tiempo.js";

const pad = (n) => String(n).padStart(2, "0");
export const claveDia = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Schedule for the automatic things (the tablet's local time).
export const ACTIVIDAD = {
  HORA_PREGUNTA: 12, // the daily question goes out from this hour on
  RELAMPAGO_VECES: 2, // cap on lightning trivias per day
  RELAMPAGO_PROBABILIDAD: 0.45, // odds of each one being scheduled (with 2 and 0.45 you get ~0.9 a day)
  RELAMPAGO_MENSAJES_MINIMOS: 40, // messages the group needs from the previous day for one to be scheduled
  RELAMPAGO_DESDE: 10, // the lightning trivias' time window
  RELAMPAGO_HASTA: 22,
  RELAMPAGO_SEGUNDOS: 120, // time to get it right
  DIA_RECAP: 0, // domingo
  HORA_RECAP: 21,
  HORARIA_DIAS: 90, // how much hourly detail .podar keeps
  HORARIA_TRANQUILA: 6, // width, in hours, of the quiet stretch the panel reports
};

// does it count as a conversational message? at least two words
export function mensajeCuenta(texto) {
  return String(texto || "").trim().split(/\s+/).filter(Boolean).length >= 2;
}

// Called on every group message. Returns { dias, premio } the moment the person completes the day; null otherwise.
export function registrarActividad(chat, usuario, texto) {
  if (!mensajeCuenta(texto)) return null;
  const hoy = claveDia();
  const mensajes = sumarMensajeDiario(chat, usuario, hoy);
  if (mensajes !== COINS.RACHA_MENSAJES_DIA) return null;

  const racha = getRacha(chat, usuario);
  if (racha?.ultimoDia === hoy) return null;
  const ayer = claveDia(new Date(Date.now() - DIA_MS));
  const dias = racha?.ultimoDia === ayer ? (racha.dias || 0) + 1 : 1;
  setRacha(chat, usuario, dias, hoy);
  // with the economy off (.monedas / .modo compraventa) the streak is still counted, but it doesn't pay
  const premio = monedasActivas(chat) ? Math.min(COINS.RACHA_MAX, COINS.RACHA_BASE + dias - 1) : 0;
  if (premio > 0) ganarCoins(chat, usuario, premio, "racha_dia");
  return { dias, premio };
}

// The line for .racha. "" if they never had a streak.
export function textoRacha(chat, usuario) {
  const r = getRacha(chat, usuario);
  if (!r) return "";
  const hoy = claveDia();
  const ayer = claveDia(new Date(Date.now() - DIA_MS));
  if (r.ultimoDia !== hoy && r.ultimoDia !== ayer) return r.mejor > 1 ? `🔥 Racha diaria: cortada (tu mejor: ${r.mejor} días)` : "";
  return `🔥 Racha diaria: ${r.dias} ${r.dias === 1 ? "día" : "días"}${r.ultimoDia === hoy ? "" : " (hoy todavía no completaste)"} · mejor: ${r.mejor}`;
}

// ---------- group activity panel (.actividad) ----------
const ANCHO_BARRA = 12;
const barra = (n, max) => {
  const llenos = max > 0 ? Math.max(1, Math.round((n / max) * ANCHO_BARRA)) : 0;
  return "█".repeat(llenos) + "░".repeat(ANCHO_BARRA - llenos);
};

// The quietest stretch of HORARIA_TRANQUILA consecutive hours, wrapping around midnight.
function franjaTranquila(porHora) {
  const ancho = ACTIVIDAD.HORARIA_TRANQUILA;
  let mejor = { desde: 0, total: Infinity };
  for (let desde = 0; desde < 24; desde++) {
    let total = 0;
    for (let i = 0; i < ancho; i++) total += porHora[(desde + i) % 24];
    if (total < mejor.total) mejor = { desde, total };
  }
  return mejor;
}

// ---------- shared by the two panels (.actividad and .enviados) ----------

// The last n days as day keys, today first.
export const ultimosDias = (ahora = new Date(), n = 7) => Array.from({ length: n }, (_, i) => claveDia(new Date(ahora.getTime() - i * DIA_MS)));

// Today against yesterday, and the total and average over the days. "porDia" maps day -> total over "dias" (today
// first) and "desde" is the first day ever counted. Both tables were born with their panel, so a chat may have fewer
// than 7 days counted: the average is over the days that were. Dividing by 7 regardless turned a first day of 300
// messages into "43 por día", and "ayer 0" is only true if yesterday was counted at all.
export function lineasDeDias({ dias, porDia, desde }) {
  const total = dias.reduce((t, d) => t + (porDia.get(d) || 0), 0);
  const contados = dias.filter((d) => !desde || d >= desde).length;
  const lineas = [`Hoy: *${porDia.get(dias[0]) || 0}* mensajes${contados > 1 ? ` · ayer ${porDia.get(dias[1]) || 0}` : ""}`];
  if (contados > 1) lineas.push(`Últimos ${contados} días: *${total}* · ${Math.round(total / contados)} por día`);
  return lineas;
}

// The three busiest hours, with bars. "porHora" holds the 24 totals.
export function lineasHorasPico(porHora) {
  const max = Math.max(...porHora);
  const pico = porHora
    .map((mensajes, hora) => ({ hora, mensajes }))
    .filter((h) => h.mensajes > 0)
    .sort((a, b) => b.mensajes - a.mensajes)
    .slice(0, 3);
  return ["*Horas pico*", ...pico.map((h) => `${pad(h.hora)}:00 ${barra(h.mensajes, max)} ${h.mensajes}`)];
}

// .actividad: how much the group talks and when, over the last week. Returns { texto, mentions }.
export function textoActividad(chat, ahora = new Date()) {
  const dias = ultimosDias(ahora);
  const porDia = new Map(mensajesPorDia(chat, dias).map((r) => [r.fecha, r.total]));
  const total = dias.reduce((t, d) => t + (porDia.get(d) || 0), 0);
  if (total === 0) return { texto: "📊 No tengo actividad registrada de los últimos 7 días en este grupo.", mentions: [] };

  const porHora = Array(24).fill(0);
  for (const r of mensajesPorHora(chat, dias)) porHora[r.hora] = r.total;

  const lineas = lineasDeDias({ dias, porDia, desde: primerDiaActividadHoraria(chat) });
  // What the bot itself said here today, next to the group's own count (this table leaves the bot out). It's the
  // telling number for what Claudia was blocked for: a group where she puts in half the messages looks like what
  // WhatsApp shut down. Today only, which both tables have in full: the bot's was born later.
  const delBot = enviosBotPorDia(chat, [dias[0]])[0]?.total || 0;
  const deLaGente = porDia.get(dias[0]) || 0;
  if (delBot > 0) lineas.push(`🤖 Claudia hoy: *${delBot}* · ${Math.round((delBot / (delBot + deLaGente)) * 100)}% del grupo`);
  lineas.push("", ...lineasHorasPico(porHora));

  const tranquila = franjaTranquila(porHora);
  lineas.push("", `Más tranquilo: de ${pad(tranquila.desde)} a ${pad((tranquila.desde + ACTIVIDAD.HORARIA_TRANQUILA) % 24)} h`);

  return { texto: `📊 *ACTIVIDAD DEL GRUPO*\n\n${lineas.join("\n")}`, mentions: [] };
}

// Drops hourly detail older than HORARIA_DIAS, in every group. Returns how many rows went.
export function podarActividad(ahora = Date.now()) {
  return podarActividadHoraria(claveDia(new Date(ahora - ACTIVIDAD.HORARIA_DIAS * DIA_MS)));
}
