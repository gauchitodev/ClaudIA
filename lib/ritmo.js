// The bot's outgoing pace: avoids bursts and gives it human timing.
//
// Why: WhatsApp bans accounts that behave like machines. A bot that answers in 300 ms and fires ten messages in a
// second is the clearest signature there is. Two things happen here:
//   1) a per-chat queue, so a minimum amount of time always passes between two of the bot's messages;
//   2) a variable delay before replying, with "typing..." showing.
// Nothing is lost: messages wait their turn, they aren't dropped.

export const RITMO = {
  MIN_ENTRE_MENSAJES_MS: 1500, // minimum between two bot messages in the same chat
  ESPERA_MAX_MS: 25000, // if a chat's queue goes past this, send anyway (nothing is left hanging)
  TIPEO_MIN_MS: 1800, // "human" delay before a conversational reply
  TIPEO_MAX_MS: 5500,
  TIPEO_POR_LETRA_MS: 18, // the longer the message, the longer it takes to "type" it
};

const ultimoEnvio = new Map(); // chat -> timestamp of the bot's last message
const colaHasta = new Map(); // chat -> until when the queue is reserved

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Waits for this chat's turn. Returns the ms it waited.
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
