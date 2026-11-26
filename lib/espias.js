// The secret missions (misión secreta): a game of spies inside a group. Only those who sign up play, and signing up
// is done in private, the person writing to Claudia first (.espia): she hands them a secret emoji, theirs alone in
// that group (🦊, 🐊, 🦉…). Now and then she posts to the group "📩 Llegó un sobre para 🦊": only 🦊's owner knows it's
// for them, writes .sobre to her in private and gets the mission: make @Someone (anybody who's been talking, signed
// up or not) say a given word in the group before a deadline, without telling them. The hard one, by the intent
// classifier (lib/intencion.js): make them offer something for sale, or ask to buy something. When the target says
// it, Claudia reveals it all in the group and pays the prize. Anyone can report who they think the spy is
// (.denunciar @persona): right, the spy loses the mission and pays a fine and the reporter is paid; wrong, the
// reporter pays for the false accusation. One report each per envelope. At the deadline the group is told 🦊 failed.
//
// Claudia never writes first in private: everything she says there answers a command (plugins/espias-agente.js), so
// there's one private chat per person signed up and one per mission, and no flood of "is it me?". And so it isn't
// spam in the group: off unless an admin asks for it (.espias on), at most ESPIA.MAX_DIA envelope a day inside the
// hours, one at a time, and never to a group that isn't talking right then. What goes to the group goes out through
// client.sendMessage, that is, through the usual pace (lib/envios.js, lib/ritmo.js).
// Every number is in ESPIA. The tables are in database-schema.js.
import { randomInt } from "crypto";
import { db, getChat, ganarCoins, gastarCoins, getSaldoCoins, moverCoins, chatsConOpcion, periodoCerrado, marcarPeriodoCerrado, crearPendiente, totalMensajesEntre, mensajesPorHora } from "../database-functions.js";
import { monedasActivas } from "./urucoins.js";
import { claveDia } from "./actividad.js";
import { metadataDe } from "./cache-grupos.js";
import { buscarEnGrupo, identidadDelGrupo, esElBot, mismaPersona, lidDe } from "./identidad.js";
import { nombreDe } from "./menciones.js";
import { esComando } from "./comandos.js";
import { intencionDe, _dep as intencion } from "./intencion.js";

export const ESPIA = {
  // the envelopes
  MAX_DIA: 1, // at most this many a day per group
  PROBABILIDAD: 0.8, // odds of the day's envelope being scheduled at all: not every day, so it isn't a clock
  DESDE_HORA: 11, // they go out from 11:00 to 19:59, so the latest deadline is before 22:00
  HASTA_HORA: 20,
  MENSAJES_AYER: 30, // messages the group needs from the day before for one to be scheduled
  VIVO_MENSAJES: 5, // and in this hour and the one before for it to go out: no posting to a quiet group
  MIN_AGENTES: 2, // people signed up (and still in the group) for an envelope to go out: with one, it's always theirs
  // the mission
  PLAZO_MIN: 120, // minutes from the envelope's posting to the deadline
  OBJETIVO_ACTIVO_HORAS: 3, // the target is someone who wrote in the group within these hours
  DIFICIL_CHANCE: 20, // % of the missions that are the hard one (make them sell or buy), where the classifier reads
  PREMIO: 150, // UruCoins for a mission done
  PREMIO_DIFICIL: 250, // and for the hard one
  PALABRAS_SIN_REPETIR: 10, // a group doesn't get any of its last words again
  // the reports
  MULTA: 60, // what a spy caught pays (or what they have, if less)
  RECOMPENSA: 60, // what whoever caught them is paid
  DENUNCIA_FALSA: 30, // what a wrong report costs; it has to be in the pocket to report at all
  // At the deadline, whether the group is told who the spy was. Not: who 🦊 was stays a mystery, the group is left
  // guessing and 🦊 keeps their cover for the next envelope. The mission itself (whom, and what word) is told always.
  REVELAR_AL_FALLAR: false,
};

// The secret emojis: one code point each, so one typed after .denunciar is read whole. As many people as there are
// here can be signed up in a group.
export const EMOJIS = ["🦊", "🐊", "🦉", "🐸", "🐢", "🦆", "🐝", "🦀", "🐙", "🦎", "🐧", "🦜", "🐴", "🐷", "🐮", "🐔", "🦇", "🐺", "🐗", "🦔", "🦥", "🦦", "🦨", "🦘", "🦒", "🐘", "🦏", "🦛", "🐪", "🦙", "🐐", "🐑", "🦌", "🐓", "🦃", "🦚", "🦩", "🐬", "🦈", "🐌", "🦋", "🐞", "🦂", "🦞", "🦑", "🐳", "🦭", "🐨", "🐼", "🦝"];

// The words: one word each, a thing with a name everybody knows that doesn't come up on its own in a chat, and that
// can be brought up by talking about something else. In the singular; the plural and the diminutive are worked out
// (formasDe).
export const PALABRAS = [
  "chorizo", "termo", "bombilla", "garrafa", "heladera", "bicicleta", "carpincho", "ñandú", "tortuga", "milanesa",
  "alfajor", "mondongo", "canilla", "estufa", "sombrilla", "zapallo", "boniato", "murga", "tambor", "fainá",
  "pizarrón", "ventilador", "colchón", "escalera", "martillo", "pomelo", "lenteja", "morcilla", "raviol", "ñoqui",
  "buñuelo", "mandarina", "zanahoria", "frazada", "almohada", "mochila", "carretilla", "lagartija", "mosquito", "hormiga",
  "gaviota", "lechuza", "mulita", "comadreja", "vereda", "semáforo", "rotonda", "peaje", "ascensor", "enchufe",
  "antena", "serrucho", "tornillo", "candado", "linterna", "guitarra", "bandoneón", "trompeta", "payaso", "dinosaurio",
  "astronauta", "pirata", "fantasma", "volcán", "camello", "pingüino", "jirafa", "paraguas", "ómnibus", "garrapata",
  "churrasco", "pascualina", "bizcocho", "medialuna", "tortafrita", "damajuana", "parrilla", "chimenea", "hamaca", "tobogán",
];

// The dice, here so the tests can load them.
export const _dep = { azar: (n) => randomInt(0, n) };
const alAzar = (lista) => lista[_dep.azar(lista.length)];

const mencion = (id) => `@${String(id).split("@")[0]}`;
const hora = (ms) => new Date(ms).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false });
const ES_DIFICIL = (tipo) => tipo !== "palabra";

// ---------- the word ----------
// A text as the words are compared: lowercase and without accents ("ñandú" and "nandu" are one, on both sides).
export const normalizar = (texto) => String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// A stem as it's written before -ito: chorizo → choric-ito, churrasco → churrasqu-ito, hormiga → hormigu-ita.
const anteI = (raiz) => (raiz.endsWith("z") ? `${raiz.slice(0, -1)}c` : raiz.endsWith("c") ? `${raiz.slice(0, -1)}qu` : raiz.endsWith("g") ? `${raiz}u` : raiz);

// Every way a word of the bank counts as said: itself, its plural, its diminutives and theirs (chorizo, chorizos,
// choricito, choricitos). Worked out by the spelling alone, so some of them are no word at all ("choricita"), which
// costs nothing: nobody says them. Whole words only: "chorizar" isn't "chorizo".
export function formasDe(palabra) {
  const cruda = String(palabra).toLowerCase();
  const aguda = /[áéíóú]$/.test(cruda); // fainá, ñandú: fainacita
  const p = normalizar(cruda);
  const dim = [];
  if (aguda || /[nr]$/.test(p)) dim.push(`${p}cito`, `${p}cita`); // colchoncito, tamborcito
  else if (/[aeo]$/.test(p)) {
    const raiz = p.slice(0, -1);
    dim.push(`${anteI(raiz)}ito`, `${anteI(raiz)}ita`); // termito, enchufito
    if (p.endsWith("e")) dim.push(`${p}cito`, `${p}cita`); // peajecito
    if (raiz.endsWith("i")) dim.push(`${raiz.slice(0, -1)}ito`, `${raiz.slice(0, -1)}ita`); // dinosaurio: dinosaurito
  } else if (!p.endsWith("s")) dim.push(`${anteI(p)}ito`, `${anteI(p)}ita`); // raviolito
  const plural = (x) => (/[aeiou]$/.test(x) ? [`${x}s`] : x.endsWith("z") ? [`${x.slice(0, -1)}ces`] : [`${x}es`]);
  return new Set([p, ...plural(p), ...(aguda ? [`${p}es`] : []), ...dim, ...dim.map((d) => `${d}s`)]);
}

const formas = new Map();
// Whether a text says the word, in any of its forms. A word stretched at the end counts too ("chorizooo").
export function diceLaPalabra(texto, palabra) {
  if (!formas.has(palabra)) formas.set(palabra, formasDe(palabra));
  const suyas = formas.get(palabra);
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .some((t) => suyas.has(t) || suyas.has(t.replace(/(.)\1+$/, "$1")));
}

// ---------- the tables ----------
const porId = (id) => db.prepare(`SELECT * FROM espias_misiones WHERE id = ?`).get(id) || null;
export const misionAbierta = (chat) => db.prepare(`SELECT * FROM espias_misiones WHERE chat = ? AND estado = 'abierta' ORDER BY id DESC LIMIT 1`).get(chat) || null;
export const agentesDe = (chat) => db.prepare(`SELECT * FROM espias_agentes WHERE chat = ? ORDER BY desde, rowid`).all(chat);
const marcas = (ids) => ids.map(() => "?").join(", ");
// Someone's sign-ups, by any id they come under (in private a message may bring the number, the LID or both).
export function agentesDeQuien(ids, chat = null) {
  if (!ids?.length) return [];
  const filas = db.prepare(`SELECT * FROM espias_agentes WHERE (usuario IN (${marcas(ids)}) OR (jid != '' AND jid IN (${marcas(ids)}))) ORDER BY chat`).all(...ids, ...ids);
  return chat ? filas.filter((f) => f.chat === chat) : filas;
}
const idsDeAgente = (a) => [a.usuario || a.agente, a.jid ?? a.agente_jid].filter(Boolean);
const inicioDelDia = (ahora) => new Date(ahora).setHours(0, 0, 0, 0);
const deHoy = (chat, ahora) => db.prepare(`SELECT COUNT(*) AS n FROM espias_misiones WHERE chat = ? AND publicada >= ?`).get(chat, inicioDelDia(ahora)).n;

// An emoji nobody has in the group, at random, or null with all of them taken.
function emojiLibre(chat) {
  const tomados = new Set(agentesDe(chat).map((a) => a.emoji));
  const libres = EMOJIS.filter((e) => !tomados.has(e));
  return libres.length ? alAzar(libres) : null;
}

// ---------- signing up, in private ----------
// Signs someone up in a group: usuario is the id the group knows them by (their LID when it has one: it's where their
// UruCoins are) and jid their number, when known. Returns { ok, emoji, nuevo }, the emoji they already had when they
// were in, or { ok: false, error }.
export function anotarAgente(chat, { usuario, jid = "" }, ahora = Date.now()) {
  const ya = agentesDeQuien([usuario, jid].filter(Boolean), chat)[0];
  if (ya) return { ok: true, emoji: ya.emoji, nuevo: false };
  const emoji = emojiLibre(chat);
  if (!emoji) return { ok: false, error: "En ese grupo no me quedan disfraces: ya hay demasiados espías. Probá cuando alguno cuelgue la gabardina." };
  db.prepare(`INSERT INTO espias_agentes (chat, usuario, jid, emoji, desde) VALUES (?, ?, ?, ?, ?)`).run(chat, usuario, jid || "", emoji, ahora);
  return { ok: true, emoji, nuevo: true };
}

// Signs someone out of a group. With their envelope still open there, it's void: aviso is what to tell the group
// (never who it was). Returns { ok, aviso } or { ok: false }.
export function borrarAgente(chat, ids) {
  const fila = agentesDeQuien(ids, chat)[0];
  if (!fila) return { ok: false };
  const mision = misionAbierta(chat);
  const suya = mision && mismaPersona(idsDeAgente(mision), idsDeAgente(fila));
  db.transaction(() => {
    db.prepare(`DELETE FROM espias_agentes WHERE chat = ? AND usuario = ?`).run(chat, fila.usuario);
    if (suya) db.prepare(`UPDATE espias_misiones SET estado = 'anulada' WHERE id = ?`).run(mision.id);
  })();
  return { ok: true, aviso: suya ? `🧥 ${mision.emoji} colgó la gabardina y se retiró del espionaje: su sobre queda sin efecto. Nunca sabremos quién era.` : null };
}

// Once the group has seen who an emoji was, it's no secret: its owner gets another one, which they learn by asking
// in private (.espia), since Claudia doesn't write first.
function cambiarEmoji(mision) {
  const fila = agentesDeQuien(idsDeAgente(mision), mision.chat)[0];
  const nuevo = fila ? emojiLibre(mision.chat) : null;
  if (nuevo) db.prepare(`UPDATE espias_agentes SET emoji = ? WHERE chat = ? AND usuario = ?`).run(nuevo, mision.chat, fila.usuario);
  return Boolean(nuevo);
}
const QUEMADO = (emoji) => `_${emoji} quedó quemado: a su dueño le toca disfraz nuevo, que me lo pregunte por privado con .espia_`;

// ---------- the envelope ----------
// Schedules the day's envelope, once a day per group, as the changas are (lib/changas.js): rolled for, at a random
// moment of the hours left. Only in groups that talked the day before. Runs every 5 minutes from
// tareas-programadas.js.
export function programarSobresDelDia(ahora = new Date()) {
  if (ahora.getHours() < ESPIA.DESDE_HORA) return 0;
  const hoy = claveDia(ahora);
  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  let agendados = 0;
  for (const chat of chatsConOpcion("espias")) {
    if (!monedasActivas(chat)) continue; // not marked done: with the economy back on, the next pass schedules it
    if (periodoCerrado(chat, "espias_prog", hoy)) continue;
    marcarPeriodoCerrado(chat, "espias_prog", hoy);
    if (totalMensajesEntre(chat, [claveDia(ayer)]) < ESPIA.MENSAJES_AYER) continue;
    if (agentesDe(chat).length < ESPIA.MIN_AGENTES) continue;
    const inicio = Math.max(ahora.getTime() + 60 * 1000, new Date(ahora).setHours(ESPIA.DESDE_HORA, 0, 0, 0));
    const fin = new Date(ahora).setHours(ESPIA.HASTA_HORA, 0, 0, 0);
    for (let i = 0; i < ESPIA.MAX_DIA; i++) {
      if (fin <= inicio || Math.random() > ESPIA.PROBABILIDAD) continue;
      crearPendiente(chat, "bot", "espia_sobre", {}, inicio + Math.floor(Math.random() * (fin - inicio)));
      agendados++;
    }
  }
  return agendados;
}

// Is the group talking right now? Its messages of this hour and the one before (plugins/_actividad-horaria.js).
function grupoVivo(chat, ahora) {
  const h = ahora.getHours();
  const porHora = new Map(mensajesPorHora(chat, [claveDia(ahora)]).map((r) => [r.hora, r.total]));
  return (porHora.get(h) || 0) + (porHora.get(h - 1) || 0) >= ESPIA.VIVO_MENSAJES;
}

// Who the target can be: whoever wrote in the group lately (presencia_grupo, which .inactivos keeps) and is still in
// it, but for Claudia and the spy. Each person once, by both ids the group gives them.
function objetivosPosibles(chat, participants, agente, ahora) {
  const desde = ahora - ESPIA.OBJETIVO_ACTIVO_HORAS * 60 * 60 * 1000;
  const vistos = new Set();
  const lista = [];
  for (const { usuario } of db.prepare(`SELECT usuario FROM presencia_grupo WHERE chat = ? AND ultimo_mensaje >= ? ORDER BY usuario`).all(chat, desde)) {
    const p = buscarEnGrupo(participants, usuario.endsWith("@lid") ? { lid: usuario } : { jid: usuario });
    if (!p || vistos.has(p) || p === agente || esElBot(p)) continue;
    vistos.add(p);
    const { lid, jid } = identidadDelGrupo(p);
    lista.push({ objetivo: lid || lidDe(p.id, participants), objetivo_jid: jid || "" });
  }
  return lista;
}

const enElGrupo = (participants, a) => {
  const [uno, otro] = idsDeAgente(a);
  return buscarEnGrupo(participants, { lid: uno.endsWith("@lid") ? uno : null, jid: uno.endsWith("@lid") ? otro : uno });
};

// Whether the classifier is there to read the hard missions (lib/intencion.js): without its weights, none is given.
const hayClasificador = () => Boolean(intencion.probabilidades("vendo una bici"));

// Called by the pending-work processor at the scheduled time (lib/pendientes.js). It was scheduled that morning, so
// everything is checked again: the switch, the economy, the hour (the bot may have been down), the group's own hours,
// that no other envelope is open, the day's cap, that the group is talking, and that there are spies to give it to
// and somebody to aim at. Returns the mission's id, or null.
export async function lanzarSobre(client, chat, ahora = new Date()) {
  const fila = getChat(chat);
  const h = ahora.getHours();
  if (fila?.espias !== 1 || fila.monedas === 0 || fila.grupoCerradoPorHorario) return null;
  if (h < ESPIA.DESDE_HORA || h >= ESPIA.HASTA_HORA) return null;
  if (misionAbierta(chat) || deHoy(chat, ahora.getTime()) >= ESPIA.MAX_DIA) return null;
  if (!grupoVivo(chat, ahora)) return null;
  const participants = (await metadataDe(client, chat))?.participants;
  if (!participants?.length) return null;
  const presentes = agentesDe(chat).filter((a) => enElGrupo(participants, a));
  if (presentes.length < ESPIA.MIN_AGENTES) return null;

  // Not whoever got this group's last one, so it goes around.
  const anterior = db.prepare(`SELECT agente, agente_jid FROM espias_misiones WHERE chat = ? ORDER BY id DESC LIMIT 1`).get(chat);
  const otros = anterior ? presentes.filter((a) => !mismaPersona(idsDeAgente(a), idsDeAgente(anterior))) : presentes;
  const agente = alAzar(otros.length ? otros : presentes);
  const objetivos = objetivosPosibles(chat, participants, enElGrupo(participants, agente), ahora.getTime());
  if (!objetivos.length) return null;
  const { objetivo, objetivo_jid } = alAzar(objetivos);
  const dificil = hayClasificador() && _dep.azar(100) < ESPIA.DIFICIL_CHANCE;
  const tipo = dificil ? alAzar(["vender", "comprar"]) : "palabra";
  const usadas = new Set(db.prepare(`SELECT palabra FROM espias_misiones WHERE chat = ? AND tipo = 'palabra' ORDER BY id DESC LIMIT ?`).all(chat, ESPIA.PALABRAS_SIN_REPETIR).map((r) => r.palabra));
  const palabra = dificil ? "" : alAzar(PALABRAS.filter((p) => !usadas.has(p)));
  const vence = ahora.getTime() + ESPIA.PLAZO_MIN * 60 * 1000;

  // Sent before it's stored: a send that fails leaves nothing open, and the pending work tries again.
  const texto = `📩 Llegó un sobre para ${agente.emoji}\n\n_Solo su dueño sabe quién es: me escribe .sobre por privado y tiene hasta las ${hora(vence)} para cumplir la misión. ¿Sospechan de alguien? .denunciar @persona: acertar paga ${ESPIA.RECOMPENSA} UruCoins y errar cuesta ${ESPIA.DENUNCIA_FALSA}, una denuncia por cabeza._`;
  const enviado = await client.sendMessage(chat, { text: texto });
  const id = Number(
    db
      .prepare(`INSERT INTO espias_misiones (chat, agente, agente_jid, emoji, tipo, palabra, objetivo, objetivo_jid, premio, mensaje_id, publicada, vence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(chat, agente.usuario, agente.jid || "", agente.emoji, tipo, palabra, objetivo, objetivo_jid, dificil ? ESPIA.PREMIO_DIFICIL : ESPIA.PREMIO, enviado?.key?.id || "", ahora.getTime(), vence).lastInsertRowid,
  );
  crearPendiente(chat, "bot", "espia_vence", { id }, vence);
  return id;
}

// ---------- the mission, in private ----------
// What the target has to do, as the group is told once it's over.
const loQueHabiaQueLograr = (mision) => (mision.tipo === "vender" ? `que ${mencion(mision.objetivo)} ofreciera vender algo` : mision.tipo === "comprar" ? `que ${mencion(mision.objetivo)} pidiera comprar algo` : `que ${mencion(mision.objetivo)} dijera «${mision.palabra}»`);

// The mission as its owner reads it in private. The target by name and not tagged: it's a private chat.
function textoMision(mision, grupo) {
  const quien = nombreDe(mision.objetivo);
  const encargo = ES_DIFICIL(mision.tipo)
    ? `lograr que *${quien}* ${mision.tipo === "vender" ? "ofrezca vender algo" : "pida comprar algo"} en el grupo (un mensaje suyo del estilo «${mision.tipo === "vender" ? "vendo la bici" : "busco una heladera"}»: lo que venda o busque es lo de menos, yo me doy cuenta sola). Es la difícil, por eso paga más`
    : `lograr que *${quien}* escriba la palabra *«${mision.palabra}»* en el grupo, sin decírsela vos. Vale en plural o en diminutivo. Si la escribís vos no pasa nada, pero no cuenta`;
  return `📩 *Sobre para ${mision.emoji}* · ${grupo}\n\nTu misión: ${encargo}.\n\n⏰ Tenés hasta las *${hora(mision.vence)}*.\n🪙 Si te sale, cobrás *${mision.premio} UruCoins* y lo cuento en el grupo.\n🚨 Si alguien te denuncia y acierta, perdés la misión y pagás ${ESPIA.MULTA}.\n\n_Este mensaje se autodestruirá en cinco segundos. Mentira, no me dio el presupuesto._`;
}

// .sobre: the open envelopes of whoever asks, in every group, each marked as opened the first time (what the target
// says counts from then on). Returns [{ mision, texto(grupo) }]: the plugin puts each group's name in.
export function abrirSobres(ids, ahora = Date.now()) {
  const suyos = agentesDeQuien(ids);
  const sobres = [];
  for (const fila of suyos) {
    const mision = misionAbierta(fila.chat);
    if (!mision || mision.vence <= ahora || !mismaPersona(idsDeAgente(mision), idsDeAgente(fila))) continue;
    if (!mision.abierta) db.prepare(`UPDATE espias_misiones SET abierta = ? WHERE id = ?`).run(ahora, mision.id);
    sobres.push({ mision, texto: (grupo) => textoMision(mision, grupo) });
  }
  return sobres;
}

// ---------- what the group says ----------
const CAYO = [
  "cayó como un chorlito",
  "entró como por un tubo",
  "pisó el palito sin mirar",
  "se la tragó doblada",
  "ni la vio venir",
];

// A message of the group, read for the open mission and nothing else (plugins/_espias.js): from the target, by any
// of their ids, once the spy has opened the envelope, saying the word in any of its forms (or reading as an offer or
// a request, for the hard one). From anybody else it's nothing: the spy writing the word themselves spoils nothing,
// and doesn't count. Returns what to tell the group, { texto, mentions }, or null.
export function leerMensaje(chat, quien, texto, ahora = Date.now()) {
  const mision = misionAbierta(chat);
  if (!mision || !mision.abierta || mision.vence <= ahora || !texto || esComando(texto)) return null;
  if (!mismaPersona(quien, [mision.objetivo, mision.objetivo_jid].filter(Boolean))) return null;
  const cumplida = ES_DIFICIL(mision.tipo) ? intencionDe(texto) === mision.tipo : diceLaPalabra(texto, mision.palabra);
  if (!cumplida) return null;
  db.transaction(() => {
    db.prepare(`UPDATE espias_misiones SET estado = 'cumplida' WHERE id = ?`).run(mision.id);
    ganarCoins(chat, mision.agente, mision.premio, "espia_mision");
  })();
  const quemado = cambiarEmoji(mision);
  const lineas = [
    `🕵️ *¡Misión cumplida!* ${mision.emoji} era ${mencion(mision.agente)}.`,
    `Tenía hasta las ${hora(mision.vence)} para lograr ${loQueHabiaQueLograr(mision)}, y ${mencion(mision.objetivo)} ${alAzar(CAYO)}.`,
    `🪙 ${mencion(mision.agente)} cobra *${mision.premio} UruCoins*.`,
  ];
  if (quemado) lineas.push(QUEMADO(mision.emoji));
  return { texto: lineas.join("\n"), mentions: [mision.agente, mision.objetivo] };
}

// .denunciar [emoji] @persona: someone says who the spy of the open envelope is. Right: the spy loses the mission and
// pays the fine (what they have, if less) and the reporter is paid. Wrong: the reporter pays, and has to have it to
// report at all. Once each per envelope. Reporting oneself is refused whoever asks, so the answer tells nothing.
// Returns { ok, texto, mentions, acerto } or { ok: false, error }.
export function denunciar(chat, denunciante, acusado, emoji = null, ahora = Date.now()) {
  const mision = misionAbierta(chat);
  if (!mision || mision.vence <= ahora) return { ok: false, error: "No hay ningún sobre abierto ahora: no hay a quién denunciar." };
  if (emoji && emoji !== mision.emoji) return { ok: false, error: `El sobre que anda dando vueltas es el de ${mision.emoji}, no el de ${emoji}.` };
  const quien = [].concat(denunciante).filter(Boolean);
  if (mismaPersona(quien, acusado)) return { ok: false, error: "Denunciarte a vos no vale: eso es entregarse, y acá no se entrega nadie." };
  if (esElBot(acusado)) return { ok: false, error: "¿Yo, espía? Yo soy la que reparte los sobres, che." };
  if (db.prepare(`SELECT 1 FROM espias_denuncias WHERE mision = ? AND denunciante IN (${marcas(quien)})`).get(mision.id, ...quien)) return { ok: false, error: "Ya gastaste tu denuncia en este sobre: es una por cabeza." };
  const paga = quien[0];
  if (getSaldoCoins(chat, paga) < ESPIA.DENUNCIA_FALSA) return { ok: false, error: `Para denunciar hay que tener ${ESPIA.DENUNCIA_FALSA} UruCoins encima, por si le errás.` };

  const acerto = mismaPersona(acusado, idsDeAgente(mision));
  let multa = 0;
  db.transaction(() => {
    db.prepare(`INSERT OR IGNORE INTO espias_denuncias (mision, denunciante) VALUES (?, ?)`).run(mision.id, paga);
    if (!acerto) return gastarCoins(chat, paga, ESPIA.DENUNCIA_FALSA, "espia_denuncia_falsa");
    db.prepare(`UPDATE espias_misiones SET estado = 'denunciada' WHERE id = ?`).run(mision.id);
    multa = Math.min(ESPIA.MULTA, getSaldoCoins(chat, mision.agente));
    if (multa > 0) moverCoins(chat, mision.agente, -multa, "espia_multa");
    ganarCoins(chat, paga, ESPIA.RECOMPENSA, "espia_denuncia");
  })();
  if (!acerto) return { ok: true, acerto: false, texto: `❌ Le erraste: ${mencion(acusado)} no es ${mision.emoji}. Acusar en falso sale *${ESPIA.DENUNCIA_FALSA} UruCoins*, ${mencion(paga)}.\n${mision.emoji} sigue suelto, y se debe estar riendo.`, mentions: [acusado, paga] };

  const quemado = cambiarEmoji(mision);
  const lineas = [
    `🚨 *¡Espía desenmascarado!* ${mencion(paga)} acertó: ${mision.emoji} era ${mencion(mision.agente)}.`,
    `Su misión era lograr ${loQueHabiaQueLograr(mision)} antes de las ${hora(mision.vence)}. Se terminó el operativo.`,
    `🪙 ${mencion(mision.agente)} paga ${multa > 0 ? `*${multa} UruCoins* de multa` : "la multa con la cara, porque no tiene un peso"} y ${mencion(paga)} cobra *${ESPIA.RECOMPENSA}*.`,
  ];
  if (quemado) lineas.push(QUEMADO(mision.emoji));
  return { ok: true, acerto: true, texto: lineas.join("\n"), mentions: [paga, mision.agente, mision.objetivo] };
}

const BURLAS = [
  "James Bond no era.",
  "Lo mandaron a espiar y se quedó mirando el celular.",
  "El Superagente 86 lo hubiera hecho mejor, y con un zapato.",
  "Queda en observación: una más así y lo mando a repartir volantes.",
];

// The pending work of a mission (lib/pendientes.js), at its deadline: still open, it failed. The group is told what
// it was, and who the spy was only with ESPIA.REVELAR_AL_FALLAR. null when it was over already.
export function vencerMision(id, ahora = Date.now()) {
  const mision = porId(id);
  if (!mision || mision.estado !== "abierta" || mision.vence > ahora) return null;
  db.prepare(`UPDATE espias_misiones SET estado = 'vencida' WHERE id = ?`).run(mision.id);
  const lineas = [];
  const mentions = [];
  if (!mision.abierta) lineas.push(`📭 ${mision.emoji} ni abrió el sobre: venció y sigue cerrado arriba de la mesa. Agente dormido.`);
  else {
    lineas.push(`⌛ Se le acabó el tiempo a ${mision.emoji}: tenía que lograr ${loQueHabiaQueLograr(mision)} y no hubo caso. ${alAzar(BURLAS)}`);
    mentions.push(mision.objetivo);
  }
  if (ESPIA.REVELAR_AL_FALLAR) {
    lineas.push(`Y ${mision.emoji} era ${mencion(mision.agente)}.`);
    mentions.push(mision.agente);
    if (cambiarEmoji(mision)) lineas.push(QUEMADO(mision.emoji));
  } else lineas.push(`¿Quién es ${mision.emoji}? Eso queda entre ${mision.emoji} y yo.`);
  return { texto: lineas.join("\n"), mentions };
}

// .espias off: the open envelope, if any, is void. Returns its emoji, or null.
export function anularMision(chat) {
  const mision = misionAbierta(chat);
  if (!mision) return null;
  db.prepare(`UPDATE espias_misiones SET estado = 'anulada' WHERE id = ?`).run(mision.id);
  return mision.emoji;
}

// ---------- .espias ----------
// How the game stands in the group: the switch, how many are signed up (never who), the open envelope and how it's
// played.
export function textoEspias(chat, ahora = Date.now()) {
  const prendido = getChat(chat)?.espias === 1;
  const mision = misionAbierta(chat);
  const agentes = agentesDe(chat).length;
  const partes = [];
  if (mision && mision.vence > ahora) partes.push(`📩 Hay un sobre abierto: el de ${mision.emoji}, que tiene hasta las ${hora(mision.vence)}. ¿Sospechan de alguien? .denunciar @persona (acertar paga ${ESPIA.RECOMPENSA}, errar cuesta ${ESPIA.DENUNCIA_FALSA}, una denuncia por cabeza).`);
  else partes.push("🕵️ Ahora no hay ningún sobre dando vueltas.");
  const como = `Quien quiera jugar me escribe *por privado* .espia y le doy un emoji secreto. Cada tanto aviso acá «📩 Llegó un sobre para 🦊»: el dueño de ese emoji me pide la misión por privado con .sobre, y casi siempre es lograr que alguien del grupo diga una palabra antes de cierta hora, sin decírsela. Si le sale cobra ${ESPIA.PREMIO} UruCoins (${ESPIA.PREMIO_DIFICIL} la difícil); si lo denuncian y aciertan, paga ${ESPIA.MULTA}.`;
  const cuando = `a lo sumo ${ESPIA.MAX_DIA === 1 ? "un sobre" : `${ESPIA.MAX_DIA} sobres`} por día, de ${ESPIA.DESDE_HORA} a ${ESPIA.HASTA_HORA} y solo si el grupo está charlando`;
  if (prendido) partes.push(`La misión secreta está *prendida* (${cuando}). ${agentes === 0 ? "Todavía no se anotó nadie" : agentes === 1 ? "Hay 1 espía anotado" : `Hay ${agentes} espías anotados`}${agentes < ESPIA.MIN_AGENTES ? `, y hacen falta ${ESPIA.MIN_AGENTES} para que empiecen a llegar sobres` : ""}. Un admin la apaga con .espias off`);
  else partes.push(`La misión secreta está *apagada*. Un admin la prende con .espias on (${cuando}).`);
  partes.push(como);
  return partes.join("\n\n");
}
