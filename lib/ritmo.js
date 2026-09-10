// Ritmo de salida del bot: evita ráfagas y le da tiempos de persona.
//
// Por qué: WhatsApp banea cuentas que se comportan como máquinas. Un bot que contesta en 300 ms y
// manda diez mensajes seguidos en un segundo es la firma más clara que hay. Acá se hacen dos cosas:
//   1) una cola por chat, para que entre dos mensajes del bot pase siempre un mínimo de tiempo;
//   2) una demora variable antes de responder, con el "escribiendo..." puesto.
// Nada se pierde: los mensajes esperan su turno, no se descartan.

export const RITMO = {
  MIN_ENTRE_MENSAJES_MS: 1500, // mínimo entre dos mensajes del bot en el mismo chat
  ESPERA_MAX_MS: 25000, // si la cola de un chat se pasa de esto, se manda igual (no dejamos nada colgado)
  TIPEO_MIN_MS: 1800, // demora "humana" antes de una respuesta de charla
  TIPEO_MAX_MS: 5500,
  TIPEO_POR_LETRA_MS: 18, // cuanto más largo el mensaje, más tarda en "escribirlo"
};

const ultimoEnvio = new Map(); // chat -> timestamp del último mensaje del bot
const colaHasta = new Map(); // chat -> hasta cuándo está reservada la cola

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Espera el turno de este chat. Devuelve los ms que esperó.
export async function esperarTurno(chat) {
  if (!chat) return 0;
  const ahora = Date.now();
  const libre = Math.max(ahora, colaHasta.get(chat) || 0, (ultimoEnvio.get(chat) || 0) + RITMO.MIN_ENTRE_MENSAJES_MS);
  const espera = Math.min(libre - ahora, RITMO.ESPERA_MAX_MS);
  colaHasta.set(chat, libre + RITMO.MIN_ENTRE_MENSAJES_MS);
  if (espera > 0) await dormir(espera);
  ultimoEnvio.set(chat, Date.now());
  return Math.max(0, espera);
}

// Demora de tipeo antes de una respuesta de charla, proporcional al largo del texto.
export function demoraTipeo(texto = "") {
  const base = RITMO.TIPEO_MIN_MS + Math.floor(Math.random() * (RITMO.TIPEO_MAX_MS - RITMO.TIPEO_MIN_MS));
  const porLargo = Math.min(4000, String(texto).length * RITMO.TIPEO_POR_LETRA_MS);
  return base + porLargo;
}

// Espera como si estuviera escribiendo, manteniendo el "escribiendo..." vivo (WhatsApp lo corta solo a los ~10 s).
export async function tipear(client, chat, texto = "") {
  const total = demoraTipeo(texto);
  let restante = total;
  while (restante > 0) {
    await client.sendPresenceUpdate("composing", chat).catch(() => {});
    const tramo = Math.min(restante, 8000);
    await dormir(tramo);
    restante -= tramo;
  }
  await client.sendPresenceUpdate("paused", chat).catch(() => {});
  return total;
}
