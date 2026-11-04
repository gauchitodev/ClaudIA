import { marcarMensajeDeJuego, citaOtroJuego } from "../lib/mensajes-de-juego.js";

// The tic-tac-toe's moves: a plain number from 1 to 9, or a word to give up, from whoever plays in the chat's room.
// One message, one game (plugin.jugadas, hooksEnOrden in load-functions.js): what it takes it marks
// (m.respuestaDeJuego), so no other game takes it and Claudia doesn't chat back, and its boards are game messages.
const plugin = (m) => m;
plugin.jugadas = true;

const RENDIRSE = /^(rendirse|rendirme|salir|out|surr?ender|(me)?nyerah)$/i;
const FICHAS = { X: "❎", O: "⭕", 1: "1️⃣", 2: "2️⃣", 3: "3️⃣", 4: "4️⃣", 5: "5️⃣", 6: "6️⃣", 7: "7️⃣", 8: "8️⃣", 9: "9️⃣" };

plugin.before = async (m, { client }) => {
  if (!m.isGroup || !m.text) return;
  client.game = client.game ? client.game : {};
  // Only the room of this chat: a number written in another group, or in private, used to count as a move, and moved
  // the room over there. Both players sit in the same chat since .ttt joins only rooms waiting in it.
  const room = Object.values(client.game).find((r) => r.id?.startsWith("tictactoe") && r.game && r.state === "PLAYING" && (r.x === m.chat || r.o === m.chat) && [r.game.playerX, r.game.playerO].includes(m.sender));
  if (!room) return;
  // A message quoting another game's message is that game's (lib/mensajes-de-juego.js): a "9" quoting the trivia.
  if (citaOtroJuego(m, "ttt")) return;
  const texto = m.text.trim();
  const isSurrender = RENDIRSE.test(texto);
  if (!isSurrender && !/^[1-9]$/.test(texto)) return;
  // A player's number is the board's even when it isn't their turn: not a move, but no other game's answer either.
  m.respuestaDeJuego = true;
  if (m.sender !== room.game.currentTurn && !isSurrender) return;

  let ok;
  let isWin = false;
  let isTie = false;
  if (!isSurrender && 1 > (ok = room.game.turn(m.sender === room.game.playerO, parseInt(texto, 10) - 1))) {
    await client.sendText(m.chat, { "-3": "El juego ha terminado", "-2": "Inválido", "-1": "Posición inválida", 0: "Posición inválida" }[ok], m);
    return;
  }
  if (m.sender === room.game.winner) isWin = true;
  else if (room.game.board === 511) isTie = true;
  const arr = room.game.render().map((v) => FICHAS[v]);
  if (isSurrender) {
    room.game.oTurn = m.sender === room.game.playerX;
    isWin = true;
  }

  const str = `
🫂 𝙅𝙐𝙂𝘼𝘿𝙊𝙍𝙀𝙎 *:*
*┈┈┈┈┈┈┈┈┈*
❎ = @${room.game.playerX.split("@")[0]}
⭕ = @${room.game.playerO.split("@")[0]}
*┈┈┈┈┈┈┈┈┈*
     ${arr.slice(0, 3).join("")}
     ${arr.slice(3, 6).join("")}
     ${arr.slice(6).join("")}
*┈┈┈┈┈┈┈┈┈*
${isWin ? `@${(isSurrender ? room.game.currentTurn : room.game.winner).split("@")[0]} 😎🏆 *GANASTE!!*` : isTie ? `*EMPATE!!🙄🤨*` : `🪄 *TURNO DE* @${room.game.currentTurn.split("@")[0]}`}
`.trim();
  // A reply to the board is a move, not a message for Claudia (lib/mensajes-de-juego.js).
  const enviado = await client.sendMessage(m.chat, { text: str, mentions: client.parseMention(str) }, { quoted: m });
  marcarMensajeDeJuego(enviado?.key?.id, m.chat, { juego: "ttt" });

  if (isTie || isWin) delete client.game[room.id];
};
export default plugin;
