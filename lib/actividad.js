// Group activity: the daily streak. Writing at least RACHA_MENSAJES_DIA "real" messages (two words or more, not
// counting commands) in a day earns coins, and the prize grows with consecutive days up to RACHA_MAX. What is
// rewarded is the active day, not the number of messages, so firing off twenty "jaja"s gets you nowhere.
import { sumarMensajeDiario, getRacha, setRacha, ganarCoins } from "../database-functions.js";
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
