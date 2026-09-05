// Modos de grupo: un atajo para prender o apagar de una las funciones "de grupo de amigos" del bot.
// "compraventa" deja el bot como herramienta seria: sin juegos ni casino, sin charla automática de Claudia, sin saludo
// automático, sin economía de UruCoins, sin avisos de ascenso, y sin recap semanal, pregunta del día ni trivia.
// "amigos" vuelve a prender lo de siempre. Cada interruptor también se maneja suelto desde .config.
import { getChat, updateChat } from "../database-functions.js";

export const MODOS = {
  compraventa: {
    nombre: "compraventa",
    valores: { games: 0, charla: 0, saludos: 0, monedas: 0, ascensos: 0, recapSemanal: 0, preguntaDia: 0, triviaRelampago: 0 },
    descripcion: "sin juegos ni casino, sin charla automática de Claudia, sin saludo automático, sin economía de UruCoins, sin avisos de ascenso y sin recap, pregunta del día ni trivia. Quedan moderación, roles, rangos, perfil, anti-links, descargas y utilidades",
  },
  amigos: {
    nombre: "amigos",
    valores: { games: 1, charla: 1, saludos: 1, monedas: 1, ascensos: 1, recapSemanal: 1 },
    descripcion: "juegos y casino, charla de Claudia, saludo automático, economía de UruCoins, avisos de ascenso y recap semanal prendidos",
  },
};

const ALIAS = { compraventa: "compraventa", ventas: "compraventa", serio: "compraventa", negocios: "compraventa", amigos: "amigos", normal: "amigos", social: "amigos" };

// Los interruptores que definen el modo (la pregunta del día y la trivia vienen apagadas por defecto y no cuentan).
const INTERRUPTORES = [
  ["games", "juegos"],
  ["charla", "charla de Claudia"],
  ["saludos", "saludo automático"],
  ["monedas", "economía"],
  ["ascensos", "avisos de ascenso"],
  ["recapSemanal", "recap semanal"],
];

// "compraventa" si todo está apagado, "amigos" si todo está prendido, "mixto" en el medio.
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
