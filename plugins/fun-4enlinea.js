// .4enlinea: 4 en línea between two from the group (lib/cuatro-en-linea.js has the board, the rooms and the bets).
//   .4enlinea       opens a table (the first), or sits you down against whoever is waiting (the second)
//   .4enlinea 100   the same, for 100 UruCoins each: the second writes the amount too, and the winner takes both
//   .rendirse       you give up and the other wins (plugins/fun-rendirse.js, shared with the blackjack)
//   .del4enlinea    drops the game (plugins/fun-4enlinea-del.js)
// Each move is a plain message with the column number (1 to 7). One room per chat. Switched off with .juegos like the
// other games, and outside the group's game hours (.horariojuegos) none starts. Free, it pays nothing, like the
// tic-tac-toe: two who agree can play a game out in 7 moves, over and over. With a bet the pot is the two players' own
// coins, as in a duel, and it follows the casino's switches.
import { salaVigente, abrirMesa, sentarse, anotarJugada, terminar, soltar, dibujar, FICHA, textoLimitesCuatroEnLinea } from "../lib/cuatro-en-linea.js";
import { frenoDelCasino } from "../lib/casino.js";
import { marcarMensajeDeJuego, citaOtroJuego } from "../lib/mensajes-de-juego.js";
import { leerEntero } from "../lib/comandos.js";

const plugin = {};
plugin.cmd = ["4enlinea"];
plugin.juego = true;
plugin.conHorario = true;
plugin.onlyGroup = true;
// Its moves are plain messages: taken before any other game sees them (hooksEnOrden, load-functions.js).
plugin.jugadas = true;

const mencion = (id) => `@${String(id).split("@")[0]}`;

const turnoDe = (sala) => `Turno de ${mencion(sala.turno === 1 ? sala.j1 : sala.j2)} ${FICHA[sala.turno]}\nEscribí un número del 1 al 7. Para abandonar: .rendirse`;

function textoMesa(sala) {
  if (!sala.apuesta) return `🔴 *4 en línea*\n${mencion(sala.j1)} espera rival.\n\nPara jugar contra esa persona escribí .4enlinea\nPara cancelar: .del4enlinea (se borra sola a los 10 minutos)`;
  return `🔴 *4 en línea* por *${sala.apuesta} UruCoins* cada uno\n${mencion(sala.j1)} espera rival.\n\nPara jugar contra esa persona escribí .4enlinea ${sala.apuesta} (ponés ${sala.apuesta}, y el que gana se lleva ${sala.apuesta * 2}).\nPara cancelar: .del4enlinea (si en 10 minutos no se sienta nadie, te los devuelvo)`;
}

// The board goes out quoting the move. A reply to it is a move, or a word about the game, and not a message for Claudia
// (lib/mensajes-de-juego.js): otherwise a number from the one whose turn it isn't, quoting it, gets her chatting back.
async function mandar(client, m, sala, linea, ganadoras = []) {
  const jugadores = `${FICHA[1]} ${mencion(sala.j1)}  vs  ${FICHA[2]} ${mencion(sala.j2)}${sala.apuesta ? `\n💰 ${sala.apuesta * 2} UruCoins en juego` : ""}`;
  const enviado = await client.sendMessage(m.chat, { text: `${jugadores}\n\n${dibujar(sala.tablero, ganadoras)}\n\n${linea}`, mentions: [sala.j1, sala.j2] }, { quoted: m });
  marcarMensajeDeJuego(enviado?.key?.id, m.chat, { juego: "4enlinea" });
}

plugin.run = async (m, { client, text, chat }) => {
  try {
    // A bet is a whole number of UruCoins; nothing is a free game.
    const pedido = String(text || "").trim();
    // Written as people write it here (lib/comandos.js): "1.000" is a thousand.
    const apuesta = pedido ? (leerEntero(pedido) ?? NaN) : null;
    if (Number.isNaN(apuesta)) return client.sendText(m.chat, `Para jugar por UruCoins: .4enlinea 100 (${textoLimitesCuatroEnLinea()}). Sin nada, se juega por diversión.`, m);

    // The tic-tac-toe takes the same plain numbers as moves, so nobody plays both at once (.ttt asks the same).
    const juegaTTT = Object.values(client.game || {}).some((room) => room.id?.startsWith("tictactoe") && room.game && [room.game.playerX, room.game.playerO].includes(m.sender));
    if (juegaTTT) return client.sendText(m.chat, "Estás jugando al ta-te-ti: terminá esa partida primero.", m);

    const sala = salaVigente(m.chat);
    if (sala?.estado === "JUGANDO") return client.sendMessage(m.chat, { text: `Ya hay una partida en este grupo: ${mencion(sala.j1)} vs ${mencion(sala.j2)}. Esperá a que termine.`, mentions: [sala.j1, sala.j2] }, { quoted: m });
    if (sala?.j1 === m.sender) return client.sendText(m.chat, "Ya estás esperando rival, esperá a que alguien se sume.", m);

    // With a bet, the casino's switches (.casino off, .horariojuegos, .monedas off) before charging anything; free,
    // the game goes on without them.
    if (apuesta !== null) {
      const freno = frenoDelCasino(m, chat);
      if (freno) return freno(client);
    }

    if (!sala) {
      const avisar = (texto, mentions) => client.sendMessage(m.chat, { text: texto, mentions });
      const r = abrirMesa(m.chat, m.sender, apuesta, avisar);
      if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
      return client.sendMessage(m.chat, { text: textoMesa(r.sala), mentions: [m.sender] }, { quoted: m });
    }
    const r = sentarse(m.chat, m.sender, apuesta);
    if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
    return await mandar(client, m, r.sala, turnoDe(r.sala));
  } catch (e) {
    console.error("[4enlinea] ERROR:", e);
  }
};

// The moves are plain messages ("4" drops a disc in column 4), from whoever is playing and only on their turn. They're
// taken outside the game hours too: a game that started before closing time is played out.
plugin.before = async (m, { client, chat }) => {
  try {
    if (!m.text || !m.isGroup) return;
    const sala = salaVigente(m.chat);
    if (!sala || sala.estado !== "JUGANDO" || ![sala.j1, sala.j2].includes(m.sender)) return;
    if (chat && !chat.games) return;
    const texto = m.text.trim();
    if (!/^[1-7]$/.test(texto)) return;
    // A message quoting another game's message is that game's (lib/mensajes-de-juego.js): a "7" quoting the trivia.
    if (citaOtroJuego(m, "4enlinea")) return;
    // A player's number is the board's, theirs to play or not: no other game takes it (a trivia with numbers for
    // options), and Claudia doesn't chat back.
    m.respuestaDeJuego = true;

    const ficha = m.sender === sala.j1 ? 1 : 2;
    // The other's turn: ignored without a word, as in the tic-tac-toe, because it is just a number in the chat.
    if (sala.turno !== ficha) return;

    const jugada = soltar(sala.tablero, parseInt(texto, 10) - 1, ficha);
    if (!jugada.ok) return client.sendText(m.chat, "Esa columna está llena, probá con otra.", m);

    if (jugada.ganador) {
      const plata = terminar(m.chat, m.sender);
      return await mandar(client, m, sala, `🏆 ¡Ganó ${mencion(m.sender)} ${FICHA[ficha]}! 🎉${plata}`, jugada.celdas);
    }
    if (jugada.empate) {
      const plata = terminar(m.chat, null);
      return await mandar(client, m, sala, `🤝 ¡Empate! El tablero se llenó.${plata}`);
    }
    sala.turno = ficha === 1 ? 2 : 1;
    anotarJugada(sala);
    await mandar(client, m, sala, turnoDe(sala));
  } catch (e) {
    console.error("[4enlinea] ERROR:", e);
  }
};

export default plugin;
