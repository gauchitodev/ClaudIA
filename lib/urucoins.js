// UruCoins: the group economy's rules, the registry of active games and betting.
import { ganarCoins, getSaldoCoins, coinsGanadasHoy, movimientosHoy, sumarReaccionEntradaHashtag, getChat } from "../database-functions.js";
import { multiplicador, usarVotoDoble } from "./tienda.js";

// Every number of the economy in one place, so they can be tuned without hunting through the code.
export const COINS = {
  REACCION_EMITIDA: 1,
  REACCION_RECIBIDA: 2,
  TOPE_REACCIONES_DIA: 0, // daily cap on coins from reactions (given + received). 0 = no cap.
  HASHTAG: 5,
  TOPE_HASHTAG_SEMANA: 3, // most rewarded entries per hashtag per week
  JUEGO_GANADO: 10,
  HISTORIA_SEMANA: 25,
  GANADOR_MES: 50,
  SALTAR_COOLDOWN: 15,
  APUESTA_MIN: 5,
  // Maximum per bet: each game's fixed cap, or this percentage of the person's balance, whichever is larger.
  APUESTA_MAX_PORCENTAJE: 20,
  // Casino (roulette and slots): the house wins a little in the long run; caps per play and per day so nobody goes broke.
  CASINO_APUESTA_MAX: 100,
  // One-on-one duels: each puts up the same and the winner takes it all (the house takes nothing).
  DUELO_APUESTA_MAX: 100,
  CASINO_TOPE_DIA: 0,
  // Weekly lottery: the pot is the sum of the tickets; BONUS is what the house adds on top (0 = pure redistribution).
  LOTERIA_PRECIO: 10,
  LOTERIA_MAX_BOLETOS: 5,
  LOTERIA_BONUS: 0,
  // Betting markets on events: per-person cap in each market, maximum options and days to enter the outcome.
  MERCADO_APUESTA_MAX: 100,
  MERCADO_MAX_OPCIONES: 6,
  MERCADO_DIAS_PARA_RESOLVER: 7,
  // Activity: the daily question (for answering it), lightning trivia (first correct answer) and the daily streak
  // (for writing at least RACHA_MENSAJES_DIA messages of two words or more; the prize grows with consecutive days).
  PREGUNTA_DIA: 3,
  TRIVIA_RELAMPAGO: 15,
  RACHA_BASE: 3,
  RACHA_MAX: 10,
  RACHA_MENSAJES_DIA: 3,
};

// Is the economy on in this chat? It's turned off per group with .monedas or .modo compraventa. With no row, or in
// a private chat, it counts as on. The UruCoins commands are stopped by handle-message (plugin.economia); this is
// for the passive sources: reactions, streaks, hashtags, games, closings and promotions.
export function monedasActivas(chat) {
  const c = getChat(chat);
  return !c || c.monedas !== 0;
}

// ---------- Reaction earnings (with a daily cap) ----------
// With the double streak you earn twice as much and the daily cap doubles too (otherwise the item would be useless).
export function otorgarPorReaccion(chat, autorLid, reactorLid, messageId) {
  const multAutor = multiplicador(chat, autorLid);
  const multReactor = multiplicador(chat, reactorLid);

  // with TOPE_REACCIONES_DIA at 0 there is no limit; above 0 it's enforced (and the double streak doubles it)
  const dentroDelTope = (lid, gana, mult) => COINS.TOPE_REACCIONES_DIA <= 0 || coinsGanadasHoy(chat, lid, "reaccion_") + gana <= COINS.TOPE_REACCIONES_DIA * mult;

  // with the economy off the reaction still counts as a hashtag vote, but hands out no coins
  const pagar = monedasActivas(chat);

  const ganaAutor = COINS.REACCION_RECIBIDA * multAutor;
  if (pagar && dentroDelTope(autorLid, ganaAutor, multAutor)) ganarCoins(chat, autorLid, ganaAutor, "reaccion_recibida");

  const ganaReactor = COINS.REACCION_EMITIDA * multReactor;
  if (pagar && dentroDelTope(reactorLid, ganaReactor, multReactor)) ganarCoins(chat, reactorLid, ganaReactor, "reaccion_emitida");

  // If the message was a hashtag entry, it adds a vote. With a stored double vote, it adds two and consumes it.
  const eraEntrada = sumarReaccionEntradaHashtag(chat, messageId, 1);
  if (eraEntrada && usarVotoDoble(chat, reactorLid)) {
    sumarReaccionEntradaHashtag(chat, messageId, 1);
  }
}

// ---------- Prizes for winning games ----------
// The group games (trivia, riddles, flags, unscramble) pay whoever gets it first. The hangman is played alone and, with
// its word list at hand, won almost every time: at 10 coins a game it was an open tap, so it pays a few games a day and
// then goes on without a prize. A capped game records its prize under a reason of its own, which is what gets counted.
// There are no bets on games any more: .apostar let people bet after seeing the question (or with one hangman letter to
// go) and double their whole balance. Betting is the casino's, with its caps.
export const PREMIOS_POR_DIA = { ahorcado: { partidas: 5, motivo: "juego_ganado_ahorcado" } };

// Pays a game's winner (nothing with the economy off) and returns a line to append to its final message ("" when
// there is nothing to say). "opciones.nombre" is the game, which is what the daily cap goes by.
export function juegoTerminado(chat, ganador, opciones = {}) {
  if (!ganador || !monedasActivas(chat)) return "";
  const nombre = opciones?.nombre ?? null;
  const tope = PREMIOS_POR_DIA[nombre];
  if (tope && movimientosHoy(chat, ganador, tope.motivo) >= tope.partidas) {
    return `\n\n🪙 Ya cobraste los ${tope.partidas} premios de ${nombre} de hoy: esta va sin premio. Mañana, de nuevo.`;
  }
  const mult = multiplicador(chat, ganador);
  ganarCoins(chat, ganador, COINS.JUEGO_GANADO * mult, tope?.motivo || "juego_ganado");
  return `\n\n🪙 +${COINS.JUEGO_GANADO * mult} UruCoins por ganar${mult > 1 ? " (racha doble 🔥)" : ""}.`;
}

// Most a person can bet: the game's fixed cap, or the percentage of their balance, whichever is larger.
export function apuestaMaxima(chat, usuario, base) {
  return Math.max(base, Math.floor((getSaldoCoins(chat, usuario) * COINS.APUESTA_MAX_PORCENTAJE) / 100));
}
export const textoApuestaMaxima = (base) => `${base} o el ${COINS.APUESTA_MAX_PORCENTAJE} % de tu saldo, lo que sea mayor`;
