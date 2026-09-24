import { marcarMensajeDeJuego } from "./mensajes-de-juego.js";

// The short "reply to the question" games: .acertijo, .banderas and .ordenar. One per chat, 30 seconds, and the
// answer has to quote the question.
//
// Opening one used to check the chat, wait for the question to go out, and only then store the game. The question now
// waits its turn in the queue (lib/envios.js), and a second command in the meantime passed the check and started
// another game on top of the first. Then the first game's timer, which ended whatever game was in play, ended the
// second one, announcing the first one's answer.

// Opens a game in "juegos" (the plugin's own map, chat -> game). The game is stored BEFORE the question is sent,
// without a mensajeId, so the plugin's answer hook ignores it until the question is out; if sending fails, the chat
// is released. "alVencer" runs when time's up, and only if that same game is still the one in play. Returns false,
// without sending anything, when the chat already had a game.
export async function abrirJuego(juegos, chat, { juego, enviar, alVencer, ms = 30_000 }) {
  if (juegos[chat]) return false;
  juegos[chat] = juego;
  let mensaje;
  try {
    mensaje = await enviar();
  } catch (e) {
    if (juegos[chat] === juego) delete juegos[chat];
    throw e;
  }
  juego.mensajeId = mensaje?.key?.id ?? null;
  marcarMensajeDeJuego(juego.mensajeId, chat); // the answers quote it: they aren't messages for Claudia
  juego.timeout = setTimeout(() => {
    if (juegos[chat] !== juego) return;
    delete juegos[chat];
    alVencer();
  }, ms);
  return true;
}
