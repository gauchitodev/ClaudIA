// Inactive members. .inactivos tags who hasn't written in a while and warns them; whoever writes again within the
// grace period is spared and paid (COINS.REGRESO), and .k inactivos removes, after asking, the warned who stayed quiet.
// Never on the list: the bot, its owners, WhatsApp admins, the bot's admins and mods, whoever came in recently and
// whoever is away with .afk.
import { presenciaDelGrupo, ultimoDiaConversacion, inicioPresencia, olvidarInicioPresencia, marcarAvisoInactivo, quitarAvisoInactivo, registrarMensajeGrupo, enGrupoDe, lidDeNumero, jidDeLid, idsDeOwners, rolesGrupo, ultimoCobro, ganarCoins } from "../database-functions.js";
import { idsDeParticipante, esParticipante, expulsar } from "./identidad.js";
import { metadataDe, nombreDeGrupo } from "./cache-grupos.js";
import { COINS, monedasActivas } from "./urucoins.js";
import { DIA_MS, enviadoEn } from "./tiempo.js";
import { setTimeout as esperar } from "node:timers/promises";

export const INACTIVOS = {
  DIAS: 15, // days without writing to count as inactive (".inactivos 30" changes it for that call)
  DIAS_MIN: 7, // the fewest it takes: with ".inactivos 1", being warned and coming back every other day paid each time
  PLAZO_DIAS: 3, // days a warned person has to write before .k inactivos can remove them
  PREMIO_CADA_DIAS: 30, // COINS.REGRESO goes once in this many days per person and group
  POR_TANDA: 20, // most removals per .k inactivos: many in a row is what gets a bot flagged by WhatsApp
  PAUSA_MS: 3000, // between removals
  MOSTRADA_MS: 30 * 60 * 1000, // how long the preview of .k inactivos stands for its "confirmar"
  CONSULTA_MS: 3000, // how long it waits for WhatsApp's own map of numbers and LIDs (protegidosDe)
};
// Injectable for the tests.
export const _dep = { esperar };

// What isn't a message of its own: a reaction, a deletion or an edit (protocolMessage, editedMessage), a poll vote, a
// pin. Not a sign of life here, and not counted for the ranks either (plugins/_messsage-count.js).
export const NO_SON_MENSAJES = new Set(["reactionMessage", "encReactionMessage", "protocolMessage", "editedMessage", "pollUpdateMessage", "pinInChatMessage", "keepInChatMessage"]);

// Groups where .k inactivos is removing right now: a second confirmation meanwhile would remove the same people.
const sacando = new Set();
// The last preview of .k inactivos in each group, { ids, fecha }: "confirmar" removes only who it showed.
const mostradas = new Map();

const diasTexto = (n) => `${n} ${n === 1 ? "día" : "días"}`;

// Every id someone may come under: the given ones, and the other identity the database knows for each.
function conLaOtra(ids) {
  const todos = new Set(ids.filter(Boolean));
  for (const id of [...todos]) {
    const otro = id.endsWith("@lid") ? jidDeLid(id) : lidDeNumero(id);
    if (otro) todos.add(otro);
  }
  return [...todos];
}

// Who's never on the list, by every id they may come under: the owners and whoever has a bot role in the group. Read
// once for the whole group: it used to ask the database for each participant and each of their ids, some eleven
// queries a person, a second for a group of a thousand listed by number, with the bot waiting meanwhile.
function protegidosConocidos(chat) {
  return new Set([...idsDeOwners(), ...rolesGrupo(chat).flatMap((r) => conLaOtra([r.usuario]))]);
}

// The same, and for the few whose other identity the database doesn't know, the one in WhatsApp's own map (Baileys'
// lidMapping, from node_modules): an owner, or a mod given the role by number, who never wrote anywhere the bot is had
// no row, and in a group listed by LID they were tagged. Each lookup may ask WhatsApp, so it gets CONSULTA_MS.
export async function protegidosDe(client, chat) {
  const ids = protegidosConocidos(chat);
  const mapa = client?.signalRepository?.lidMapping;
  if (typeof mapa?.getLIDForPN !== "function" || typeof mapa?.getPNForLID !== "function") return ids;
  for (const id of [...ids]) {
    const sabida = id.endsWith("@lid") ? jidDeLid(id) : lidDeNumero(id)?.endsWith("@lid");
    if (sabida) continue;
    const consulta = id.endsWith("@lid") ? mapa.getPNForLID(id) : mapa.getLIDForPN(id);
    const otro = await Promise.race([Promise.resolve(consulta).catch(() => null), esperar(INACTIVOS.CONSULTA_MS, null, { ref: false })]);
    if (typeof otro === "string") ids.add(otro.replace(/:\d+@/, "@")); // it may bring the device, "59899…:0@s.whatsapp.net"
  }
  return ids;
}

// Only the admins write in a closed group (Baileys' announce): nobody else could have, and nobody can save themselves.
const cerrado = async (client, chat) => Boolean((await metadataDe(client, chat))?.announce);

// What's known of each participant, by all of their ids: their last sign of life (the last message of any kind, or the
// last day with conversation, taken at its end), when they came in and when they were warned, in ms. Protected people
// are left out. Before the bot kept track of the group (inicioPresencia) nobody can be told apart from someone silent,
// so whoever it has nothing of since then counts as seen, and as come in, that day. It used to go by the first time it
// had seen them write, and right after the update whoever sent only stickers, audios or one-word messages came out
// silent for months. propio is what's known of the person themselves, to say how long ago it was.
function estadosDelGrupo(chat, participants, client, protegidos = protegidosConocidos(chat)) {
  const inicio = inicioPresencia(chat);
  const porId = new Map(presenciaDelGrupo(chat).map((r) => [r.usuario, r]));
  const dias = new Map(ultimoDiaConversacion(chat).map((r) => [r.usuario, new Date(`${r.fecha}T23:59:59`).getTime()]));
  const yo = { lid: client?.user?.lid, jid: client?.user?.jid };

  const estados = [];
  for (const p of participants || []) {
    if (p.admin || esParticipante(p, yo)) continue;
    const ids = idsDeParticipante(p);
    if (ids.some((id) => protegidos.has(id))) continue;
    // The row with the LID first: a number may also have an old one keyed by itself (lidDeNumero).
    const enGrupo = [...ids].sort((a, b) => b.endsWith("@lid") - a.endsWith("@lid")).map((id) => enGrupoDe(id, chat)).find(Boolean);
    if (enGrupo?.afk > 0) continue; // away, and they said so themselves (.afk)
    let propio = 0;
    let ingreso = 0;
    let avisado = 0;
    for (const id of ids) {
      const r = porId.get(id);
      propio = Math.max(propio, r?.ultimo_mensaje || 0, dias.get(id) || 0);
      ingreso = Math.max(ingreso, r?.ingreso || 0);
      avisado = Math.max(avisado, r?.avisado || 0);
    }
    estados.push({ participante: p, ids, propio, ultimo: Math.max(propio, inicio), ingreso: Math.max(ingreso, inicio), avisado, mensajes: enGrupo?.messageCount || 0 });
  }
  return estados;
}

// Who hasn't written in `dias` days and didn't come in during them, the longest silent first. Nobody, while the bot
// hasn't kept track of the group for that long: it can't tell.
export function inactivosDe(chat, participants, client, { dias = INACTIVOS.DIAS, ahora = Date.now(), protegidos } = {}) {
  const corte = ahora - dias * DIA_MS;
  const inicio = inicioPresencia(chat);
  if (!inicio || inicio > corte) return [];
  return estadosDelGrupo(chat, participants, client, protegidos)
    .filter((e) => e.ultimo <= corte && e.ingreso <= corte)
    .sort((a, b) => a.ultimo - b.ultimo);
}

// Who .k inactivos may remove: warned PLAZO_DIAS ago or more and silent since. Writing lifts the warning, but the
// silence is checked here too, in case the message came under an id the warning doesn't have. A warning from before
// the bot last came into the group doesn't count either: the count starts over then (reiniciarSiEsElBot, below).
export function paraSacar(chat, participants, client, ahora = Date.now(), protegidos) {
  const plazo = ahora - INACTIVOS.PLAZO_DIAS * DIA_MS;
  const avisados = estadosDelGrupo(chat, participants, client, protegidos).filter((e) => e.avisado && e.ultimo < e.avisado);
  return { listos: avisados.filter((e) => e.avisado <= plazo), enPlazo: avisados.filter((e) => e.avisado > plazo) };
}

// How long ago they last wrote: exactly, if the bot saw it; "o más" when it's only known that it wasn't since the bot
// keeps track there. Never seen writing there is just that: it used to say "nunca escribió".
const hace = (e, ahora) => {
  if (!e.propio && !e.mensajes) return "no le vi ningún mensaje";
  return `hace ${diasTexto(Math.floor((ahora - e.ultimo) / DIA_MS))}${e.propio < e.ultimo ? " o más" : ""}`;
};

// .inactivos [días]: tags who hasn't written in that many days and warns them. Returns { texto, mentions }.
// They count as warned once the message went out: they used to be marked first, and a notice that didn't go out
// started their days all the same. Whoever was warned already isn't tagged again: their days run from the first
// notice, and a second one told people who could be removed that same minute "Tienen 3 días".
export async function avisarInactivos(client, m, participants, { dias = INACTIVOS.DIAS, ahora = Date.now() } = {}) {
  const responder = async (texto) => {
    await client.sendText(m.chat, texto, m);
    return { texto, mentions: [] };
  };
  const inicio = inicioPresencia(m.chat);
  if (!inicio || inicio > ahora - dias * DIA_MS) {
    const llevo = inicio ? Math.floor((ahora - inicio) / DIA_MS) : 0;
    return responder(`Todavía no sé quién no escribe hace ${diasTexto(dias)}: empecé a anotar quién escribe en este grupo ${llevo ? `hace ${diasTexto(llevo)}` : "hoy"}. Probá en ${diasTexto(dias - llevo)}.`);
  }
  if (await cerrado(client, m.chat)) return responder("Este grupo está cerrado: solo escriben los admins, así que no sé quién está inactivo. Abrilo y dale unos días.");

  const lista = inactivosDe(m.chat, participants, client, { dias, ahora, protegidos: await protegidosDe(client, m.chat) });
  const nuevos = lista.filter((e) => !e.avisado);
  // The ones warned before, apart: still within their days, or already removable.
  const plazo = ahora - INACTIVOS.PLAZO_DIAS * DIA_MS;
  const vencidos = lista.filter((e) => e.avisado && e.avisado <= plazo).length;
  const corriendo = lista.length - nuevos.length - vencidos;
  const mas = nuevos.length ? " más" : "";
  const yaAvisados = [
    corriendo && (corriendo === 1 ? `Una persona${mas} ya estaba avisada y sigue en su plazo.` : `${corriendo} personas${mas} ya estaban avisadas y siguen en su plazo.`),
    vencidos && (vencidos === 1 ? "A una persona avisada antes ya se la puede sacar con .k inactivos." : `A ${vencidos} personas avisadas antes ya se las puede sacar con .k inactivos.`),
  ]
    .filter(Boolean)
    .map((t) => ` ${t}`)
    .join("");
  if (nuevos.length === 0) return responder(yaAvisados ? `No hay inactivos nuevos.${yaAvisados}` : `No hay inactivos: todos escribieron en los últimos ${diasTexto(dias)} (o entraron hace menos).`);

  const premio = monedasActivas(m.chat) ? ` y se lleva 🪙 ${COINS.REGRESO} (una vez cada ${INACTIVOS.PREMIO_CADA_DIAS} días)` : "";
  const readMore = String.fromCharCode(8206).repeat(4001);
  const lineas = nuevos.map((e) => `@${e.participante.id.split("@")[0]} — ${hace(e, ahora)}`);
  const texto =
    `📢 *Inactivos (${nuevos.length})*: no escriben hace ${diasTexto(dias)} o más.\n` +
    `Tienen ${INACTIVOS.PLAZO_DIAS} días para mandar un mensaje: el que vuelva se salva${premio}. A los que sigan callados los puede sacar un admin con .k inactivos.${yaAvisados}\n` +
    `${readMore}\n\n${lineas.join("\n")}`;
  // The id the group lists them under, so the mention works.
  const mentions = nuevos.map((e) => e.participante.id);
  await client.sendMessage(m.chat, { text: texto, mentions }, { quoted: null });
  for (const e of nuevos) marcarAvisoInactivo(m.chat, e.ids, ahora);
  return { texto, mentions };
}

// .k inactivos: without "confirmar" it tells the admin, in private, who would go. Removes POR_TANDA at most, one at a
// time, and looks at each one again right before: whoever wrote, was made admin or got a role meanwhile stays. It used
// to take the list once, and someone who came back halfway through heard "Volvió" and was removed all the same.
// "confirmar" removes only who the last preview showed, within MOSTRADA_MS: ".k inactivos sí" removed without anyone
// having seen who, and the list could have changed since.
export async function sacarInactivos(client, m, participants, { confirmar = false, ahora = Date.now() } = {}) {
  if (await cerrado(client, m.chat)) return client.sendText(m.chat, "El grupo está cerrado: los avisados no pueden escribir para salvarse. Abrilo y probá de nuevo en unos días.", m);
  const protegidos = await protegidosDe(client, m.chat);
  const { listos, enPlazo } = paraSacar(m.chat, participants, client, ahora, protegidos);
  if (listos.length === 0) {
    const espera = enPlazo.length ? ` ${enPlazo.length === 1 ? "Hay 1 persona avisada que todavía está en plazo" : `Hay ${enPlazo.length} personas avisadas que todavía están en plazo`}.` : "";
    return client.sendText(m.chat, `No hay a quién sacar: nadie fue avisado con .inactivos hace ${INACTIVOS.PLAZO_DIAS} días o más y siguió callado.${espera}`, m);
  }

  if (!confirmar) {
    // In private and mentioned: there the admin's WhatsApp names each one, and a mention only notifies whoever is in
    // the chat. In the group they were named by the bot, and whoever it knew no name for came out as "alguien": the
    // admin confirmed blind.
    const grupo = await nombreDeGrupo(client, m.chat);
    const lineas = listos.map((e) => `• @${e.participante.id.split("@")[0]} — ${hace(e, ahora)}`);
    const tanda = listos.length > INACTIVOS.POR_TANDA ? `\n\nSaco de a ${INACTIVOS.POR_TANDA} por vez.` : "";
    const minutos = Math.round(INACTIVOS.MOSTRADA_MS / 60000);
    const texto = `☠️ *En ${grupo} saldrían ${listos.length}*: avisados hace ${INACTIVOS.PLAZO_DIAS} días o más y siguen sin escribir.\n\n${lineas.join("\n")}${tanda}\n\nPara sacarlos, en el grupo y en los próximos ${minutos} minutos: *.k inactivos confirmar*`;
    try {
      await client.sendMessage(m.senderJid || m.sender, { text: texto, mentions: listos.map((e) => e.participante.id) });
    } catch (e) {
      console.error("[inactivos] no pude mandar la lista por privado:", e?.message || e);
      return client.sendText(m.chat, "No te pude mandar por privado quiénes saldrían. Probá de nuevo en un rato.", m);
    }
    mostradas.set(m.chat, { ids: new Set(listos.map((e) => e.participante.id)), fecha: Date.now() });
    return client.sendText(m.chat, `☠️ Saldrían ${listos.length}: te mandé por privado quiénes son. Para sacarlos: *.k inactivos confirmar*`, m);
  }

  const mostrada = mostradas.get(m.chat);
  if (!mostrada || Date.now() - mostrada.fecha > INACTIVOS.MOSTRADA_MS) return client.sendText(m.chat, "Primero mirá quiénes saldrían con .k inactivos (te lo mando por privado), y después confirmá.", m);
  const aSacar = listos.filter((e) => mostrada.ids.has(e.participante.id));
  if (aSacar.length === 0) return client.sendText(m.chat, "Ya no queda nadie para sacar de la lista que te mandé.", m);
  if (sacando.has(m.chat)) return client.sendText(m.chat, "Ya los estoy sacando, esperá a que termine.", m);
  sacando.add(m.chat);
  try {
    const tanda = aSacar.slice(0, INACTIVOS.POR_TANDA);
    const empezo = Date.now();
    let sacados = 0;
    let salvados = 0;
    let idos = 0;
    for (const [i, e] of tanda.entries()) {
      if (i > 0) await _dep.esperar(INACTIVOS.PAUSA_MS);
      // The group as it is now (main.js refreshes it on a promotion or a departure), and the database as it is now: a
      // role given meanwhile counts too.
      const grupo = (await metadataDe(client, m.chat))?.participants || participants;
      const actual = grupo.find((p) => p.id === e.participante.id);
      if (!actual) {
        idos++;
        continue;
      }
      if (paraSacar(m.chat, [actual], client, ahora + Date.now() - empezo, new Set([...protegidos, ...protegidosConocidos(m.chat)])).listos.length === 0) {
        salvados++;
        continue;
      }
      const { ok } = await expulsar(client, m.chat, e.participante.id);
      if (ok) {
        sacados++;
        quitarAvisoInactivo(m.chat, e.ids);
        mostrada.ids.delete(e.participante.id);
      }
    }
    const fallas = tanda.length - sacados - salvados - idos;
    const resto = aSacar.length - tanda.length;
    const partes = [
      `🧹 Saqué a ${sacados} ${sacados === 1 ? "persona" : "personas"}.`,
      salvados && (salvados === 1 ? "Una se salvó a último momento: escribió, o la hicieron admin o le dieron un rol." : `${salvados} se salvaron a último momento: escribieron, o las hicieron admins o les dieron un rol.`),
      fallas && `A ${fallas} no pude.`,
      resto && `${resto === 1 ? "Queda 1" : `Quedan ${resto}`}: repetí .k inactivos confirmar.`,
    ];
    return client.sendText(m.chat, partes.filter(Boolean).join(" "), m);
  } finally {
    sacando.delete(m.chat);
  }
}

// Every id the one writing may have been warned under: what the message brings, and the other one the database knows.
// A warning kept under the number and the LID, lifted by a message that brought only the LID, stayed under the number,
// and a later message that brought it paid again. Whoever wrote goes first: the stamp goes on that one.
const idsDe = (m) => conLaOtra([m.sender, m.senderJid]);

// On every group message: stamps it and, if .inactivos had warned them, they're spared and paid, once every
// PREMIO_CADA_DIAS.
export async function registrarPresencia(client, m) {
  if (m.fromMe || !m.sender) return;
  const avisado = registrarMensajeGrupo(m.chat, idsDe(m));
  if (!avisado) return;
  const tocaPremio = monedasActivas(m.chat) && Date.now() - ultimoCobro(m.chat, m.sender, "regreso_inactivo") >= INACTIVOS.PREMIO_CADA_DIAS * DIA_MS;
  const premio = tocaPremio ? COINS.REGRESO : 0;
  if (premio) ganarCoins(m.chat, m.sender, premio, "regreso_inactivo");
  // Not awaited: it waits its turn to go out (lib/envios.js), and the hooks after this one used to wait with it, 1.5 s
  // or more: the answer to a trivia reached the game after one sent later, and the prize went to the other.
  client.sendText(m.chat, `🎉 Volvió @${m.sender.split("@")[0]}: sale de la lista de inactivos${premio ? ` y se lleva 🪙 ${premio}` : ""}.`, m, { mentions: [m.sender] }).catch((e) => console.error("[inactivos] ERROR:", e));
}

// handle-message, for a message that doesn't get to the hooks: it came late (the bot was offline, or reconnecting), it's
// from someone silenced (deleted on arrival) or it's a command from while the bot was offline. It's a sign of life all
// the same, with the time it was sent: it lifts the warning, without the "Volvió" nor the coins. It used to be lost, and
// whoever had written within the 3 days could be removed.
export function anotarPresencia(m) {
  if (!m?.isGroup || !m.message || m.fromMe || !m.sender || NO_SON_MENSAJES.has(m.mtype)) return;
  try {
    registrarMensajeGrupo(m.chat, idsDe(m), enviadoEn(m) || Date.now());
  } catch (e) {
    console.error("[inactivos] ERROR:", e);
  }
}

// main.js, on group-participants.update: if the bot itself came in or left, what it noted of the group before doesn't
// cover the time it wasn't there. Back after a month, everyone would have looked silent for that month.
export function reiniciarSiEsElBot(client, chat, participants) {
  const yo = [client?.user?.lid, client?.user?.jid].filter(Boolean);
  if (!(participants || []).some((p) => idsDeParticipante(p).some((id) => yo.includes(id)))) return false;
  olvidarInicioPresencia(chat);
  return true;
}
