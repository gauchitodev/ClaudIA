// The bot's messages that expect answers by quoting them: trivia questions, riddles, flags, words to unscramble, the
// hangman's board, the boards of the tic-tac-toe and the 4 en línea. A reply to one of them is a move in a game, not a
// message for Claudia, so _auto-ia leaves it alone. It used to take them as spoken to, with the game's question in its
// prompt: it chatted back to every answer, and sometimes confirmed or gave away the right one.
//
// Each one with the game it belongs to (juegoDelMensaje): a message quoting one of them is that game's, and the games
// played with plain messages (the boards, the hangman) leave it alone. A "7" quoting the trivia is an answer, not a
// column.
//
// In memory, with a cap: the games live in memory too, and their messages stop mattering once they end. Today's
// question (lib/pregunta-dia.js) is stored in the database and checked there instead.
const mensajes = new Map(); // id -> game
const MAX_MENSAJES = 500;
// When a game message last went out in each chat: while a game is on, Claudia's initiative stays out (lib/tacto.js).
const ultimoJuego = new Map();

export function marcarMensajeDeJuego(id, chat = null, { juego = "juego", ahora = Date.now() } = {}) {
  if (chat) ultimoJuego.set(chat, ahora);
  if (!id) return;
  mensajes.set(id, juego);
  if (mensajes.size > MAX_MENSAJES) mensajes.delete(mensajes.keys().next().value);
}

export const esMensajeDeJuego = (id) => Boolean(id) && mensajes.has(id);

// The game a bot's message belongs to ("trivia", "ahorcado", "4enlinea", "ttt"…), or null if it isn't a game's.
export const juegoDelMensaje = (id) => (id && mensajes.get(id)) || null;

// Whether a message quotes another game's message than "juego": then it's that one's, whatever it says.
export function citaOtroJuego(m, juego) {
  const deQuien = juegoDelMensaje(m?.quoted?.id);
  return Boolean(deQuien) && deQuien !== juego;
}

// Did a game message go out in this chat in the last "ventanaMs"?
export function juegoRecienteEn(chat, ahora = Date.now(), ventanaMs = 5 * 60 * 1000) {
  const cuando = ultimoJuego.get(chat);
  return cuando !== undefined && ahora >= cuando && ahora - cuando < ventanaMs;
}
