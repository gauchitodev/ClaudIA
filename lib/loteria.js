// Lotería semanal de UruCoins: se compran boletos durante la semana y el sorteo sale apenas empieza la
// siguiente (lo dispara _cierres-periodicos.js con el primer mensaje del grupo). El pozo es la suma de los
// boletos, así que solo redistribuye entre quienes jugaron; LOTERIA_BONUS es lo que la banca pone encima.
import { randomInt as randomIntCrypto } from "crypto";

// Fuente de azar reemplazable: las pruebas la fijan para tener resultados previsibles.
export const _rng = { randomInt: randomIntCrypto };
import { gastarCoins, ganarCoins, getSaldoCoins, agregarBoletosLoteria, boletosLoteria, boletosLoteriaDe } from "../database-functions.js";
import { semanaDe } from "./hashtags.js";
import { COINS } from "./urucoins.js";

const mencion = (lid) => `@${lid.split("@")[0]}`;
const plural = (n, uno, varios) => (n === 1 ? uno : varios);

function estadoPozo(chat, semana) {
  const filas = boletosLoteria(chat, semana);
  const totalBoletos = filas.reduce((s, f) => s + f.cantidad, 0);
  const pozo = totalBoletos > 0 ? totalBoletos * COINS.LOTERIA_PRECIO + COINS.LOTERIA_BONUS : 0;
  return { filas, totalBoletos, pozo };
}

export function comprarBoletos(chat, usuario, cantidad) {
  if (!Number.isInteger(cantidad) || cantidad < 1) return { ok: false, error: "¿Cuántos boletos? Ej: .loteria 2" };
  const semana = semanaDe(Date.now());
  const tiene = boletosLoteriaDe(chat, semana, usuario);
  if (tiene + cantidad > COINS.LOTERIA_MAX_BOLETOS) {
    return {
      ok: false,
      error: tiene >= COINS.LOTERIA_MAX_BOLETOS ? `Ya tenés los ${COINS.LOTERIA_MAX_BOLETOS} boletos máximos de esta semana.` : `Podés comprar ${COINS.LOTERIA_MAX_BOLETOS - tiene} más como máximo esta semana.`,
    };
  }
  const costo = cantidad * COINS.LOTERIA_PRECIO;
  if (!gastarCoins(chat, usuario, costo, "loteria_boletos")) {
    return { ok: false, error: `No te alcanza: ${cantidad} ${plural(cantidad, "boleto cuesta", "boletos cuestan")} ${costo} y tenés ${getSaldoCoins(chat, usuario)} UruCoins.` };
  }
  agregarBoletosLoteria(chat, semana, usuario, cantidad);
  const { pozo, totalBoletos } = estadoPozo(chat, semana);
  return {
    ok: true,
    mensaje: `🎟️ Compraste ${cantidad} ${plural(cantidad, "boleto", "boletos")} por ${costo} UruCoins. Tenés ${tiene + cantidad}/${COINS.LOTERIA_MAX_BOLETOS}. Pozo: *${pozo}* (${totalBoletos} ${plural(totalBoletos, "boleto", "boletos")}). Te quedan ${getSaldoCoins(chat, usuario)}.`,
  };
}

export function textoEstadoLoteria(chat, usuario) {
  const semana = semanaDe(Date.now());
  const { filas, totalBoletos, pozo } = estadoPozo(chat, semana);
  const mios = boletosLoteriaDe(chat, semana, usuario);
  const chance = totalBoletos > 0 && mios > 0 ? ` (${Math.round((mios / totalBoletos) * 100)} % de chance)` : "";
  return [
    `🎟️ *LOTERÍA DE LA SEMANA*`,
    `Pozo: *${pozo} UruCoins* (${totalBoletos} ${plural(totalBoletos, "boleto", "boletos")} de ${filas.length} ${plural(filas.length, "persona", "personas")})`,
    `Tus boletos: ${mios}/${COINS.LOTERIA_MAX_BOLETOS}${chance}`,
    `Sorteo: apenas empieza la semana que viene (lunes).`,
    `Comprá con .loteria 2 (${COINS.LOTERIA_PRECIO} cada uno).`,
  ].join("\n");
}

// Sorteo de una semana ya terminada. Devuelve { texto, mentions } para anunciar, o null si no hubo boletos.
export function sortearLoteria(chat, semana) {
  const { filas, totalBoletos, pozo } = estadoPozo(chat, semana);
  if (totalBoletos === 0) return null;

  if (filas.length === 1) {
    // sin rival no hay sorteo: se devuelve lo pagado
    const unico = filas[0];
    const devuelto = unico.cantidad * COINS.LOTERIA_PRECIO;
    ganarCoins(chat, unico.usuario, devuelto, "loteria_devolucion");
    return { texto: `🎟️ *LOTERÍA DE LA SEMANA PASADA*\n\nSolo jugó ${mencion(unico.usuario)}, así que no hubo sorteo y le devolví sus ${devuelto} UruCoins.`, mentions: [unico.usuario] };
  }

  // cada boleto es una chance: se elige un boleto al azar y se ve de quién era
  let r = _rng.randomInt(0, totalBoletos);
  let ganador = filas[filas.length - 1];
  for (const f of filas) {
    if (r < f.cantidad) {
      ganador = f;
      break;
    }
    r -= f.cantidad;
  }
  ganarCoins(chat, ganador.usuario, pozo, "loteria_premio");
  const chance = Math.round((ganador.cantidad / totalBoletos) * 100);
  return {
    texto: `🎟️ *LOTERÍA DE LA SEMANA PASADA*\n\nPozo: ${pozo} UruCoins (${totalBoletos} boletos de ${filas.length} personas)\n🏆 Ganó ${mencion(ganador.usuario)} con ${ganador.cantidad} ${plural(ganador.cantidad, "boleto", "boletos")} (${chance} % de chance) 🪙 +${pozo}\n\nYa se pueden comprar boletos para esta semana con .loteria`,
    mentions: [ganador.usuario],
  };
}
