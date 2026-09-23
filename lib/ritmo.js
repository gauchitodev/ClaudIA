// The bot's outgoing pace: avoids bursts and gives it human timing.
//
// Why: WhatsApp bans accounts that behave like machines. A bot that answers in 300 ms and fires ten messages in a
// second is the clearest signature there is. Two things happen here:
//   1) a per-chat queue, so a minimum amount of time always passes between two of the bot's messages;
//   2) a variable delay before replying, with "typing..." showing.
// Messages are never lost: they wait their turn. Reactions have a queue of their own (see lib/envios.js, which is
// what applies all this to every send) and are dropped when their turn is too far off: a reaction that arrives late
// says nothing, and a burst of them in the messages' queue held up the bot's replies.

export const RITMO = {
  MIN_ENTRE_MENSAJES_MS: 1500, // minimum between two bot messages in the same chat
  ESPERA_MAX_MS: 25000, // if a chat's queue goes past this, send anyway (nothing is left hanging)
  REACCION_ESPERA_MAX_MS: 5000, // a reaction that would have to wait longer than this isn't sent
  TIPEO_MIN_MS: 1800, // "human" delay before a conversational reply
  TIPEO_MAX_MS: 5500,
  TIPEO_POR_LETRA_MS: 18, // the longer the message, the longer it takes to "type" it
};

// Each queue keeps, per chat, when the bot last sent on it and until when it's reserved. Messages and reactions each
// have their own, so a burst of reactions (a busy trivia) can't push back the bot's replies.
const filas = new Map(); // fila -> { ultimoEnvio: chat -> ms, colaHasta: chat -> ms }
function filaDe(nombre) {
  if (!filas.has(nombre)) filas.set(nombre, { ultimoEnvio: new Map(), colaHasta: new Map() });
  return filas.get(nombre);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Waits for this chat's turn in a queue. Returns the ms it waited, or null when "descartarSiPasa" is given and the
// turn is further off than that: then nothing is reserved, and the caller doesn't send.
export async function esperarTurno(chat, { fila = "mensajes", descartarSiPasa = null } = {}) {
  if (!chat) return 0;
  const { ultimoEnvio, colaHasta } = filaDe(fila);
  const ahora = Date.now();
  const libre = Math.max(ahora, colaHasta.get(chat) || 0, (ultimoEnvio.get(chat) || 0) + RITMO.MIN_ENTRE_MENSAJES_MS);
  if (descartarSiPasa != null && libre - ahora > descartarSiPasa) return null;
  const espera = Math.min(libre - ahora, RITMO.ESPERA_MAX_MS);
  colaHasta.set(chat, libre + RITMO.MIN_ENTRE_MENSAJES_MS);
  if (espera > 0) await dormir(espera);
  ultimoEnvio.set(chat, Date.now());
  return Math.max(0, espera);
}

// Typing delay before a conversational reply, proportional to the text's length.
export function demoraTipeo(texto = "") {
  const base = RITMO.TIPEO_MIN_MS + Math.floor(Math.random() * (RITMO.TIPEO_MAX_MS - RITMO.TIPEO_MIN_MS));
  const porLargo = Math.min(4000, String(texto).length * RITMO.TIPEO_POR_LETRA_MS);
  return base + porLargo;
}

// Waits as if typing, keeping "typing..." alive (WhatsApp drops it on its own after ~10 s).
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
