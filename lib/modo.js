// Group modes: a shortcut to switch the bot's "group of friends" features on or off in one go.
// "compraventa" leaves the bot as a serious tool: no games or casino, no fun commands (couples and families, quotes and
// jokes, the horoscope…: plugin.diversion), no stickers or converters (.s, .tts, .qr…: plugin.convertidores), no
// automatic chat from Claudia, no automatic greeting nor the birthdays' (.saludocumple), no UruCoins economy, no
// promotion notices, and no weekly recap, daily question, trivia, random reactions (.reacciones) or diary (.diario).
// "amigos" turns the usual stuff back on, but for what comes off unless a group asks for it (the daily question, the
// trivia, the initiative, the reactions, the diary), which it leaves as it finds it.
// Each switch is also handled on its own from .config.
import { getChat, updateChat } from "../database-functions.js";

export const MODOS = {
  compraventa: {
    nombre: "compraventa",
    valores: { games: 0, diversion: 0, convertidores: 0, charla: 0, saludos: 0, saludoCumple: 0, monedas: 0, ascensos: 0, recapSemanal: 0, preguntaDia: 0, triviaRelampago: 0, iniciativa: 0, reactions: 0, diarioDesde: 0 },
    descripcion: "sin juegos ni casino, sin diversión (parejas, familias, frases como .orsi, horóscopo, versículos, temáticas, el ranking del mes…), sin stickers ni convertidores (.s, .tts, .qr, efectos de audio…), sin charla automática de Claudia, sin saludo automático ni de cumpleaños, sin economía de UruCoins, sin avisos de ascenso y sin recap, pregunta del día, trivia, iniciativa, reacciones ni diario. Quedan moderación, roles, rangos, perfil, anti-links, descargas y herramientas como .clima, .traducir o .recordame",
  },
  amigos: {
    nombre: "amigos",
    valores: { games: 1, diversion: 1, convertidores: 1, charla: 1, saludos: 1, saludoCumple: 1, monedas: 1, ascensos: 1, recapSemanal: 1 },
    descripcion: "juegos y casino, diversión, stickers y convertidores, charla de Claudia, saludo automático y de cumpleaños, economía de UruCoins, avisos de ascenso y recap semanal prendidos",
  },
};

const ALIAS = { compraventa: "compraventa", ventas: "compraventa", serio: "compraventa", negocios: "compraventa", amigos: "amigos", normal: "amigos", social: "amigos" };

// The switches that define the mode (the daily question, trivia and initiative are off by default and don't count).
const INTERRUPTORES = [
  ["games", "juegos"],
  ["diversion", "diversión"],
  ["convertidores", "stickers y convertidores"],
  ["charla", "charla de Claudia"],
  ["saludos", "saludo automático"],
  ["saludoCumple", "saludo de cumpleaños"],
  ["monedas", "economía"],
  ["ascensos", "avisos de ascenso"],
  ["recapSemanal", "recap semanal"],
];

// Whether the group reads loose sales ("vendo…", "¿alguien vende…?", plugins/_compraventa.js): with the games and the
// economy off, what .modo compraventa leaves and what .menuventas calls buy-and-sell mode. It used to take every switch
// off, so turning the greetings back on stopped it without a word while .menuventas still said buy-and-sell mode.
export const esGrupoDeVentas = (fila) => fila?.games === 0 && fila?.monedas === 0;

// What a fun command (plugin.diversion) answers in a group that turned them off (handle-message.js).
export const DIVERSION_APAGADA = "🎈 La diversión está apagada en este grupo. Un admin la prende con .diversion on";
// And a sticker or a converter (plugin.convertidores).
export const CONVERTIDORES_APAGADOS = "🔄 Los stickers y convertidores están apagados en este grupo. Un admin los prende con .convertidores on";

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
  // What a buy-and-sell group gets for being one: the loose sales read, and its catalogue shown unasked every few hours
  // unless .catalogoauto switched that off (lib/compraventa.js). It says the catalogue carries each seller's number: an
  // admin looking at how the group stands should know the bot posts them.
  const catalogo = fila?.catalogoAuto === 0 ? "El catálogo no lo muestro por mi cuenta (.catalogoauto on)." : "Muestro el catálogo cada 4 horas, de 11 a 21, con el teléfono de quien publicó cada una (.catalogoauto off lo apaga).";
  const sueltas = esGrupoDeVentas(fila) ? `🏷️ Leo las ventas sueltas («vendo…», «¿alguien vende…?»): los juegos y la economía están apagados. ${catalogo}` : "🏷️ Las ventas sueltas («vendo…») no las leo: eso va con los juegos y la economía apagados.";
  return `⚙️ Modo actual: *${modoActual(fila)}*\n${estados}\n${sueltas}\n\n.modo compraventa → ${MODOS.compraventa.descripcion}.\n.modo amigos → ${MODOS.amigos.descripcion}.\nCada cosa suelta: .juegos, .diversion, .convertidores, .charla, .saludos, .saludocumple, .monedas, .ascensos y .recapsemanal.`;
}

export function aplicarModo(chat, texto) {
  const clave = ALIAS[String(texto || "").toLowerCase().trim()];
  if (!clave) return { ok: false, error: "Modos disponibles: .modo compraventa (bot serio, sin juegos ni charla ni economía) o .modo amigos (todo prendido). Sin nada, .modo muestra cómo está el grupo." };
  const modo = MODOS[clave];
  updateChat(chat, modo.valores);
  return { ok: true, mensaje: `⚙️ Listo, este grupo quedó en modo *${modo.nombre}*: ${modo.descripcion}.` };
}
