// Claudia's turn to talk in a chat (plugins/_auto-ia.js). She answers once every 20 seconds per chat at most: that
// keeps the number's volume low, which is what gets accounts banned. What was said to her in between used to be
// dropped: whoever named her a few seconds after someone else got no answer and no sign, and "Claudia" in one message
// with the question in the next got her answer to the name alone. Now what's said to her waits for her turn and is
// answered in one go, the last message with the earlier ones named in the prompt. A bare call ("Claudia", "hola bot")
// waits a few seconds for its question, and the next message of whoever called her that way is for her too.
//
// A turn isn't always an answer: named in passing she may say nothing, and to a "gracias" she may just react
// (plugins/_auto-ia.js). Then the turn is given back (soltarTurno), so the pause doesn't count from a message she never
// sent, and whoever she let go by gets words if they insist (insiste).
import { estadoDe } from "./estado-de-plugins.js";
import { normalizar, PALABRAS_CLAVE } from "./iniciativa.js";

export const TURNOS = {
  PAUSA_MS: 20 * 1000, // between two of her answers in a chat
  ESPERA_PREGUNTA_MS: 8 * 1000, // after a bare call: how long she waits for its question
  ESPERA_MAX_MS: 20 * 1000, // however many calls keep coming, no longer than this after the first one waiting
  SIGUE_MS: 60 * 1000, // after a bare call, the caller's next message is for her if it comes within this
  CITA_DESDE_MS: 5 * 1000, // an answer this late quotes the message it answers, or it reads as said to no one
  MAX_ANTES: 4, // the earlier messages of a batch named in the prompt
  MAX_TANDA: 10, // the messages a batch keeps, the last ones
  INSISTE_MS: 2 * 60 * 1000, // after she let someone's message go by: what they say to her this soon gets words
};

// chat -> when she last started to talk: her pace, shared with lib/vistazos.js and plugins/_stickers-grupo.js
const ritmoDeClaudia = estadoDe("ia-ultima-respuesta", () => new Map());
const tandas = new Map(); // chat -> what was said to her and waits for her answer, the oldest first
const llamadas = new Map(); // "chat|person" -> until when that person's next message is for her
const turnos = new Map(); // chat -> the turn she's in: when she took it, and her pace as it was before
const silencios = new Map(); // chat -> [{ ids, hasta }]: whom she let go by there, and until when what they say gets words

export function reiniciarTurnos() {
  tandas.clear();
  llamadas.clear();
  turnos.clear();
  silencios.clear();
}

// What a bare call may carry besides her name: a greeting, and nothing else to answer.
const SALUDO = /^(hola+|holi+s?|buenas+|buen|buenos|dias?|tardes|noches|che+|ey+|hey+|eh+|epa+|oye+|oime|ps+t|alo+)$/;
const SUYA = new RegExp(`^(?:${PALABRAS_CLAVE.join("|")})$`);

// A bare call: her name, or a mention of her (the digits of her ids in "suyos"), with at most a greeting, signs and
// emoji. A voice note isn't one: it carries what it says.
export function esLlamadaSola(texto, suyos = []) {
  let t = String(texto || "");
  for (const digitos of suyos) t = t.replace(new RegExp(`@${digitos}(?!\\d)`, "g"), " ");
  const palabras = normalizar(t)
    .replace(/[^a-z0-9ñ]+/g, " ")
    .split(" ")
    .filter(Boolean);
  return palabras.every((p) => SUYA.test(p) || SALUDO.test(p));
}

// Whether a message that doesn't name her is for her anyway: the next one of whoever called her by name alone, within
// SIGUE_MS (anotar closes it).
export function sigueLaLlamada(chat, persona, ahora) {
  const clave = `${chat}|${persona}`;
  const hasta = llamadas.get(clave);
  if (hasta !== undefined && ahora > hasta) llamadas.delete(clave);
  return hasta !== undefined && ahora <= hasta;
}

// A message that's for her, noted until her turn; returns when that is (cuandoContesta). entrada: { persona, solo (a
// bare call) } and whatever the answer needs.
export function anotar(chat, entrada, ahora) {
  const tanda = [...(tandas.get(chat) || []), { ...entrada, en: ahora }];
  tandas.set(chat, tanda.slice(-TURNOS.MAX_TANDA));
  const clave = `${chat}|${entrada.persona}`;
  if (entrada.solo) llamadas.set(clave, ahora + TURNOS.SIGUE_MS);
  else llamadas.delete(clave);
  return cuandoContesta(chat, ahora);
}

// When she answers what waits in a chat: once the pause since she last talked is over, and, when the last thing
// waiting is a bare call, once its question had time to come, but no later than ESPERA_MAX_MS after the first message
// waiting. null when nothing waits.
export function cuandoContesta(chat, ahora) {
  const tanda = tandas.get(chat);
  if (!tanda?.length) return null;
  const libre = (ritmoDeClaudia.get(chat) || 0) + TURNOS.PAUSA_MS;
  const ultimo = tanda.at(-1);
  const pregunta = ultimo.solo ? Math.min(ultimo.en + TURNOS.ESPERA_PREGUNTA_MS, tanda[0].en + TURNOS.ESPERA_MAX_MS) : 0;
  return Math.max(libre, pregunta, ahora);
}

// What waits in a chat, taken to answer it now: her turn starts, and the pause counts from here. null when it isn't
// her turn yet (she talked in between: a glance, a sticker) or nothing waits.
export function tomarTanda(chat, ahora) {
  const cuando = cuandoContesta(chat, ahora);
  if (cuando === null || cuando > ahora) return null;
  const tanda = tandas.get(chat);
  tandas.delete(chat);
  turnos.set(chat, { tomado: ahora, antes: ritmoDeClaudia.get(chat) });
  ritmoDeClaudia.set(chat, ahora);
  return tanda;
}

// The turn she took, given back: she read what was said to her and sent nothing, or only a reaction. Her pace goes
// back to what it was, so the next message for her doesn't wait 20 s on one she never sent, nor does a sticker hold
// off as if she had just talked. Only while the pace is still this turn's: if she said something on her own meanwhile
// (a glance, a sticker), that one counts; and so a turn is given back once. Returns whether it was given back.
export function soltarTurno(chat) {
  const turno = turnos.get(chat);
  if (!turno || ritmoDeClaudia.get(chat) !== turno.tomado) return false;
  if (turno.antes === undefined) ritmoDeClaudia.delete(chat);
  else ritmoDeClaudia.set(chat, turno.antes);
  return true;
}

// ---------- whoever she let go by ----------

// Whether any of these ids is one of the ids a silence was noted with: a person comes with their LID, their number or
// both, and the next message may bring only one of them.
const esDe = (silencio, ids) => (ids || []).some((id) => id && silencio.ids.includes(id));

// She let a message go by without words: for INSISTE_MS, what its author says to her gets them, whatever it is.
// Someone ignored who asks again is talking to her, and a second silence reads as a bot that broke. ids: the ids the
// person came with. The ones that ran out in that chat go as it's noted, so they don't pile up.
export function anotarSilencio(chat, ids, ahora) {
  const siguen = (silencios.get(chat) || []).filter((s) => s.hasta >= ahora);
  silencios.set(chat, [...siguen, { ids: (ids || []).filter(Boolean), hasta: ahora + TURNOS.INSISTE_MS }]);
}

// Whether a message of theirs comes that soon after one she let go by.
export const insiste = (chat, ids, ahora) => (silencios.get(chat) || []).some((s) => s.hasta >= ahora && esDe(s, ids));

// She answered them with words: what they say next is a message like any other, whichever of their ids it comes with.
export function olvidarSilencio(chat, ids) {
  const siguen = (silencios.get(chat) || []).filter((s) => !esDe(s, ids));
  if (siguen.length) silencios.set(chat, siguen);
  else silencios.delete(chat);
}
