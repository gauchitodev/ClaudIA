// Horario de juegos por grupo (.horariojuegos 20:00-23:00): fuera de esa franja, los comandos de juegos y casino no
// corren y el bot avisa a qué hora abren. Se guarda en chats.horarioJuegos como "HH:MM-HH:MM"; vacío = sin horario.
// La hora es la local de la tablet, como en el resto del bot. El chequeo lo hace handle-message para los plugins
// marcados con plugin.juego, así ningún juego se olvida de respetarlo.
import { updateChat } from "../database-functions.js";
import { duracion } from "./tiempo.js";

export const HORARIO_JUEGOS = {
  AVISO_CADA_MS: 10 * 60 * 1000, // el aviso con el horario sale como mucho una vez cada 10 min por grupo; el resto, reacción 🕒
};

const aMinutos = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const hhmm = (h, m) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

// Acepta "20:00-23:00", "20-23", "20:00 a 23:00", "de 20 a 23", "20:30 01:00". Devuelve { desde, hasta } normalizado
// a HH:MM, o null si no se entiende o desde y hasta son iguales.
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

// "HH:MM-HH:MM" guardado → { desde, hasta } o null
export function franjaDesdeTexto(guardado) {
  if (!guardado) return null;
  const [desde, hasta] = String(guardado).split("-");
  return desde && hasta ? { desde, hasta } : null;
}

export const horarioDe = (chat) => franjaDesdeTexto(chat?.horarioJuegos);

// ¿La hora "ahora" cae dentro de la franja? Desde inclusive, hasta exclusive; puede cruzar medianoche.
export function franjaAbierta(h, ahora = new Date()) {
  const min = ahora.getHours() * 60 + ahora.getMinutes();
  const desde = aMinutos(h.desde);
  const hasta = aMinutos(h.hasta);
  return desde < hasta ? min >= desde && min < hasta : min >= desde || min < hasta;
}

export const textoHorario = (h) => `de ${h.desde} a ${h.hasta}`;

// Sin horario, siempre abiertos. Con horario, abiertos desde "desde" (inclusive) hasta "hasta" (exclusive); si "hasta"
// es más chico que "desde", la franja cruza medianoche (22:00-01:00).
export function juegosAbiertos(chat, ahora = new Date()) {
  const h = horarioDe(chat);
  return !h || franjaAbierta(h, ahora);
}

// Milisegundos hasta la próxima apertura (0 si están abiertos o no hay horario).
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

// El aviso completo sale una vez cada AVISO_CADA_MS por grupo; en el medio alcanza con reaccionar 🕒 al pedido.
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
