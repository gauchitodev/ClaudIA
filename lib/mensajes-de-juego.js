// The bot's messages that expect answers by quoting them: trivia questions, riddles, flags, words to unscramble, the
// hangman's board. A reply to one of them is a move in a game, not a message for Claudia, so _auto-ia leaves it alone.
// It used to take them as spoken to, with the game's question in its prompt: it chatted back to every answer, and
// sometimes confirmed or gave away the right one.
//
// In memory, with a cap: the games live in memory too, and their messages stop mattering once they end. Today's
// question (lib/pregunta-dia.js) is stored in the database and checked there instead.
const mensajes = new Set();
const MAX_MENSAJES = 500;
// When a game message last went out in each chat: while a game is on, Claudia's initiative stays out (lib/tacto.js).
const ultimoJuego = new Map();

export function marcarMensajeDeJuego(id, chat = null, ahora = Date.now()) {
  if (chat) ultimoJuego.set(chat, ahora);
  if (!id) return;
  mensajes.add(id);
  if (mensajes.size > MAX_MENSAJES) mensajes.delete(mensajes.values().next().value);
}

export const esMensajeDeJuego = (id) => Boolean(id) && mensajes.has(id);

// Did a game message go out in this chat in the last "ventanaMs"?
export function juegoRecienteEn(chat, ahora = Date.now(), ventanaMs = 5 * 60 * 1000) {
  const cuando = ultimoJuego.get(chat);
  return cuando !== undefined && ahora >= cuando && ahora - cuando < ventanaMs;
}
