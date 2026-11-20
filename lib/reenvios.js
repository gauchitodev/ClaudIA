// The resends the bot couldn't make. When someone's phone can't read one of the bot's messages, it asks for it again,
// and Baileys sends it again out of the ones it keeps: the last 512, for five minutes, in memory. Past that it asks the
// bot (getMessage, main.js), which keeps none: Baileys still sets the session right, so what comes next arrives, but
// that message stays as "Esperando el mensaje" for whoever asked. Having it to hand over would take keeping what the
// bot sends (issue #5); this counts how often it would have been used, by day, for .estado to show, so that's decided
// on what happens in the groups. Only how many: neither which message nor who asked is written down. Whatever the bot
// sent counts, a reaction or a deletion too, which leave nobody looking at a message that won't come: what people miss
// is this number at most.
import { claveDia, ultimosDias } from "./actividad.js";
import { sumarReenvioPerdido, leerReenviosPerdidos } from "../database-functions.js";

export const REENVIOS = { RECORDADOS: 5000 };

// A phone that doesn't get the message asks again, and Baileys hears it out up to five times an hour: each message
// counts once for each one who asks. In memory, capped: one asked for again after a restart counts again.
const pedidos = new Set();

// What main.js gives Baileys as getMessage, which in this Baileys is asked for one of the bot's own messages (fromMe)
// only to send it again (messages-recv.js); for someone else's, it's to read an answer to an event, and that's no
// resend. It's called in the middle of setting the session right for whoever asked, so it never throws.
export function mensajeParaReenviar(clave) {
  try {
    const pedido = `${clave?.id}|${clave?.participant || clave?.remoteJid}`;
    if (!clave?.fromMe || pedidos.has(pedido)) return;
    sumarReenvioPerdido(claveDia());
    pedidos.add(pedido);
    while (pedidos.size > REENVIOS.RECORDADOS) pedidos.delete(pedidos.values().next().value);
  } catch (e) {
    console.error("[reenvios] no pude anotar un reenvío que no se hizo:", e?.message || e);
  }
}

// For .estado: { hoy, semana, desde }, today's and the last seven days', and the day they're counted from ("YYYY-MM-DD":
// the table is born with that day's row, database-schema.js) while it's one of those seven, which then aren't seven
// whole days yet; null after that.
export function reenviosPerdidos(ahora = new Date()) {
  const dias = ultimosDias(ahora);
  const { hoy, semana, desde } = leerReenviosPerdidos(dias[0], dias.at(-1));
  return { hoy, semana, desde: desde >= dias.at(-1) ? desde : null };
}
