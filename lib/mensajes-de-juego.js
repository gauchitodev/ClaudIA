// The bot's messages that expect answers by quoting them: trivia questions, riddles, flags, words to unscramble, the
// hangman's board. A reply to one of them is a move in a game, not a message for Claudia, so _auto-ia leaves it alone.
// It used to take them as spoken to, with the game's question in its prompt: it chatted back to every answer, and
// sometimes confirmed or gave away the right one.
//
// In memory, with a cap: the games live in memory too, and their messages stop mattering once they end. Today's
// question (lib/pregunta-dia.js) is stored in the database and checked there instead.
const mensajes = new Set();
const MAX_MENSAJES = 500;

export function marcarMensajeDeJuego(id) {
  if (!id) return;
  mensajes.add(id);
  if (mensajes.size > MAX_MENSAJES) mensajes.delete(mensajes.values().next().value);
}

export const esMensajeDeJuego = (id) => Boolean(id) && mensajes.has(id);
