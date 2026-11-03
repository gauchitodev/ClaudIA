// .4enlinea: 4 en línea between two people from the group (lib/cuatro-en-linea.js has the board and the rooms).
//   .4enlinea      opens a table (the first), or sits you down against whoever is waiting (the second)
//   .rendir        you give up and the other wins
//   .del4enlinea   drops the game (the ones playing it, or an admin)
// Each move is a plain message with the column number (1 to 7). One room per chat, dropped after 10 minutes without
// moves. Switched off with .juegos like the other games. No UruCoins, like the tic-tac-toe: two who agree can play a
// game out in 7 moves, over and over.
import { salas, salaVigente, soltar, dibujar, tableroVacio, FICHA } from "../lib/cuatro-en-linea.js";
import { marcarMensajeDeJuego } from "../lib/mensajes-de-juego.js";

const plugin = {};
plugin.cmd = ["4enlinea", "4enlínea", "del4enlinea", "rendir"];
plugin.juego = true;
plugin.onlyGroup = true;

const mencion = (id) => `@${String(id).split("@")[0]}`;

const turnoDe = (sala) => `Turno de ${mencion(sala.turno === 1 ? sala.j1 : sala.j2)} ${FICHA[sala.turno]}\nEscribí un número del 1 al 7. Para abandonar: .rendir`;

// The board goes out quoting the move. A reply to it is a move, or a word about the game, and not a message for Claudia
// (lib/mensajes-de-juego.js): otherwise a number from the one whose turn it isn't, quoting it, gets her chatting back.
async function mandar(client, m, sala, linea, ganadoras = []) {
  const jugadores = `${FICHA[1]} ${mencion(sala.j1)}  vs  ${FICHA[2]} ${mencion(sala.j2)}`;
  const enviado = await client.sendMessage(m.chat, { text: `${jugadores}\n\n${dibujar(sala.tablero, ganadoras)}\n\n${linea}`, mentions: [sala.j1, sala.j2] }, { quoted: m });
  marcarMensajeDeJuego(enviado?.key?.id, m.chat);
}

plugin.run = async (m, { client, command, isAdmin }) => {
  try {
    const sala = salaVigente(m.chat);
    const juega = Boolean(sala && (sala.j1 === m.sender || sala.j2 === m.sender));

    if (command === "del4enlinea") {
      if (!sala) return client.sendText(m.chat, "No hay ninguna partida de 4 en línea en este grupo.", m);
      // isAdmin counts the owner too (permisosDe, lib/roles.js).
      if (!juega && !isAdmin) return client.sendText(m.chat, "Solo los que juegan o un admin pueden cancelar la partida.", m);
      salas.delete(m.chat);
      return client.sendText(m.chat, "Partida de 4 en línea cancelada.", m);
    }

    if (command === "rendir") {
      if (!juega) return client.sendText(m.chat, "No estás jugando al 4 en línea.", m);
      if (sala.estado !== "JUGANDO") return client.sendText(m.chat, "Todavía no empezó: si querés dejar la mesa, usá .del4enlinea.", m);
      salas.delete(m.chat);
      const rival = sala.j1 === m.sender ? sala.j2 : sala.j1;
      return client.sendMessage(m.chat, { text: `🏳️ ${mencion(m.sender)} se rindió. ¡Ganó ${mencion(rival)}! 🎉`, mentions: [m.sender, rival] }, { quoted: m });
    }

    // The tic-tac-toe takes the same plain numbers as moves, so nobody plays both at once (.ttt asks the same).
    const juegaTTT = Object.values(client.game || {}).some((room) => room.id?.startsWith("tictactoe") && room.game && [room.game.playerX, room.game.playerO].includes(m.sender));
    if (juegaTTT) return client.sendText(m.chat, "Estás jugando al ta-te-ti: terminá esa partida primero.", m);

    if (!sala) {
      salas.set(m.chat, { j1: m.sender, j2: "", estado: "ESPERANDO", tablero: tableroVacio(), turno: 1, ultimo: Date.now() });
      return client.sendMessage(m.chat, { text: `🔴 *4 en línea*\n${mencion(m.sender)} espera rival.\n\nPara jugar contra esa persona escribí .4enlinea\nPara cancelar: .del4enlinea (se borra sola a los 10 minutos)`, mentions: [m.sender] }, { quoted: m });
    }
    if (sala.estado === "ESPERANDO") {
      if (sala.j1 === m.sender) return client.sendText(m.chat, "Ya estás esperando rival, esperá a que alguien se sume.", m);
      sala.j2 = m.sender;
      sala.estado = "JUGANDO";
      sala.ultimo = Date.now();
      return await mandar(client, m, sala, turnoDe(sala));
    }
    return client.sendMessage(m.chat, { text: `Ya hay una partida en este grupo: ${mencion(sala.j1)} vs ${mencion(sala.j2)}. Esperá a que termine.`, mentions: [sala.j1, sala.j2] }, { quoted: m });
  } catch (e) {
    console.error("[4enlinea] ERROR:", e);
  }
};

// The moves are plain messages ("4" drops a disc in column 4), from whoever is playing and only on their turn.
plugin.before = async (m, { client, chat }) => {
  try {
    if (!m.text || !m.isGroup) return;
    const sala = salaVigente(m.chat);
    if (!sala || sala.estado !== "JUGANDO" || ![sala.j1, sala.j2].includes(m.sender)) return;
    if (chat && !chat.games) return;
    const texto = m.text.trim();
    if (!/^[1-7]$/.test(texto)) return;

    const ficha = m.sender === sala.j1 ? 1 : 2;
    // The other's turn: ignored without a word, as in the tic-tac-toe, because it is just a number in the chat.
    if (sala.turno !== ficha) return;
    m.respuestaDeJuego = true;

    const jugada = soltar(sala.tablero, parseInt(texto, 10) - 1, ficha);
    if (!jugada.ok) return client.sendText(m.chat, "Esa columna está llena, probá con otra.", m);
    sala.ultimo = Date.now();

    if (jugada.ganador) {
      salas.delete(m.chat);
      return await mandar(client, m, sala, `🏆 ¡Ganó ${mencion(m.sender)} ${FICHA[ficha]}! 🎉`, jugada.celdas);
    }
    if (jugada.empate) {
      salas.delete(m.chat);
      return await mandar(client, m, sala, "🤝 ¡Empate! El tablero se llenó.");
    }
    sala.turno = ficha === 1 ? 2 : 1;
    await mandar(client, m, sala, turnoDe(sala));
  } catch (e) {
    console.error("[4enlinea] ERROR:", e);
  }
};

export default plugin;
