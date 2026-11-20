// The resends the bot couldn't make. When someone's device can't read one of the bot's messages, it asks for it again,
// and Baileys sends it again out of the ones it keeps (message-retry-manager.js): the last 512, for five minutes, in
// memory, each socket its own, so a reconnect starts with none. It files each one under the chat it went to, and looks
// a request up under whoever asks: in a group that's the group, but in a private chat it's the device asking, so a
// person's linked device (their WhatsApp Web, a tablet) doesn't find it a minute later either. When Baileys doesn't
// have it, it asks the bot (getMessage, main.js), which keeps none: Baileys still sets the session right, so what comes
// next arrives, but that message stays as "Esperando el mensaje" on the device that asked. Having it to hand over would
// take keeping what the bot sends (issue #5); this counts how often it would have been used, by day and by why it was
// missing (causaDe), for .estado to show, so that's decided on what happens in the groups, and so is what to keep.
// Only how many: neither which message nor who asked is written down. Whatever the bot sent counts, a reaction or a
// deletion too, which leave nobody looking at a message that won't come, and so does a device that missed one while
// the person's phone showed it: what people miss is this number at most.
import { claveDia, ultimosDias } from "./actividad.js";
import { sumarReenvioPerdido, leerReenviosPerdidos } from "../database-functions.js";

export const REENVIOS = {
  // The requests already counted that are remembered (pedidos).
  RECORDADOS: 5000,
  // How long Baileys keeps what the bot sends, to send it again (message-retry-manager.js, its ttl).
  EN_BAILEYS_MS: 5 * 60 * 1000,
  // The bot's messages remembered by their id (enviados): a busy week's.
  ENVIADOS: 20000,
};

// Swappable from the tests.
export const _dep = { ahora: () => Date.now() };

// A device that doesn't get the message asks again, and Baileys hears it out up to five times an hour: each message
// counts once for each device that asks. In memory, capped: one asked for again after a restart counts again.
const pedidos = new Set();

// When each of the bot's messages went out, by its id, in this run of main.js: lib/envios.js notes every one that goes
// out. Past ENVIADOS the oldest go, and count as from before the start, which a run seldom lasts long enough to reach.
const enviados = new Map();

export function anotarEnviado(id) {
  if (!id) return;
  enviados.set(id, _dep.ahora());
  while (enviados.size > REENVIOS.ENVIADOS) enviados.delete(enviados.keys().next().value);
}

// Why Baileys didn't have it, as its column of reenvios_perdidos, which is also what would have had it:
// - "antes_de_arrancar": it went out before main.js last started. Only a store that outlives it: start-process.js's
//   relay, or the disk.
// - "tarde": it went out in this run, more than EN_BAILEYS_MS before it was asked for. A store in memory with a longer
//   window.
// - "reciente": it went out in this run, and Baileys should have had it: a reconnect emptied it, or a linked device
//   asked in private. A store of minutes, looked up by the message's id alone.
function causaDe(id, ahora) {
  const enviado = enviados.get(id);
  if (enviado === undefined) return "antes_de_arrancar";
  return ahora - enviado > REENVIOS.EN_BAILEYS_MS ? "tarde" : "reciente";
}

// What main.js gives Baileys as getMessage, which in this Baileys is asked for one of the bot's own messages (fromMe)
// only to send it again (messages-recv.js); for someone else's, it's to read an answer to an event, and that's no
// resend. It's called in the middle of setting the session right for whoever asked, so it never throws.
export function mensajeParaReenviar(clave) {
  try {
    const pedido = `${clave?.id}|${clave?.participant || clave?.remoteJid}`;
    if (!clave?.fromMe || pedidos.has(pedido)) return;
    const ahora = _dep.ahora();
    sumarReenvioPerdido(claveDia(new Date(ahora)), causaDe(clave.id, ahora));
    pedidos.add(pedido);
    while (pedidos.size > REENVIOS.RECORDADOS) pedidos.delete(pedidos.values().next().value);
  } catch (e) {
    console.error("[reenvios] no pude anotar un reenvío que no se hizo:", e?.message || e);
  }
}

// For .estado: today's and the last seven days' (hoy, semana), and the day they're counted from ("YYYY-MM-DD": the
// table is born with that day's row, database-schema.js) while it's one of those seven, which then aren't seven whole
// days yet (desde; null after that). And the seven days' by why (antesDeArrancar, tarde, reciente), with the ones
// counted before the bot told why apart (sinClasificar): the four add up to semana.
export function reenviosPerdidos(ahora = new Date()) {
  const dias = ultimosDias(ahora);
  const { hoy, semana, desde, antesDeArrancar, tarde, reciente } = leerReenviosPerdidos(dias[0], dias.at(-1));
  return { hoy, semana, desde: desde >= dias.at(-1) ? desde : null, antesDeArrancar, tarde, reciente, sinClasificar: semana - antesDeArrancar - tarde - reciente };
}
