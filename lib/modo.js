// Group modes: a shortcut to switch the bot's "group of friends" features on or off in one go.
// "compraventa" leaves the bot as a serious tool: no games or casino, no automatic chat from Claudia, no automatic
// greeting, no UruCoins economy, no promotion notices, and no weekly recap, daily question or trivia.
// "amigos" turns the usual stuff back on. Each switch is also handled on its own from .config.
import { getChat, updateChat } from "../database-functions.js";

export const MODOS = {
  compraventa: {
    nombre: "compraventa",
    valores: { games: 0, charla: 0, saludos: 0, monedas: 0, ascensos: 0, recapSemanal: 0, preguntaDia: 0, triviaRelampago: 0, iniciativa: 0 },
    descripcion: "sin juegos ni casino, sin charla automática de Claudia, sin saludo automático, sin economía de UruCoins, sin avisos de ascenso y sin recap, pregunta del día, trivia ni iniciativa. Quedan moderación, roles, rangos, perfil, anti-links, descargas y utilidades",
  },
  amigos: {
    nombre: "amigos",
    valores: { games: 1, charla: 1, saludos: 1, monedas: 1, ascensos: 1, recapSemanal: 1 },
    descripcion: "juegos y casino, charla de Claudia, saludo automático, economía de UruCoins, avisos de ascenso y recap semanal prendidos",
  },
};

const ALIAS = { compraventa: "compraventa", ventas: "compraventa", serio: "compraventa", negocios: "compraventa", amigos: "amigos", normal: "amigos", social: "amigos" };

// The switches that define the mode (the daily question, trivia and initiative are off by default and don't count).
const INTERRUPTORES = [
  ["games", "juegos"],
  ["charla", "charla de Claudia"],
  ["saludos", "saludo automático"],
  ["monedas", "economía"],
  ["ascensos", "avisos de ascenso"],
  ["recapSemanal", "recap semanal"],
];

// "compraventa" when everything is off, "amigos" when everything is on, "mixto" in between.
export function modoActual(fila) {
  if (!fila) return "amigos";
  if (INTERRUPTORES.every(([k]) => fila[k] === 0)) return "compraventa";
  if (INTERRUPTORES.every(([k]) => fila[k] !== 0)) return "amigos";
  return "mixto";
}

export function textoModo(chat) {
  const fila = getChat(chat);
  const estados = INTERRUPTORES.map(([k, nombre]) => `${fila?.[k] === 0 ? "❌" : "✅"} ${nombre}`).join(" · ");
  return `⚙️ Modo actual: *${modoActual(fila)}*\n${estados}\n\n.modo compraventa → ${MODOS.compraventa.descripcion}.\n.modo amigos → ${MODOS.amigos.descripcion}.\nCada cosa suelta: .juegos, .charla, .saludos, .monedas, .ascensos y .recapsemanal.`;
}

export function aplicarModo(chat, texto) {
  const clave = ALIAS[String(texto || "").toLowerCase().trim()];
  if (!clave) return { ok: false, error: "Modos disponibles: .modo compraventa (bot serio, sin juegos ni charla ni economía) o .modo amigos (todo prendido). Sin nada, .modo muestra cómo está el grupo." };
  const modo = MODOS[clave];
  updateChat(chat, modo.valores);
  return { ok: true, mensaje: `⚙️ Listo, este grupo quedó en modo *${modo.nombre}*: ${modo.descripcion}.` };
}
