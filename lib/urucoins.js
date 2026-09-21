// UruCoins: the group economy's rules, the registry of active games and betting.
import { ganarCoins, gastarCoins, getSaldoCoins, coinsGanadasHoy, sumarReaccionEntradaHashtag, getChat } from "../database-functions.js";
import { multiplicador, protegerApuesta, usarVotoDoble } from "./tienda.js";

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

// ---------- Registry of active games and bets ----------
// key: "<chat>|chat" for whole-group games, "<chat>|<jugador>" for individual ones.
const juegosActivos = new Map();
const clave = (chat, jugador) => `${chat}|${jugador || "chat"}`;

export function juegoIniciado(chat, nombre, jugador = null) {
  juegosActivos.set(clave(chat, jugador), { nombre, apuestas: new Map() });
}

// Closes the game, pays out bets and hands the winner their prize. Returns a line to append to the game's final
// message ("" when there is nothing to say).
export function juegoTerminado(chat, ganador, jugador = null) {
  const k = clave(chat, jugador);
  const juego = juegosActivos.get(k);
  juegosActivos.delete(k);

  const lineas = [];
  if (ganador && monedasActivas(chat)) {
    const mult = multiplicador(chat, ganador);
    ganarCoins(chat, ganador, COINS.JUEGO_GANADO * mult, "juego_ganado");
    lineas.push(`🪙 +${COINS.JUEGO_GANADO * mult} UruCoins por ganar${mult > 1 ? " (racha doble 🔥)" : ""}.`);
  }

  if (juego && juego.apuestas.size > 0) {
    let perdidas = 0;
    let coinsPerdidas = 0;
    let escudos = 0;
    let coinsDevueltas = 0;
    for (const [usuario, cantidad] of juego.apuestas) {
      if (ganador && usuario === ganador) {
        ganarCoins(chat, usuario, cantidad * 2, "apuesta_ganada");
        lineas.push(`🎰 Apuesta ganada: cobraste ${cantidad * 2} UruCoins.`);
      } else if (protegerApuesta(chat, usuario, cantidad)) {
        escudos++;
        coinsDevueltas += cantidad;
      } else {
        perdidas++;
        coinsPerdidas += cantidad;
      }
    }
    if (perdidas > 0) lineas.push(`💸 ${perdidas === 1 ? "1 apuesta perdida" : `${perdidas} apuestas perdidas`} (${coinsPerdidas} UruCoins).`);
    if (escudos > 0) lineas.push(`🛡️ ${escudos === 1 ? "1 escudo usado" : `${escudos} escudos usados`}: ${coinsDevueltas} UruCoins devueltos.`);
  }

  return lineas.length ? `\n\n${lineas.join("\n")}` : "";
}

// Most a person can bet: the game's fixed cap, or the percentage of their balance, whichever is larger.
export function apuestaMaxima(chat, usuario, base) {
  return Math.max(base, Math.floor((getSaldoCoins(chat, usuario) * COINS.APUESTA_MAX_PORCENTAJE) / 100));
}
export const textoApuestaMaxima = (base) => `${base} o el ${COINS.APUESTA_MAX_PORCENTAJE} % de tu saldo, lo que sea mayor`;

// Bets on the chat's active game, or on the user's own individual game.
export function apostar(chat, usuario, cantidad) {
  if (!Number.isInteger(cantidad) || cantidad < COINS.APUESTA_MIN) {
    return { ok: false, error: `La apuesta mínima es ${COINS.APUESTA_MIN} UruCoins.` };
  }

  const juego = juegosActivos.get(clave(chat)) || juegosActivos.get(clave(chat, usuario));
  if (!juego) return { ok: false, error: "No hay ningún juego activo para apostar. Arrancá uno primero (trivia, acertijo, ahorcado...)." };
  if (juego.apuestas.has(usuario)) return { ok: false, error: "Ya apostaste en este juego." };

  if (!gastarCoins(chat, usuario, cantidad, `apuesta_${juego.nombre}`)) {
    return { ok: false, error: "No te alcanzan los UruCoins para esa apuesta." };
  }

  juego.apuestas.set(usuario, cantidad);
  return { ok: true, nombreJuego: juego.nombre };
}
