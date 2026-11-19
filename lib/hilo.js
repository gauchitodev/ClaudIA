// The thread: what of Claudia's short-term memory (lib/contexto-chat.js) goes into a prompt, and how each message is
// written there. For her chat (plugins/_auto-ia.js) and for her glances (lib/vistazos.js), which read the same way.
//
// A line says who, how long ago, whom they were answering and what: "Ana (hace 5 min, respondiendo a Beto: «¿quién
// va?»): yo". Her chat used to get "Ana: yo" and nothing else: with no clock, something said five hours ago read like
// the line before it, and a "sí, voy" told nobody what it was a yes to. What isn't text is there by its mark
// (lib/adjuntos.js), and a sticker by what the AI saw in it, if it has looked at it by now (lib/stickers-grupo.js).
import { contextoChat, fueComando, MEMORIA_CORTA } from "./contexto-chat.js";
import { adjuntoDe, esAdjuntoMudo, marca, variasDe } from "./adjuntos.js";
import { descripcionDe } from "./stickers-grupo.js";
import { esMensajeDeJuego } from "./mensajes-de-juego.js";
import { duracion } from "./tiempo.js";

const MIN = 60 * 1000;

export const HILO = {
  MAX_CITA: 80, // of the message a reply answers, this much is shown
  TANDA_MS: 2 * MIN, // attachments with nothing to read, this close together and from one person, are one line
};

// What the AI saw in a sticker, swappable by the tests.
export const _dep = { descripcion: (sha) => descripcionDe(sha) };

// What goes with the lines, when they have what it explains. Of a photo there's its mark and nothing else, and she
// isn't to talk about it as if she had seen it. A voice note she did hear reads the same way, as what it said.
export const LEYENDA_ADJUNTOS = "Lo que empieza con un emoji y un paréntesis, como «📷 (foto)», es algo que mandaron y no es texto. De eso sabés solo lo que dice ahí: no hables de lo que muestra o de cómo suena como si lo hubieras visto u oído.";
// And what the bot sends is hers, in someone else's voice: its bold titles and its lists aren't how she talks.
export const LEYENDA_AUTOMATICOS = "Los tuyos que dicen «automático» son lo que el bot contestó a un comando o mandó solo (un juego, un aviso): salieron de vos y sabés que pasaron, pero no son tu manera de hablar, así que no copies su formato.";

export const hace = (ms) => (ms < MIN ? "recién" : `hace ${duracion(ms)}`);

// A sticker's description, or null: for anything that isn't one, for one she has no file of, and if the database
// fails, which mustn't cost her the answer.
function descripcionDelSticker(entrada) {
  if (!entrada?.sha || adjuntoDe(entrada.texto)?.tipo !== "sticker") return null;
  try {
    return _dep.descripcion(entrada.sha) || null;
  } catch {
    return null;
  }
}

// What a stored message says, as she reads it.
export function textoDe(entrada) {
  const descripcion = descripcionDelSticker(entrada);
  return descripcion ? marca("sticker", `: ${descripcion}`) : entrada.texto;
}

// Whether there's something in it to read: text, a caption, what a voice note said, a sticker the AI has looked at.
// A bare photo isn't: she knows it's there, and that's all. A glance reacts only to what she can read.
export const esLegible = (entrada) => !esAdjuntoMudo(entrada.texto) || Boolean(descripcionDelSticker(entrada));

// Whether a glance can quote it: what's stored of an attachment is its mark, and quoting it would show that mark as if
// someone had typed it.
export const seCita = (entrada) => !entrada.esAudio && !adjuntoDe(entrada.texto);

const recortar = (texto, largo) => (texto.length > largo ? `${texto.slice(0, largo).trim()}…` : texto);

// Whom a message answers, and what that one said, read from the memory as it is now: once deleted, only whose it was is
// left, and an edit shows as it was left. A game's question is never shown: with it in her prompt she gave the answer
// away (lib/mensajes-de-juego.js). anterior: the message right above, which needs no reminder of what it said.
function respondeA(entrada, porId, anterior) {
  if (!entrada.citaId) return "";
  if (esMensajeDeJuego(entrada.citaId)) return "respondiendo a un juego del bot";
  const citada = porId?.get(entrada.citaId) || null;
  const aQuien = citada ? (citada.esBot ? "un mensaje tuyo" : citada.nombre) : entrada.citaA;
  if (!aQuien) return "";
  const loDicho = citada && citada !== anterior ? `: «${recortar(textoDe(citada), HILO.MAX_CITA)}»` : "";
  return `respondiendo a ${aQuien}${loDicho}`;
}

// "Ana (hace 5 min, respondiendo a Beto)", "Claudia (vos, hace 2 min)", "Claudia (vos, automático, recién)".
function quienYCuando(entrada, ahora, porId, anterior) {
  const datos = [];
  if (entrada.esBot) datos.push(fueComando(entrada) ? "vos, automático" : "vos");
  datos.push(hace(ahora - entrada.fecha));
  const cita = respondeA(entrada, porId, anterior);
  if (cita) datos.push(cita);
  return `${entrada.esBot ? "Claudia" : entrada.nombre} (${datos.join(", ")})`;
}

const autor = (entrada) => (entrada.esBot ? "bot" : entrada.usuario || entrada.nombre);

// Whether a message goes on the run of the one before it: both attachments of the same kind with nothing to read, from
// the same person, close together. An album comes as a message per photo, and ten lines of "(foto)" pushed the
// conversation out of what she gets.
function sigueLaTanda(previa, entrada) {
  if (entrada.citaId || autor(previa) !== autor(entrada) || Math.abs(entrada.fecha - previa.fecha) > HILO.TANDA_MS) return false;
  if (fueComando(previa) || fueComando(entrada) || esLegible(previa) || esLegible(entrada)) return false;
  return adjuntoDe(previa.texto).tipo === adjuntoDe(entrada.texto).tipo;
}

function enTandas(entradas) {
  const tandas = [];
  for (const entrada of entradas) {
    const ultima = tandas.at(-1);
    if (ultima && sigueLaTanda(ultima.at(-1), entrada)) ultima.push(entrada);
    else tandas.push([entrada]);
  }
  return tandas;
}

const porIdDe = (chat) => new Map((contextoChat.get(chat) || []).filter((e) => e.id).map((e) => [e.id, e]));

// Those messages as lines, the oldest first: [{ entrada (the first one of the line), texto }], without a bullet or a
// number, which whoever asks puts in front. chat: where they're from, to look up what a reply answers.
export function lineasDelHilo(entradas, { ahora = Date.now(), chat = null } = {}) {
  const porId = entradas.some((e) => e.citaId) ? porIdDe(chat) : null;
  const lineas = [];
  let anterior = null;
  for (const tanda of enTandas(entradas)) {
    const [primera] = tanda;
    const dicho = tanda.length > 1 ? variasDe(adjuntoDe(primera.texto).tipo, tanda.length) : textoDe(primera);
    lineas.push({ entrada: primera, texto: `${quienYCuando(primera, ahora, porId, anterior)}: ${dicho}` });
    anterior = tanda.at(-1);
  }
  return lineas;
}

// What explains those messages, in one line: "" when none of them needs it.
export function leyendaDe(entradas) {
  const leyendas = [];
  if (entradas.some((e) => adjuntoDe(e.texto))) leyendas.push(LEYENDA_ADJUNTOS);
  if (entradas.some((e) => e.esBot && fueComando(e))) leyendas.push(LEYENDA_AUTOMATICOS);
  return leyendas.join(" ");
}

// What her chat gets of a chat: its last EN_CONTEXTO lines of conversation and, from among them on, the last
// DE_COMANDOS of the bot's machinery: the commands people typed and what the bot answered or sent on its own
// (fueComando). Those used to take their lines out of the same fourteen, the commands, and weren't there at all, the
// answers: asked "¿y eso que me salió en la ruleta?", she knew of no roulette. Never a game's own message, question or
// board. Given the id of the message being answered (it goes apart), only what came before it: others may have come in
// after it while the hooks ran. Returns the stored messages, the oldest first.
export function entradasDelHilo(chat, idActual = null) {
  const lista = contextoChat.get(chat) || [];
  const posicion = idActual ? lista.findIndex((x) => x.id === idActual) : -1;
  const hasta = posicion >= 0 ? posicion : lista.length;
  const elegidas = [];
  let lineas = 0;
  let comandos = 0;
  let ultimaDeCharla = null;
  for (let i = hasta - 1; i >= 0; i--) {
    const entrada = lista[i];
    if (fueComando(entrada)) {
      if (comandos < MEMORIA_CORTA.DE_COMANDOS && !esMensajeDeJuego(entrada.id)) {
        comandos++;
        elegidas.push(i);
      }
      continue;
    }
    // One more of a run already counted takes no line of its own.
    const deLaTanda = ultimaDeCharla !== null && sigueLaTanda(entrada, ultimaDeCharla);
    if (!deLaTanda && lineas === MEMORIA_CORTA.EN_CONTEXTO) break;
    if (!deLaTanda) lineas++;
    ultimaDeCharla = entrada;
    elegidas.push(i);
  }
  return elegidas.reverse().map((i) => lista[i]);
}

// Those messages as the text her chat's prompt carries, a line each. "" when there's nothing.
export function textoDelHilo(chat, idActual = null, ahora = Date.now()) {
  return lineasDelHilo(entradasDelHilo(chat, idActual), { ahora, chat })
    .map((linea) => `- ${linea.texto}`)
    .join("\n");
}
