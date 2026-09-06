// UruCoins: reglas de la economía del grupo, registro de juegos activos y apuestas.
import { ganarCoins, gastarCoins, coinsGanadasHoy, sumarReaccionEntradaHashtag, getChat } from "../database-functions.js";
import { multiplicador, usarEscudo, usarVotoDoble } from "./tienda.js";

// Todos los números de la economía en un solo lugar, para ajustarlos sin buscar por el código.
export const COINS = {
  REACCION_EMITIDA: 1,
  REACCION_RECIBIDA: 2,
  TOPE_REACCIONES_DIA: 0, // máximo de coins por día por reacciones (dar + recibir). 0 = sin tope.
  HASHTAG: 5,
  TOPE_HASHTAG_SEMANA: 3, // máximo de entradas con premio por hashtag por semana
  JUEGO_GANADO: 10,
  HISTORIA_SEMANA: 25,
  GANADOR_MES: 50,
  SALTAR_COOLDOWN: 15,
  APUESTA_MIN: 5,
  // Casino (ruleta y tragamonedas): la banca gana un poco a la larga; tope por jugada y por día para no fundirse.
  CASINO_APUESTA_MAX: 100,
  // Duelos uno contra uno: cada uno pone lo mismo y el ganador se lleva todo (la banca no toca nada).
  DUELO_APUESTA_MAX: 100,
  CASINO_TOPE_DIA: 300,
  // Lotería semanal: el pozo es la suma de los boletos; BONUS es lo que la banca pone encima (0 = solo redistribuye).
  LOTERIA_PRECIO: 10,
  LOTERIA_MAX_BOLETOS: 5,
  LOTERIA_BONUS: 0,
  // Mercados de apuestas sobre eventos: tope por persona en cada mercado, opciones máximas y días para cargar el resultado.
  MERCADO_APUESTA_MAX: 100,
  MERCADO_MAX_OPCIONES: 6,
  MERCADO_DIAS_PARA_RESOLVER: 7,
  // Actividad: pregunta del día (por responderla), trivia relámpago (el primero que acierta) y racha diaria
  // (por escribir al menos RACHA_MENSAJES_DIA mensajes de dos palabras o más; el premio sube con los días seguidos).
  PREGUNTA_DIA: 3,
  TRIVIA_RELAMPAGO: 15,
  RACHA_BASE: 3,
  RACHA_MAX: 10,
  RACHA_MENSAJES_DIA: 3,
};

// ¿La economía está prendida en este chat? Se apaga por grupo con .monedas o .modo compraventa. Sin fila, o en
// privado, se toma como prendida. Los comandos de UruCoins los frena handle-message (plugin.economia); esto es para
// las fuentes pasivas: reacciones, racha, hashtags, juegos, cierres y ascensos.
export function monedasActivas(chat) {
  const c = getChat(chat);
  return !c || c.monedas !== 0;
}

// ---------- Ganancias por reacción (con tope diario) ----------
// Con racha doble se gana el doble y el tope diario también se duplica (si no, el ítem no serviría de nada).
export function otorgarPorReaccion(chat, autorLid, reactorLid, messageId) {
  const multAutor = multiplicador(chat, autorLid);
  const multReactor = multiplicador(chat, reactorLid);

  // con TOPE_REACCIONES_DIA en 0 no hay límite; si es mayor a 0, se respeta (y la racha doble lo duplica)
  const dentroDelTope = (lid, gana, mult) => COINS.TOPE_REACCIONES_DIA <= 0 || coinsGanadasHoy(chat, lid, "reaccion_") + gana <= COINS.TOPE_REACCIONES_DIA * mult;

  // con la economía apagada la reacción sigue contando como voto de hashtag, pero no reparte coins
  const pagar = monedasActivas(chat);

  const ganaAutor = COINS.REACCION_RECIBIDA * multAutor;
  if (pagar && dentroDelTope(autorLid, ganaAutor, multAutor)) ganarCoins(chat, autorLid, ganaAutor, "reaccion_recibida");

  const ganaReactor = COINS.REACCION_EMITIDA * multReactor;
  if (pagar && dentroDelTope(reactorLid, ganaReactor, multReactor)) ganarCoins(chat, reactorLid, ganaReactor, "reaccion_emitida");

  // Si el mensaje era una entrada de hashtag, suma un voto. Con voto doble guardado, suma dos y lo consume.
  const eraEntrada = sumarReaccionEntradaHashtag(chat, messageId, 1);
  if (eraEntrada && usarVotoDoble(chat, reactorLid)) {
    sumarReaccionEntradaHashtag(chat, messageId, 1);
  }
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
      } else if (usarEscudo(chat, usuario)) {
        // el escudo se gasta solo y devuelve lo apostado
        ganarCoins(chat, usuario, cantidad, "escudo_devolucion");
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
