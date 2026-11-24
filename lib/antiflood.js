// The anti-flood (.antiflood, plugins/_antiflood.js): who sent too many messages in a row in a group, and what comes of
// it. Nothing is deleted: the bot's deletions go out at once, with no pace (lib/envios.js), and deleting a flood would
// be answering a burst with a burst from the number. A ladder instead, a single message of the bot's at each step: the
// first time, a notice asking them to slow down; over the limit again within MEMORIA_MS, a warning like .advertir's,
// which on the third removes them (lib/advertencias.js); after that long without another, it's a notice again.
//
// The clock is the one the messages carry (when each was sent), handed in by whoever calls: after a reconnection a
// minute of chat arrives in the same instant, and by the time of arrival every busy group was flooding.

export const ANTIFLOOD = {
  MENSAJES: 8, // this many messages...
  VENTANA_MS: 10 * 1000, // ...within this long are a flood. The same in every group.
  MEMORIA_MS: 10 * 60 * 1000, // how long a notice or a warning stands: over the limit again within it is a warning
  TRAS_EXPULSION_MS: 60 * 1000, // once removed, what they sent until this long after isn't counted: it was on its way
  BARRIDO_MS: 60 * 1000, // how often whoever has nothing left to remember leaves the memory
};

// "chat person" -> { recientes, dicho, antes, enCurso, fueraHasta, visto }
//   recientes: [{ t, como }], what they sent within the window: when, and what it counts as (its id, or its album's)
//   dicho: when they were last told (the notice or a warning), or null; antes: the one before, to go back to
//   enCurso: a step is on its way out, and nothing of theirs counts meanwhile
//   fueraHasta: removed, nothing of theirs counts until then; visto: their last message counted
// In a lib and not in the plugin: saving the plugin's file reloads it (load-functions.js), and the count would start
// over in the middle of a burst.
const personas = new Map();
let barrido = 0;

// For the tests.
export function reiniciarAntiflood() {
  personas.clear();
  barrido = 0;
}
export const personasEnMemoria = () => personas.size;

// The limit as the texts say it: the notice, the warning's reason, .config.
export const limiteEnPalabras = () => `${ANTIFLOOD.MENSAJES} mensajes en ${ANTIFLOOD.VENTANA_MS / 1000} segundos`;
export const avisoDeFlood = (quien) => `🌊 @${quien.split("@")[0]}, aflojá un poco: mandaste ${limiteEnPalabras()} y así no se puede seguir la charla. No borro nada, pero si seguís así lo próximo es una advertencia.`;
export const motivoDeFlood = () => `flood: ${limiteEnPalabras()}, después del aviso`;

// MEDIA_ALBUM (WAProto, MessageAssociation.AssociationType): a number as Baileys decodes it, its name once it has been
// through JSON.
const ALBUM = new Set([1, "MEDIA_ALBUM"]);

// What a message is a piece of, read off its content (message.message): { de, album }, the id of the message it
// belongs to and whether that's an album, or null for a message of its own. An album is its cover (albumMessage) and
// then each photo or video as a message that points at it; the HD copy of a photo points at the photo. Both in
// messageContextInfo.messageAssociation, the message's own or the one inside what wraps it (ephemeralMessage,
// associatedChildMessage and the like, all { message }). Never what it quotes: that's in a contextInfo, which this
// doesn't go into.
export function piezaDe(mensaje, nivel = 0) {
  if (!mensaje || typeof mensaje !== "object" || nivel > 5) return null;
  const asociacion = mensaje.messageContextInfo?.messageAssociation;
  const de = asociacion?.parentMessageKey?.id;
  if (de) return { de, album: ALBUM.has(asociacion.associationType) };
  for (const valor of Object.values(mensaje)) {
    const dentro = valor && typeof valor === "object" ? piezaDe(valor.message, nivel + 1) : null;
    if (dentro) return dentro;
  }
  return null;
}

// One more message from someone in a group, sent at "cuando": null, or the step it brings, "aviso" or "advertencia".
// id: the message's; pieza: what piezaDe said of it.
// With no await in it: what it decides and the mark it leaves (enCurso) are one thing, so two messages handled at once
// can't both be the eighth. Whoever gets a step closes it with cerrarPaso once it went out.
export function contarMensaje(chat, persona, { id = null, pieza = null } = {}, cuando = Date.now()) {
  barrer(cuando);
  // A piece of something that isn't an album (the HD copy of a photo) is no message of its own: the chat shows one.
  if (pieza && !pieza.album) return null;
  const clave = `${chat} ${persona}`;
  const e = personas.get(clave) || { recientes: [], dicho: null, antes: null, enCurso: false, fueraHasta: 0, visto: cuando };
  // With a step on its way, nothing counts: the rest of the burst that brought it isn't another step, and the next one
  // takes a whole limit again, sent after they were told.
  if (e.enCurso || cuando < e.fueraHasta) return null;
  // An album counts as one, under its cover's id, which is what each of its photos points at: whichever comes first
  // takes the place, and the rest find it taken.
  const como = pieza?.de || id;
  // The window ends at the newest message seen, not at this one: handlers of the same chat can overtake each other, and
  // an older message arriving later still belongs to the same ten seconds. One older than the window is too late.
  const fin = Math.max(cuando, ...e.recientes.map((x) => x.t));
  e.recientes = e.recientes.filter((x) => fin - x.t < ANTIFLOOD.VENTANA_MS);
  if (fin - cuando >= ANTIFLOOD.VENTANA_MS) return null;
  if (como && e.recientes.some((x) => x.como === como)) return null; // the same album, or the same message twice
  e.recientes.push({ t: cuando, como });
  e.visto = fin;
  personas.set(clave, e);
  if (e.recientes.length < ANTIFLOOD.MENSAJES) return null;
  const paso = e.dicho !== null && fin - e.dicho < ANTIFLOOD.MEMORIA_MS ? "advertencia" : "aviso";
  Object.assign(e, { antes: e.dicho, dicho: fin, recientes: [], enCurso: true });
  return paso;
}

// The step contarMensaje gave went out, or didn't. fallo: it couldn't be sent, so they weren't told, and the next time
// is whatever this one would have been. expulsado: it was the warning that removed them, and what they had sent before
// leaving still arrives for a while.
export function cerrarPaso(chat, persona, { expulsado = false, fallo = false } = {}) {
  const e = personas.get(`${chat} ${persona}`);
  if (!e?.enCurso) return;
  e.enCurso = false;
  if (fallo) e.dicho = e.antes;
  if (expulsado) e.fueraHasta = e.dicho + ANTIFLOOD.TRAS_EXPULSION_MS;
}

// Whoever has nothing left to remember goes: who only chatted, a window after their last message; who was told, once
// that no longer stands. Every BARRIDO_MS at most, and by the messages' clock like everything else here. It also lets
// go of a step that never closed (a send that never came back), so nobody stays uncounted for good.
function barrer(cuando) {
  if (Math.abs(cuando - barrido) < ANTIFLOOD.BARRIDO_MS) return;
  barrido = cuando;
  for (const [clave, e] of personas) {
    const sinAviso = e.dicho === null || cuando - e.dicho >= ANTIFLOOD.MEMORIA_MS;
    if (sinAviso && cuando - e.visto >= ANTIFLOOD.VENTANA_MS) personas.delete(clave);
  }
}
