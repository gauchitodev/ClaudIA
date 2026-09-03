// Actividad del grupo: racha diaria. Escribir al menos RACHA_MENSAJES_DIA mensajes "de verdad" (dos palabras o más,
// sin contar comandos) en un día da monedas, y el premio sube con los días seguidos hasta RACHA_MAX. Se premia el
// día activo, no la cantidad de mensajes, así no sirve mandar veinte "jaja".
import { sumarMensajeDiario, getRacha, setRacha, ganarCoins } from "../database-functions.js";
import { COINS } from "./urucoins.js";
import { DIA_MS } from "./tiempo.js";

const pad = (n) => String(n).padStart(2, "0");
export const claveDia = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Horarios de las cosas automáticas (hora local de la tablet).
export const ACTIVIDAD = {
  HORA_PREGUNTA: 12, // pregunta del día a partir de esta hora
  RELAMPAGO_VECES: 2, // trivias relámpago por día
  RELAMPAGO_DESDE: 10, // ventana horaria de las relámpago
  RELAMPAGO_HASTA: 22,
  RELAMPAGO_SEGUNDOS: 120, // tiempo para acertar
  DIA_RECAP: 0, // domingo
  HORA_RECAP: 21,
};

// ¿cuenta como mensaje de charla? al menos dos palabras
export function mensajeCuenta(texto) {
  return String(texto || "").trim().split(/\s+/).filter(Boolean).length >= 2;
}

// Se llama en cada mensaje de grupo. Devuelve { dias, premio } en el momento en que la persona completa el día;
// null el resto de las veces.
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
  const premio = Math.min(COINS.RACHA_MAX, COINS.RACHA_BASE + dias - 1);
  ganarCoins(chat, usuario, premio, "racha_dia");
  return { dias, premio };
}

// Línea para .coins. "" si nunca tuvo racha.
export function textoRacha(chat, usuario) {
  const r = getRacha(chat, usuario);
  if (!r) return "";
  const hoy = claveDia();
  const ayer = claveDia(new Date(Date.now() - DIA_MS));
  if (r.ultimoDia !== hoy && r.ultimoDia !== ayer) return r.mejor > 1 ? `🔥 Racha diaria: cortada (tu mejor: ${r.mejor} días)` : "";
  return `🔥 Racha diaria: ${r.dias} ${r.dias === 1 ? "día" : "días"}${r.ultimoDia === hoy ? "" : " (hoy todavía no completaste)"} · mejor: ${r.mejor}`;
}
