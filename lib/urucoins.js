// UruCoins: reglas de la economía del grupo, registro de juegos activos y apuestas.
import { ganarCoins, gastarCoins, coinsGanadasHoy, sumarReaccionEntradaHashtag } from "../database-functions.js";

// Todos los números de la economía en un solo lugar, para ajustarlos sin buscar por el código.
export const COINS = {
  REACCION_EMITIDA: 1,
  REACCION_RECIBIDA: 2,
  TOPE_REACCIONES_DIA: 30, // máximo de coins por día que se pueden ganar reaccionando/recibiendo
  HASHTAG: 5,
  TOPE_HASHTAG_SEMANA: 3, // máximo de entradas con premio por hashtag por semana
  JUEGO_GANADO: 10,
  HISTORIA_SEMANA: 25,
  GANADOR_MES: 50,
  SALTAR_COOLDOWN: 15,
  APUESTA_MIN: 5,
};

// ---------- Ganancias por reacción (con tope diario) ----------
export function otorgarPorReaccion(chat, autorLid, reactorLid, messageId) {
  if (coinsGanadasHoy(chat, autorLid, "reaccion_") + COINS.REACCION_RECIBIDA <= COINS.TOPE_REACCIONES_DIA) {
    ganarCoins(chat, autorLid, COINS.REACCION_RECIBIDA, "reaccion_recibida");
  }
  if (coinsGanadasHoy(chat, reactorLid, "reaccion_") + COINS.REACCION_EMITIDA <= COINS.TOPE_REACCIONES_DIA) {
    ganarCoins(chat, reactorLid, COINS.REACCION_EMITIDA, "reaccion_emitida");
  }
  sumarReaccionEntradaHashtag(chat, messageId);
}

// ---------- Registro de juegos activos y apuestas ----------
// clave: "<chat>|chat" para juegos de todo el grupo, "<chat>|<jugador>" para juegos individuales.
const juegosActivos = new Map();
const clave = (chat, jugador) => `${chat}|${jugador || "chat"}`;

export function juegoIniciado(chat, nombre, jugador = null) {
  juegosActivos.set(clave(chat, jugador), { nombre, apuestas: new Map() });
}

// Cierra el juego, paga apuestas y da el premio al ganador. Devuelve un texto para pegar
// al mensaje final del juego ("" si no hay nada que decir).
export function juegoTerminado(chat, ganador, jugador = null) {
  const k = clave(chat, jugador);
  const juego = juegosActivos.get(k);
  juegosActivos.delete(k);

  const lineas = [];
  if (ganador) {
    ganarCoins(chat, ganador, COINS.JUEGO_GANADO, "juego_ganado");
    lineas.push(`🪙 +${COINS.JUEGO_GANADO} UruCoins por ganar.`);
  }

  if (juego && juego.apuestas.size > 0) {
    let perdidas = 0;
    let coinsPerdidas = 0;
    for (const [usuario, cantidad] of juego.apuestas) {
      if (ganador && usuario === ganador) {
        ganarCoins(chat, usuario, cantidad * 2, "apuesta_ganada");
        lineas.push(`🎰 Apuesta ganada: cobraste ${cantidad * 2} UruCoins.`);
      } else {
        perdidas++;
        coinsPerdidas += cantidad;
      }
    }
    if (perdidas > 0) lineas.push(`💸 ${perdidas === 1 ? "1 apuesta perdida" : `${perdidas} apuestas perdidas`} (${coinsPerdidas} UruCoins).`);
  }

  return lineas.length ? "\n\n" + lineas.join("\n") : "";
}

// Apuesta sobre el juego activo del chat, o sobre el juego individual del propio usuario.
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
