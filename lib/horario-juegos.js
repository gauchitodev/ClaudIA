// Per-group game hours (.horariojuegos 20:00-23:00): outside that window the game and casino commands don't run and
// the bot says what time they open. Stored in chats.horarioJuegos as "HH:MM-HH:MM"; empty = no schedule.
// The time is the tablet's local one, as everywhere else in the bot. The check is done by handle-message for plugins
// marked with plugin.juego, so no game can forget to honour it.
import { updateChat } from "../database-functions.js";
import { duracion } from "./tiempo.js";

export const HORARIO_JUEGOS = {
  AVISO_CADA_MS: 10 * 60 * 1000, // the notice with the hours goes out at most once every 10 min per group; otherwise a 🕒 reaction
};

const aMinutos = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const hhmm = (h, m) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

// Takes "20:00-23:00", "20-23", "20:00 a 23:00", "de 20 a 23", "20:30 01:00". Returns { desde, hasta } normalized to
// HH:MM, or null if it can't be parsed or the two ends are the same.
export function parsearHorario(texto) {
  const t = String(texto || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const m = t.match(/^(?:de )?(\d{1,2})(?::(\d{2}))?(?: ?hs?)?(?: ?(?:-|–|a|hasta) ?| )(\d{1,2})(?::(\d{2}))?(?: ?hs?)?$/);
  if (!m) return null;
  const [h1, m1, h2, m2] = [Number(m[1]), Number(m[2] || 0), Number(m[3]), Number(m[4] || 0)];
  if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return null;
  const desde = hhmm(h1, m1);
  const hasta = hhmm(h2, m2);
  if (desde === hasta) return null;
  return { desde, hasta };
}

// the stored "HH:MM-HH:MM" → { desde, hasta } or null
export function franjaDesdeTexto(guardado) {
  if (!guardado) return null;
  const [desde, hasta] = String(guardado).split("-");
  return desde && hasta ? { desde, hasta } : null;
}

export const horarioDe = (chat) => franjaDesdeTexto(chat?.horarioJuegos);

// Does "now" fall inside the window? Start inclusive, end exclusive; it may cross midnight.
export function franjaAbierta(h, ahora = new Date()) {
  const min = ahora.getHours() * 60 + ahora.getMinutes();
  const desde = aMinutos(h.desde);
  const hasta = aMinutos(h.hasta);
  return desde < hasta ? min >= desde && min < hasta : min >= desde || min < hasta;
}

export const textoHorario = (h) => `de ${h.desde} a ${h.hasta}`;

// With no schedule, always open. With one, open from "desde" (inclusive) to "hasta" (exclusive); if "hasta" is
// smaller than "desde", the window crosses midnight (22:00-01:00).
export function juegosAbiertos(chat, ahora = new Date()) {
  const h = horarioDe(chat);
  return !h || franjaAbierta(h, ahora);
}

// Milliseconds until the next opening (0 if open or there is no schedule).
export function msHastaApertura(chat, ahora = new Date()) {
  const h = horarioDe(chat);
  if (!h || juegosAbiertos(chat, ahora)) return 0;
  const min = ahora.getHours() * 60 + ahora.getMinutes();
  let faltan = aMinutos(h.desde) - min;
  if (faltan <= 0) faltan += 24 * 60;
  return faltan * 60 * 1000 - ahora.getSeconds() * 1000;
}

export function mensajeJuegosCerrados(chat, ahora = new Date()) {
  return `🕒 Acá los juegos van ${textoHorario(horarioDe(chat))}. Abren en ${duracion(msHastaApertura(chat, ahora))}.`;
}

// The full notice goes out once every AVISO_CADA_MS per group; in between, a 🕒 reaction on the request is enough.
if (!globalThis.avisoJuegosCerrados) globalThis.avisoJuegosCerrados = new Map();
export function correspondeAvisar(chat, ahora = Date.now()) {
  const ultimo = globalThis.avisoJuegosCerrados.get(chat) || 0;
  if (ahora - ultimo < HORARIO_JUEGOS.AVISO_CADA_MS) return false;
  globalThis.avisoJuegosCerrados.set(chat, ahora);
  return true;
}

export function fijarHorario(chat, texto) {
  const h = parsearHorario(texto);
  if (!h) return { ok: false, error: "No entendí el horario. Poné desde y hasta, por ejemplo .horariojuegos 20:00-23:00 (puede cruzar medianoche: 22:00-01:00)." };
  updateChat(chat, { horarioJuegos: `${h.desde}-${h.hasta}` });
  return { ok: true, horario: h, mensaje: `🕒 Listo: el casino en este grupo va ${textoHorario(h)}. Fuera de ese horario no anda (los demás juegos siguen andando siempre). Con .horariojuegos off se saca.` };
}

export function quitarHorario(chat) {
  updateChat(chat, { horarioJuegos: "" });
  return { ok: true, mensaje: "🕒 Listo, saqué el horario: los juegos andan a cualquier hora (mientras estén activados con .juegos)." };
}
