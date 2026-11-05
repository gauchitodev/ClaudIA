// .naval: batalla naval between two from the group (lib/batalla-naval.js has the sea, the tables and the bets).
//   .naval        opens a table (the first), or sits you down against whoever is waiting (the second); in a game,
//                 shows it: both radars and whose turn it is
//   .naval 100    the same, for 100 UruCoins each: the second writes the amount too, and the winner takes both
//   .rendirse     you give up and the other wins (plugins/fun-rendirse.js, shared with the 4 en línea and blackjack)
//   .delnaval     drops the game (plugins/fun-naval-del.js)
// Each shot is a plain message with the cell (A1 to H8), one per turn, always alternating. One game per chat, kept in
// the database, so an update of the bot doesn't end it. Switched off with .juegos like the other games, and outside the
// group's game hours (.horariojuegos) none starts. Free, it pays nothing, like the 4 en línea; with a bet the pot is
// the two players' own coins, as in a duel, and it follows the casino's switches.
import { salaVigente, abrirMesa, sentarse, jugar, leerCasilla, nombreDeCasilla, textoEstado, textoJugadores, textoRadar, textoTurno, textoLimitesNaval, COLOR, LEYENDA, NAVAL } from "../lib/batalla-naval.js";
import { frenoDelCasino } from "../lib/casino.js";
import { marcarMensajeDeJuego, citaOtroJuego } from "../lib/mensajes-de-juego.js";
import { leerEntero } from "../lib/comandos.js";

const plugin = {};
plugin.cmd = ["naval", "batallanaval"];
plugin.juego = true;
plugin.conHorario = true;
plugin.onlyGroup = true;
// Its shots are plain messages: taken before any other game sees them (hooksEnOrden, load-functions.js).
plugin.jugadas = true;

const mencion = (id) => `@${String(id).split("@")[0]}`;

function textoMesa(sala) {
  if (!sala.apuesta) return `🚢 *Batalla naval*\n${mencion(sala.j1)} espera rival.\n\nPara jugar contra esa persona escribí .naval\nPara cancelar: .delnaval (se borra sola a los 10 minutos)`;
  return `🚢 *Batalla naval* por *${sala.apuesta} UruCoins* cada uno\n${mencion(sala.j1)} espera rival.\n\nPara jugar contra esa persona escribí .naval ${sala.apuesta} (ponés ${sala.apuesta}, y el que gana se lleva ${sala.apuesta * 2}).\nPara cancelar: .delnaval (si en 10 minutos no se sienta nadie, te los devuelvo)`;
}
const flota = () => NAVAL.FLOTA.map(([nombre, largo]) => `${nombre} (${largo})`).join(", ");
const textoInicio = (sala) => `🚢 *Batalla naval*\n${textoJugadores(sala)}\n\nYa ubiqué las dos flotas a escondidas: ${flota()}. Los barcos no se tocan entre sí. Cada turno es un tiro: escribí la casilla, por ejemplo B4.\n${LEYENDA}\n\n${textoTurno(sala)}`;

// Every message of the game goes out quoting the move, marked as the game's (lib/mensajes-de-juego.js): a reply to it
// is a shot or a word about the game, not a message for Claudia.
async function mandar(client, m, sala, texto) {
  const enviado = await client.sendMessage(m.chat, { text: texto, mentions: [sala.j1, sala.j2].filter(Boolean) }, { quoted: m });
  marcarMensajeDeJuego(enviado?.key?.id, m.chat, { juego: "naval" });
}

plugin.run = async (m, { client, text, chat }) => {
  try {
    // A bet is a whole number of UruCoins, written as people write it here (lib/comandos.js); nothing is a free game.
    const pedido = String(text || "").trim();
    const apuesta = pedido ? (leerEntero(pedido) ?? NaN) : null;
    if (Number.isNaN(apuesta)) return client.sendText(m.chat, `Para jugar por UruCoins: .naval 100 (${textoLimitesNaval()}). Sin nada, se juega por diversión.`, m);

    const sala = salaVigente(m.chat);
    if (sala?.estado === "JUGANDO") return await mandar(client, m, sala, textoEstado(sala));
    if (sala?.j1 === m.sender) return client.sendText(m.chat, "Ya estás esperando rival, esperá a que alguien se sume.", m);

    // With a bet, the casino's switches (.casino off, .horariojuegos, .monedas off) before charging anything; free,
    // the game goes on without them.
    if (apuesta !== null) {
      const freno = frenoDelCasino(m, chat);
      if (freno) return freno(client);
    }

    if (!sala) {
      const r = abrirMesa(m.chat, m.sender, apuesta);
      if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
      return client.sendMessage(m.chat, { text: textoMesa(r.sala), mentions: [m.sender] }, { quoted: m });
    }
    const r = sentarse(m.chat, m.sender, apuesta);
    if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
    return await mandar(client, m, r.sala, textoInicio(r.sala));
  } catch (e) {
    console.error("[naval] ERROR:", e);
  }
};

const FRASE = { agua: "🌊 *{casilla}*: agua.", tocado: "💥 *{casilla}*: ¡tocado!", hundido: "🚢 *{casilla}*: ¡hundido! Era {barco} de {rival}." };

// The shots are plain messages ("B4"), from whoever is playing and only on their turn. They're taken outside the game
// hours too: a game that started before closing time is played out.
plugin.before = async (m, { client, chat }) => {
  try {
    if (!m.text || !m.isGroup) return;
    const sala = salaVigente(m.chat);
    if (!sala || sala.estado !== "JUGANDO" || ![sala.j1, sala.j2].includes(m.sender)) return;
    if (chat && !chat.games) return;
    const casilla = leerCasilla(m.text);
    if (!casilla) return;
    // A message quoting another game's message is that game's (lib/mensajes-de-juego.js).
    if (citaOtroJuego(m, "naval")) return;
    // A player's cell is the game's, theirs to play or not: no other game takes it, and Claudia doesn't chat back.
    m.respuestaDeJuego = true;

    const numero = m.sender === sala.j1 ? 1 : 2;
    // The other's turn: ignored without a word, as in the 4 en línea, because it is just a cell in the chat.
    if (sala.turno !== numero) return;

    const r = jugar(m.chat, m.sender, casilla);
    if (!r.ok) return client.sendText(m.chat, r.error, m);
    const { tiro } = r;
    const rival = numero === 1 ? sala.j2 : sala.j1;
    const nombre = nombreDeCasilla(casilla);
    const barco = tiro.barco ? `${tiro.barco.articulo} ${tiro.barco.nombre}` : "";
    if (r.ganador) return await mandar(client, m, sala, `🏆 *${nombre}*: ¡hundido! Era ${barco} de ${mencion(rival)} y no le queda ningún barco: ${mencion(m.sender)} ${COLOR[numero]} ganó la batalla. 🎉${r.plata}\n\n${textoRadar(sala, numero)}`);
    const resultado = FRASE[tiro.resultado].replace("{casilla}", nombre).replace("{barco}", barco).replace("{rival}", mencion(rival));
    await mandar(client, m, sala, `${resultado}\n\n${textoRadar(sala, numero)}\n\n${textoTurno(sala)}`);
  } catch (e) {
    console.error("[naval] ERROR:", e);
  }
};

export default plugin;
