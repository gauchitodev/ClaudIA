// The resends the bot couldn't make. When someone's device can't read one of the bot's messages, it asks for it again,
// and Baileys sends it again out of the ones it keeps (message-retry-manager.js): the last 512, for five minutes, in
// memory, each socket its own, so a reconnect starts with none. It files each one under the chat it went to, and looks
// a request up under whoever asks: in a group that's the group, but in a private chat it's the device asking, so a
// person's linked device (their WhatsApp Web, a tablet) doesn't find it a minute later either. When Baileys doesn't
// have it, it asks the bot (getMessage, main.js), which keeps none: Baileys still sets the session right, so what comes
// next arrives, but that message stays as "Esperando el mensaje" on the device that asked. Having it to hand over would
// take keeping what the bot sends (issue #5); this counts how often it would have been used, by day and by why it was
// missing (causaDe), for .estado to show, so that's decided on what happens in the groups, and so is what to keep.
// And by what asked for it (quienPide), with how many of them there were: a thousand a day can be a few devices that
// were off asking for all they missed, the bot's own phone among them, and what Baileys does with a message handed
// over depends on which one asks. Only how many: neither which message nor who asked is written down. Whatever the
// bot sent counts, a reaction or a deletion too, which leave nobody looking at a message that won't come, and so does
// a device that missed one while the person's phone showed it: what people miss is this number at most.
import { jidDecode } from "@whiskeysockets/baileys";
import { claveDia, ultimosDias } from "./actividad.js";
import { idsDelBot } from "./conexion.js";
import { sumarReenvioPerdido, leerReenviosPerdidos } from "../database-functions.js";

export const REENVIOS = {
  // The requests already counted that are remembered (pedidos).
  RECORDADOS: 5000,
  // How long Baileys keeps what the bot sends, to send it again (message-retry-manager.js, its ttl).
  EN_BAILEYS_MS: 5 * 60 * 1000,
  // The bot's messages remembered by their id (enviados): a busy week's.
  ENVIADOS: 20000,
  // The devices remembered as having asked today, of each kind (hanPedido): more than the groups have people.
  DISPOSITIVOS: 5000,
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

// What's asking, as its two columns of reenvios_perdidos, which is also what Baileys would do with the message if the
// bot had it to hand over (sendMessagesAgain, messages-recv.js):
// - "telefono": someone's phone. Baileys wouldn't send it to that phone alone but to the whole chat again, and in a
//   group with the group's key for every device in it, which the request has just made it forget they had. A phone
//   that was off for a day asks for all it couldn't read, and each one would be a send to the whole group.
// - "vinculado": someone's linked device (their WhatsApp Web, a tablet). Baileys would send it to that device alone.
// - "propio": a device of the bot's own number, its phone or another one linked to it, where nobody reads the groups.
// A phone is an id with no device in it, which is how Baileys tells one from the other (sendToAll).
function quienPide(participante) {
  const pide = jidDecode(participante);
  const esDelBot = (suyo) => {
    const bot = jidDecode(suyo);
    return bot?.user === pide.user && bot?.server === pide.server;
  };
  if (pide && idsDelBot().some(esDelBot)) return "propio";
  return pide?.device ? "vinculado" : "telefono";
}

// The devices of each kind that already asked on hanPedido.dia, to count each one once a day. In memory, capped: one
// that asks again after a restart counts again. Who they are stays here; what's written down is how many.
const hanPedido = { dia: null, telefono: new Set(), vinculado: new Set(), propio: new Set() };

function yaPidioHoy(dia, quien, participante) {
  if (hanPedido.dia !== dia) {
    hanPedido.dia = dia;
    for (const cual of ["telefono", "vinculado", "propio"]) hanPedido[cual].clear();
  }
  return hanPedido[quien].has(participante);
}

// What main.js gives Baileys as getMessage, which in this Baileys is asked for one of the bot's own messages (fromMe)
// only to send it again (messages-recv.js); for someone else's, it's to read an answer to an event, and that's no
// resend. Baileys says who's asking in the key (participant), in a private chat too. It's called in the middle of
// setting the session right for whoever asked, so it never throws.
export function mensajeParaReenviar(clave) {
  try {
    const participante = clave?.participant || clave?.remoteJid;
    const pedido = `${clave?.id}|${participante}`;
    if (!clave?.fromMe || pedidos.has(pedido)) return;
    const ahora = _dep.ahora();
    const dia = claveDia(new Date(ahora));
    const quien = quienPide(participante);
    sumarReenvioPerdido(dia, causaDe(clave.id, ahora), quien, !yaPidioHoy(dia, quien, participante));
    pedidos.add(pedido);
    while (pedidos.size > REENVIOS.RECORDADOS) pedidos.delete(pedidos.values().next().value);
    const los = hanPedido[quien];
    los.add(participante);
    while (los.size > REENVIOS.DISPOSITIVOS) los.delete(los.values().next().value);
  } catch (e) {
    console.error("[reenvios] no pude anotar un reenvío que no se hizo:", e?.message || e);
  }
}

// For .estado: today's and the last seven days' (hoy, semana), and the day they're counted from ("YYYY-MM-DD": the
// table is born with that day's row, database-schema.js) while it's one of those seven, which then aren't seven whole
// days yet (desde; null after that). And the seven days' by why (antesDeArrancar, tarde, reciente), with the ones
// counted before the bot told why apart (sinClasificar): the four add up to semana. And by what asked for them
// (deTelefono, deVinculado, dePropio), with the ones counted before the bot told that apart (sinQuien), which add up
// to semana too, and the most devices of each kind that asked on one of those days (telefonos, vinculados, propios):
// the days aren't added up, since one that asks on two of them is the same one.
export function reenviosPerdidos(ahora = new Date()) {
  const dias = ultimosDias(ahora);
  const { desde, ...contados } = leerReenviosPerdidos(dias[0], dias.at(-1));
  const { semana, antesDeArrancar, tarde, reciente, deTelefono, deVinculado, dePropio } = contados;
  return { ...contados, desde: desde >= dias.at(-1) ? desde : null, sinClasificar: semana - antesDeArrancar - tarde - reciente, sinQuien: semana - deTelefono - deVinculado - dePropio };
}
