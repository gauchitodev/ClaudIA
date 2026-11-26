// Urgent errands (encargo urgente): everything in the group, nothing in private. In the groups that switched them on
// (.encargos on), now and then Claudia tags someone who's been talking and hands them an urgent errand of THEIR trade
// (lib/laburos.js; one for anybody, for whoever has none), with a real deadline and two or three ways to go about it,
// each with its own chance and prize, all of it in the bank (lib/encargos-banco.js). They choose with the number or
// with .ruta 2. While it runs, the rest of the group can bet on whether they make it (.apuesto si 50), help (.ayudo
// 30: coins that raise the chance) or sabotage (.saboteo 30: coins that lower it, and a fine if they're caught). At
// the deadline the outcome is rolled, Claudia tells how it went, naming who helped and who sabotaged, and everybody
// is paid. With no way chosen in time it goes by the worst one.
// It builds on what was there: scheduled and posted as the changas and the secret missions are (once a day's worth of
// pending work per group, checked again at the time), and the bets are a betting market (lib/mercados.js) of two
// options that this module resolves, so the pot, the payout and .apuestas are the ones people know.
// So it isn't spam: off unless the group asks for it, at most ENCARGO.MAX_DIA a day inside the hours, one at a time,
// only to a group that is talking and only to someone who wrote in the last while.
// Nobody gets the same errand twice until they've had all of their trade's. How many times each one went out is
// counted (encargos_usos), and once a month the owner is told which ones are worn (recordatorioDeEncargos, sent along
// with the weekly backup, lib/backup.js).
// Every number is in ENCARGO. The tables are in database-schema.js.
import { randomInt } from "crypto";
import { db, getChat, ganarCoins, gastarCoins, getSaldoCoins, moverCoins, chatsConOpcion, periodoCerrado, marcarPeriodoCerrado, crearPendiente, totalMensajesEntre, mensajesPorHora, crearMercado, apuestasDeMercado } from "../database-functions.js";
import { OFICIOS, laburoDe, nombreDeOficio } from "./laburos.js";
import { generoDe } from "./genero.js";
import { monedasActivas } from "./urucoins.js";
import { claveDia } from "./actividad.js";
import { metadataDe } from "./cache-grupos.js";
import { buscarEnGrupo, identidadDelGrupo, esElBot, mismaPersona, lidDe } from "./identidad.js";
import { jugar, resolverPorPartido, anularPorPartido } from "./mercados.js";
import { ENCARGOS, ENCARGOS_GENERALES } from "./encargos-banco.js";

export const ENCARGO = {
  // when they go out
  MAX_DIA: 2, // at most this many a day per group; the day's hours are split in as many stretches, one in each
  PROBABILIDAD: 0.6, // odds of each of them being scheduled (with 2 and 0.6, about 1.2 a day)
  DESDE_HORA: 10, // they go out from 10:00 to 20:59, so the last one is over by 22:00
  HASTA_HORA: 21,
  MENSAJES_AYER: 30, // messages the group needs from the day before for any to be scheduled
  VIVO_MENSAJES: 5, // and in this hour and the one before for one to go out: no posting to a quiet group
  ACTIVO_MIN: 30, // whoever gets it wrote in the group in the last this many minutes: they're around to answer
  PLAZO_MIN: 60, // the deadline: the way is chosen, and the group bets, helps and sabotages, until then
  // helping and sabotaging
  APORTE_MIN: 10, // the least one puts in at a time
  APORTE_PASO: 10, // every this many coins on a side move the chance one point
  APORTE_MAX: 100, // the most one person puts into one errand (10 points)
  APORTE_TOPE: 25, // the most points each side can move, whatever it puts in
  AYUDA_PROPINA: 0.25, // when the errand is done, whoever helped gets their coins back and this much more
  DESCUBRIR_CHANCE: 40, // % of each saboteur being caught, rolled one by one at the deadline
  MULTA: 1, // caught, they pay this many times what they put in, again, to whoever had the errand
  CHANCE_MIN: 5, // the chance after help and sabotage stays inside these
  CHANCE_MAX: 95,
  // What the bank has to keep to (test/encargos-banco.test.mjs): each way's chance and prize, and what it pays on
  // average (chance × prize), so no way is a gift or a robbery.
  BANCO_CHANCE_MIN: 25,
  BANCO_CHANCE_MAX: 90,
  BANCO_PREMIO_MIN: 50,
  BANCO_PREMIO_MAX: 320,
  BANCO_VALOR_MIN: 55,
  BANCO_VALOR_MAX: 100,
};

// The dice, here so the tests can load them.
export const _dep = { azar: (n) => randomInt(0, n) };
const alAzar = (lista) => lista[_dep.azar(lista.length)];

const NUMEROS = ["1️⃣", "2️⃣", "3️⃣"];
const EMOJI_GENERAL = "📦";
export const OPCIONES_APUESTA = ["Sí llega", "No llega"];
const mencion = (id) => `@${String(id).split("@")[0]}`;
const enLista = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}` : xs[0] || "");
const hora = (ms) => new Date(ms).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false });
const acotar = (n) => Math.max(ENCARGO.CHANCE_MIN, Math.min(ENCARGO.CHANCE_MAX, n));

// ---------- the bank ----------
// Every errand with its key: "camionero/sobre-a-rivera", "general/mate-para-la-suegra".
export const clavesDe = (oficio) => (ENCARGOS[oficio] || []).map((e) => `${oficio}/${e.id}`);
export const CLAVES_GENERALES = ENCARGOS_GENERALES.map((e) => `general/${e.id}`);
export const todasLasClaves = () => [...Object.keys(ENCARGOS).flatMap(clavesDe), ...CLAVES_GENERALES];

// An errand by its key, or null if the bank no longer has it.
export function buscarEncargo(clave) {
  const [grupo, id] = String(clave || "").split("/");
  return (grupo === "general" ? ENCARGOS_GENERALES : ENCARGOS[grupo] || []).find((e) => e.id === id) || null;
}
const emojiDe = (clave) => OFICIOS[String(clave).split("/")[0]]?.emoji || EMOJI_GENERAL;

// The worst way: the one least likely to work (the last of them, on a tie). It's the one taken when none is chosen.
export function peorCamino(encargo) {
  return encargo.caminos.reduce((peor, c) => (c.chance <= peor.chance ? c : peor));
}

// ---------- the tables ----------
const porId = (id) => db.prepare(`SELECT * FROM encargos WHERE id = ?`).get(id) || null;
export const encargoAbierto = (chat) => db.prepare(`SELECT * FROM encargos WHERE chat = ? AND estado = 'abierto' ORDER BY id DESC LIMIT 1`).get(chat) || null;
const aportesDe = (id) => db.prepare(`SELECT usuario, tipo, cantidad FROM encargos_aportes WHERE encargo = ? ORDER BY rowid`).all(id);
const inicioDelDia = (ahora) => new Date(ahora).setHours(0, 0, 0, 0);
const deHoy = (chat, ahora) => db.prepare(`SELECT COUNT(*) AS n FROM encargos WHERE chat = ? AND creada >= ?`).get(chat, inicioDelDia(ahora)).n;
const idsDe = (e) => [e.usuario, e.usuario_jid].filter(Boolean);
const marcas = (ids) => ids.map(() => "?").join(", ");
const esSuyo = (e, quien) => mismaPersona([].concat(quien).filter(Boolean), idsDe(e));

// The points each side has moved the chance: its coins by APORTE_PASO, up to APORTE_TOPE.
function puntos(aportes) {
  const de = (tipo) => Math.min(ENCARGO.APORTE_TOPE, Math.floor(aportes.filter((a) => a.tipo === tipo).reduce((s, a) => s + a.cantidad, 0) / ENCARGO.APORTE_PASO));
  return { ayuda: de("ayuda"), sabotaje: de("sabotaje") };
}

// ---------- who gets it, and which one ----------
// Whoever wrote in the group in the last ACTIVO_MIN minutes (presencia_grupo, which .inactivos keeps) and is still
// in it, but for Claudia. Each person once, by both ids the group gives them.
function activos(chat, participants, ahora) {
  const desde = ahora - ENCARGO.ACTIVO_MIN * 60 * 1000;
  const vistos = new Set();
  const lista = [];
  for (const { usuario } of db.prepare(`SELECT usuario FROM presencia_grupo WHERE chat = ? AND ultimo_mensaje >= ? ORDER BY usuario`).all(chat, desde)) {
    const p = buscarEnGrupo(participants, usuario.endsWith("@lid") ? { lid: usuario } : { jid: usuario });
    if (!p || vistos.has(p) || esElBot(p)) continue;
    vistos.add(p);
    const { lid, jid } = identidadDelGrupo(p);
    lista.push({ usuario: lid || lidDe(p.id, participants), usuario_jid: jid || "" });
  }
  return lista;
}

// Their trade in that group, by either id, or null.
const oficioDe = (chat, persona) => idsDe(persona).map((id) => laburoDe(chat, id)).find(Boolean)?.laburo || null;

// The errand for them: one of their trade's (of the general ones with no trade) among those they've had the fewest
// times, so none repeats until they've had them all; and, with a choice, not the one this group got last.
export function sortearEncargo(chat, persona) {
  const oficio = oficioDe(chat, persona);
  const claves = oficio && clavesDe(oficio).length ? clavesDe(oficio) : CLAVES_GENERALES;
  const ids = idsDe(persona);
  const veces = new Map(db.prepare(`SELECT clave, COUNT(*) AS n FROM encargos WHERE usuario IN (${marcas(ids)}) OR usuario_jid IN (${marcas(ids)}) GROUP BY clave`).all(...ids, ...ids).map((r) => [r.clave, r.n]));
  const menos = Math.min(...claves.map((c) => veces.get(c) || 0));
  let candidatas = claves.filter((c) => (veces.get(c) || 0) === menos);
  const ultima = db.prepare(`SELECT clave FROM encargos WHERE chat = ? ORDER BY id DESC LIMIT 1`).get(chat)?.clave;
  if (candidatas.length > 1) candidatas = candidatas.filter((c) => c !== ultima);
  return alAzar(candidatas);
}

// ---------- posting one ----------
// Schedules the day's errands, once a day per group, as the changas are (lib/changas.js): the hours are split in
// MAX_DIA stretches and each one is rolled for, at a random moment of its own stretch. Only in groups that talked the
// day before. Runs every 5 minutes from tareas-programadas.js.
export function programarEncargosDelDia(ahora = new Date()) {
  if (ahora.getHours() < ENCARGO.DESDE_HORA) return 0;
  const hoy = claveDia(ahora);
  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  let agendados = 0;
  for (const chat of chatsConOpcion("encargos")) {
    if (!monedasActivas(chat)) continue; // not marked done: with the economy back on, the next pass schedules it
    if (periodoCerrado(chat, "encargos_prog", hoy)) continue;
    marcarPeriodoCerrado(chat, "encargos_prog", hoy);
    if (totalMensajesEntre(chat, [claveDia(ayer)]) < ENCARGO.MENSAJES_AYER) continue;
    const abre = new Date(ahora).setHours(ENCARGO.DESDE_HORA, 0, 0, 0);
    const cierra = new Date(ahora).setHours(ENCARGO.HASTA_HORA, 0, 0, 0);
    const tramo = (cierra - abre) / ENCARGO.MAX_DIA;
    for (let i = 0; i < ENCARGO.MAX_DIA; i++) {
      const inicio = Math.max(ahora.getTime() + 60 * 1000, abre + i * tramo);
      const fin = abre + (i + 1) * tramo;
      if (fin <= inicio || Math.random() > ENCARGO.PROBABILIDAD) continue;
      crearPendiente(chat, "bot", "encargo_urgente", {}, inicio + Math.floor(Math.random() * (fin - inicio)));
      agendados++;
    }
  }
  return agendados;
}

// Is the group talking right now? Its messages of this hour and the one before (plugins/_actividad-horaria.js).
function grupoVivo(chat, ahora) {
  const h = ahora.getHours();
  const porHora = new Map(mensajesPorHora(chat, [claveDia(ahora)]).map((r) => [r.hora, r.total]));
  return (porHora.get(h) || 0) + (porHora.get(h - 1) || 0) >= ENCARGO.VIVO_MENSAJES;
}

const porcentaje = (c) => `${c.chance} % · paga ${c.premio}`;

function textoAnuncio({ persona, clave, encargo, oficio, vence, conApuestas }) {
  const deOficio = oficio ? ` (${nombreDeOficio(OFICIOS[oficio], generoDe(persona.usuario)).toLowerCase()})` : "";
  const caminos = encargo.caminos.map((c, i) => `${NUMEROS[i]} ${c.nombre} — _${porcentaje(c)}_`).join("\n");
  const apuestas = conApuestas ? `.apuesto si 50 o .apuesto no 50 a que llega o no · ` : "";
  return [
    `🚨 *ENCARGO URGENTE* para ${mencion(persona.usuario)}${deOficio} — ${emojiDe(clave)} ${encargo.titulo}`,
    encargo.texto,
    caminos,
    `⏳ ${mencion(persona.usuario)}: tenés hasta las *${hora(vence)}*. Elegí camino con el número (o .ruta ${encargo.caminos.length > 2 ? 2 : 1}); si no elegís, vas por el peor y con el premio más chico. El porcentaje es la chance de que salga bien y lo otro, los UruCoins que cobrás si sale.`,
    `_Los demás, hasta esa hora: ${apuestas}.ayudo 30 le sube la chance (si llega, recuperás lo tuyo y un ${Math.round(ENCARGO.AYUDA_PROPINA * 100)} % más) · .saboteo 30 se la baja (y si te pescan, pagás multa)._`,
  ].join("\n\n");
}

// Called by the pending-work processor at the scheduled time (lib/pendientes.js). It was scheduled that morning, so
// everything is checked again: the switch, the economy, the hour (the bot may have been down), the group's own hours,
// that no other errand is open, the day's cap, that the group is talking and that somebody who wrote lately is there
// to get it. Returns the errand's id, or null.
export async function lanzarEncargo(client, chat, ahora = new Date()) {
  const fila = getChat(chat);
  const h = ahora.getHours();
  if (fila?.encargos !== 1 || fila.monedas === 0 || fila.grupoCerradoPorHorario) return null;
  if (h < ENCARGO.DESDE_HORA || h >= ENCARGO.HASTA_HORA) return null;
  if (encargoAbierto(chat) || deHoy(chat, ahora.getTime()) >= ENCARGO.MAX_DIA) return null;
  if (!grupoVivo(chat, ahora)) return null;
  const participants = (await metadataDe(client, chat))?.participants;
  if (!participants?.length) return null;
  const presentes = activos(chat, participants, ahora.getTime());
  if (!presentes.length) return null;

  // Not whoever got this group's last one, so it goes around.
  const anterior = db.prepare(`SELECT usuario, usuario_jid FROM encargos WHERE chat = ? ORDER BY id DESC LIMIT 1`).get(chat);
  const otros = anterior ? presentes.filter((p) => !mismaPersona(idsDe(p), idsDe(anterior))) : presentes;
  const persona = alAzar(otros.length ? otros : presentes);
  const clave = sortearEncargo(chat, persona);
  const encargo = buscarEncargo(clave);
  const vence = ahora.getTime() + ENCARGO.PLAZO_MIN * 60 * 1000;
  const conApuestas = fila.casino !== 0;

  // Sent before it's stored: a send that fails leaves nothing open, and the pending work tries again.
  const texto = textoAnuncio({ persona, clave, encargo, oficio: oficioDe(chat, persona), vence, conApuestas });
  const enviado = await client.sendMessage(chat, { text: texto, mentions: [persona.usuario] });
  let id = null;
  db.transaction(() => {
    // The bets: a market of two options, closed at the deadline and resolved here, with no closing notice of its
    // own (that's why it isn't opened with abrirMercado). Its creator is whoever has the errand: they can't bet.
    const mercado = conApuestas ? crearMercado(chat, `Encargo urgente: ${encargo.titulo}`, OPCIONES_APUESTA, vence, persona.usuario, { tipo: "encargo" }) : 0;
    id = Number(
      db
        .prepare(`INSERT INTO encargos (chat, usuario, usuario_jid, clave, mercado, mensaje_id, creada, vence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(chat, persona.usuario, persona.usuario_jid, clave, Number(mercado) || 0, enviado?.key?.id || "", ahora.getTime(), vence).lastInsertRowid,
    );
    db.prepare(`INSERT INTO encargos_usos (clave, veces, ultima) VALUES (?, 1, ?) ON CONFLICT(clave) DO UPDATE SET veces = veces + 1, ultima = excluded.ultima`).run(clave, ahora.getTime());
    crearPendiente(chat, "bot", "encargo_vence", { id }, vence);
  })();
  return id;
}

// ---------- choosing the way ----------
// Whether that person has the group's open errand and hasn't chosen yet: then a bare number of theirs is the answer
// (plugins/_encargos.js). Returns the errand's row, or null.
export function esperaCamino(chat, quien, ahora = Date.now()) {
  const e = encargoAbierto(chat);
  return e && !e.camino && e.vence > ahora && esSuyo(e, quien) ? e : null;
}

// .ruta 2, or the bare number: the way they go by. Once chosen it stays, since the group bets on it. Returns { ok,
// texto, mentions } or { ok: false, error }; null with no errand open in the group.
export function elegirCamino(chat, quien, numero, ahora = Date.now()) {
  const e = encargoAbierto(chat);
  if (!e || e.vence <= ahora) return null;
  if (!esSuyo(e, quien)) return { ok: false, error: `El encargo es de ${mencion(e.usuario)}: el camino lo elige quien lo tiene. Vos podés apostar, ayudar o sabotear.`, mentions: [e.usuario] };
  const encargo = buscarEncargo(e.clave);
  if (!encargo) return { ok: false, error: "Ese encargo ya no está en mi lista: se resuelve solo a la hora." };
  if (e.camino) return { ok: false, error: `Ya elegiste: vas por «${encargo.caminos[e.camino - 1].nombre}». No hay marcha atrás, que hay gente apostando.` };
  const camino = encargo.caminos[numero - 1];
  if (!Number.isInteger(numero) || !camino) return { ok: false, error: `Los caminos van del 1 al ${encargo.caminos.length}.` };
  db.prepare(`UPDATE encargos SET camino = ? WHERE id = ?`).run(numero, e.id);
  const { ayuda, sabotaje } = puntos(aportesDe(e.id));
  const va = acotar(camino.chance + ayuda - sabotaje);
  const movida = ayuda || sabotaje ? ` Con lo que ya pusieron los demás, va en ${va} %.` : "";
  return {
    ok: true,
    texto: `${emojiDe(e.clave)} ${mencion(e.usuario)} va por el camino ${numero}: *${camino.nombre}* (${porcentaje(camino)}).${movida}\nSe sabe cómo le fue a las ${hora(e.vence)}. Hasta entonces: ${e.mercado ? ".apuesto si|no <cuánto>, " : ""}.ayudo <cuánto> o .saboteo <cuánto>.`,
    mentions: [e.usuario],
  };
}

// ---------- helping and sabotaging ----------
// .ayudo 30 / .saboteo 30: coins put into the open errand, spent now. Each person on one side only, up to APORTE_MAX
// in all, and each side moves the chance up to APORTE_TOPE points: what doesn't fit isn't taken. Returns { ok, texto,
// mentions } or { ok: false, error }.
export function aportar(chat, quien, tipo, cantidad, ahora = Date.now()) {
  const e = encargoAbierto(chat);
  if (!e || e.vence <= ahora) return { ok: false, error: "No hay ningún encargo corriendo ahora." };
  const ids = [].concat(quien).filter(Boolean);
  const ayuda = tipo === "ayuda";
  if (esSuyo(e, ids)) return { ok: false, error: ayuda ? "El encargo es tuyo: la mano te la tienen que dar los demás." : "¿Sabotearte a vos? Para eso alcanza con no elegir camino." };
  if (!Number.isInteger(cantidad) || cantidad < ENCARGO.APORTE_MIN) return { ok: false, error: `Se pone de a ${ENCARGO.APORTE_MIN} UruCoins o más: cada ${ENCARGO.APORTE_PASO} ${ayuda ? "suben" : "bajan"} un punto la chance. Por ejemplo: .${ayuda ? "ayudo" : "saboteo"} 30` };
  const aportes = aportesDe(e.id);
  const previo = aportes.find((a) => ids.includes(a.usuario));
  if (previo && previo.tipo !== tipo) return { ok: false, error: previo.tipo === "ayuda" ? "Ya le diste una mano en este encargo: no se puede ayudar y sabotear a la vez." : "Ya lo estás saboteando: no se puede sabotear y ayudar a la vez." };
  const paga = previo?.usuario || ids[0];
  const delLado = aportes.filter((a) => a.tipo === tipo).reduce((s, a) => s + a.cantidad, 0);
  const lugarPersona = ENCARGO.APORTE_MAX - (previo?.cantidad || 0);
  const lugarLado = ENCARGO.APORTE_TOPE * ENCARGO.APORTE_PASO - delLado;
  if (lugarPersona <= 0) return { ok: false, error: `Ya pusiste ${ENCARGO.APORTE_MAX} UruCoins en este encargo, que es el tope por persona.` };
  if (lugarLado <= 0) return { ok: false, error: ayuda ? `Ya no entra más ayuda: entre todos le subieron los ${ENCARGO.APORTE_TOPE} puntos que se pueden.` : `Ya no entra más sabotaje: entre todos le bajaron los ${ENCARGO.APORTE_TOPE} puntos que se pueden.` };
  const pone = Math.min(cantidad, lugarPersona, lugarLado);
  let hecho = false;
  db.transaction(() => {
    if (!gastarCoins(chat, paga, pone, ayuda ? "encargo_ayuda" : "encargo_sabotaje")) return;
    db.prepare(`INSERT INTO encargos_aportes (encargo, usuario, tipo, cantidad) VALUES (?, ?, ?, ?) ON CONFLICT(encargo, usuario) DO UPDATE SET cantidad = cantidad + excluded.cantidad`).run(e.id, paga, tipo, pone);
    hecho = true;
  })();
  if (!hecho) return { ok: false, error: `No te alcanza: tenés ${getSaldoCoins(chat, paga)} UruCoins.` };

  const encargo = buscarEncargo(e.clave);
  const pts = puntos(aportesDe(e.id));
  const camino = e.camino && encargo ? encargo.caminos[e.camino - 1] : null;
  const va = camino ? ` Va en ${acotar(camino.chance + pts.ayuda - pts.sabotaje)} %.` : "";
  const total = (previo?.cantidad || 0) + pone;
  const menos = pone < cantidad ? ` (de los ${cantidad}, entraron ${pone}: hasta ahí llega el tope)` : "";
  const lleva = previo ? `, y ya lleva ${total}` : "";
  const texto = ayuda
    ? `🤝 ${mencion(paga)} puso *${pone} UruCoins* para darle una mano a ${mencion(e.usuario)}${lleva}${menos}. Entre todos le suben ${pts.ayuda} ${pts.ayuda === 1 ? "punto" : "puntos"} la chance.${va}\n_Si llega, recupera lo suyo y un ${Math.round(ENCARGO.AYUDA_PROPINA * 100)} % más; si no, lo pierde._`
    : `🐀 ${mencion(paga)} puso *${pone} UruCoins* para complicarle el encargo a ${mencion(e.usuario)}${lleva}${menos}. Entre todos le bajan ${pts.sabotaje} ${pts.sabotaje === 1 ? "punto" : "puntos"} la chance.${va}\n_A la hora se sortea si se descubre: ${ENCARGO.DESCUBRIR_CHANCE} % de que sí, y entonces paga ${total * ENCARGO.MULTA} de multa, que van para ${mencion(e.usuario)}._`;
  return { ok: true, texto, mentions: [paga, e.usuario], puso: pone };
}

// ---------- betting ----------
// .apuesto si 50 / .apuesto no 50: a bet in the errand's market (lib/mercados.js), on the first option or the
// second. Whoever has the errand can't bet on it. Returns { ok, mensaje } or { ok: false, error }, as jugar does.
export function apostarAlEncargo(chat, quien, llega, cantidad, ahora = Date.now()) {
  const e = encargoAbierto(chat);
  if (!e || e.vence <= ahora) return { ok: false, error: "No hay ningún encargo corriendo ahora: no hay a qué apostarle." };
  const ids = [].concat(quien).filter(Boolean);
  if (esSuyo(e, ids)) return { ok: false, error: "El encargo es tuyo: a tu propia suerte no se le apuesta." };
  if (!e.mercado) return { ok: false, error: "En este encargo no hay apuestas: salió con el casino apagado." };
  return jugar(chat, ids[0], e.mercado, llega ? "1" : "2", cantidad);
}

// ---------- the deadline ----------
// Everything put in goes back and the bets are void: an errand the bank no longer has, or .encargos off.
function anular(e, motivo) {
  const aportes = aportesDe(e.id);
  let apuestas = null;
  db.transaction(() => {
    db.prepare(`UPDATE encargos SET estado = 'anulado' WHERE id = ?`).run(e.id);
    for (const a of aportes) ganarCoins(e.chat, a.usuario, a.cantidad, "encargo_devolucion");
    if (e.mercado) apuestas = anularPorPartido(e.mercado, motivo);
  })();
  const lineas = [`🚫 El encargo urgente de ${mencion(e.usuario)} quedó sin efecto. ${motivo}`];
  if (aportes.length) lineas.push(`A ${enLista(aportes.map((a) => mencion(a.usuario)))} ${aportes.length === 1 ? "le vuelve" : "les vuelve"} lo que ${aportes.length === 1 ? "puso" : "pusieron"}.`);
  const conApuestas = apuestas?.mentions?.length > 0;
  if (conApuestas) lineas.push(apuestas.texto);
  return { texto: lineas.join("\n"), mentions: [e.usuario, ...aportes.map((a) => a.usuario), ...(conApuestas ? apuestas.mentions : [])] };
}

// .encargos off: the open errand, if any, is void. Returns what to tell the group, or null.
export function anularEncargo(chat) {
  const e = encargoAbierto(chat);
  return e ? anular(e, "Se apagaron los encargos en el grupo.") : null;
}

const conMonto = (xs) => enLista(xs.map((a) => `${mencion(a.usuario)} (${a.cantidad})`));

// The pending work of an errand (lib/pendientes.js), at its deadline: the outcome is rolled at the chance of the way
// chosen (the worst one, with the smallest prize, if none was) moved by what the group put in; the prize is paid,
// whoever helped gets theirs back with the tip when it went well, each saboteur is rolled for and the ones caught
// pay the fine to whoever had the errand, and the bets are paid. Returns what to tell the group, { texto, mentions },
// or null when it was over already.
export function vencerEncargo(id, ahora = Date.now()) {
  const e = porId(id);
  if (!e || e.estado !== "abierto" || e.vence > ahora) return null;
  const encargo = buscarEncargo(e.clave);
  if (!encargo) return anular(e, "Ya no lo tengo en mi lista.");

  const elegido = e.camino ? encargo.caminos[e.camino - 1] : null;
  const camino = elegido || peorCamino(encargo);
  const premio = elegido ? camino.premio : Math.min(...encargo.caminos.map((c) => c.premio));
  const aportes = aportesDe(e.id);
  const ayudas = aportes.filter((a) => a.tipo === "ayuda");
  const sabotajes = aportes.filter((a) => a.tipo === "sabotaje");
  const pts = puntos(aportes);
  const chance = acotar(camino.chance + pts.ayuda - pts.sabotaje);
  const salioBien = _dep.azar(100) < chance;
  const pescados = sabotajes.filter(() => _dep.azar(100) < ENCARGO.DESCUBRIR_CHANCE);

  const multas = new Map();
  let apuestas = null;
  db.transaction(() => {
    db.prepare(`UPDATE encargos SET estado = ?, chance = ?, premio = ? WHERE id = ?`).run(salioBien ? "cumplido" : "fallido", chance, salioBien ? premio : 0, e.id);
    if (salioBien) {
      ganarCoins(e.chat, e.usuario, premio, "encargo_premio");
      for (const a of ayudas) ganarCoins(e.chat, a.usuario, Math.round(a.cantidad * (1 + ENCARGO.AYUDA_PROPINA)), "encargo_ayuda_vuelta");
    }
    // The fine is what they have, if it's less: nobody goes below zero for it.
    for (const a of pescados) {
      const multa = Math.min(a.cantidad * ENCARGO.MULTA, getSaldoCoins(e.chat, a.usuario));
      multas.set(a.usuario, multa);
      if (multa > 0) {
        moverCoins(e.chat, a.usuario, -multa, "encargo_multa");
        ganarCoins(e.chat, e.usuario, multa, "encargo_multa_cobrada");
      }
    }
    if (e.mercado) apuestas = resolverPorPartido(e.mercado, salioBien ? 0 : 1, "");
  })();

  const quien = mencion(e.usuario);
  const cuenta = [`${camino.chance} del camino`, ...(pts.ayuda ? [`+${pts.ayuda} de ayuda`] : []), ...(pts.sabotaje ? [`−${pts.sabotaje} de sabotaje`] : [])];
  const lineas = [`⏰ *Se cumplió el plazo del encargo de ${quien}* — ${emojiDe(e.clave)} ${encargo.titulo}`];
  lineas.push(elegido ? `Fue por el camino ${e.camino}: *${camino.nombre}*.` : `No eligió camino a tiempo, así que fue por el peor: *${camino.nombre}*, y con el premio más chico.`);
  lineas.push(`🎲 Chance de que saliera bien: *${chance} %*${cuenta.length > 1 ? ` (${cuenta.join(", ")})` : ""}.`);
  lineas.push("");
  lineas.push(`${salioBien ? "✅" : "❌"} ${salioBien ? camino.bien : camino.mal}`);
  lineas.push("");
  lineas.push(salioBien ? `🪙 ${quien} cobra *${premio} UruCoins*.` : `🪙 ${quien} no cobra nada.`);
  if (ayudas.length) lineas.push(`🤝 ${ayudas.length === 1 ? "Ayudó" : "Ayudaron"} ${conMonto(ayudas)}: ${salioBien ? `${ayudas.length === 1 ? "recupera lo suyo" : "recuperan lo suyo"} y un ${Math.round(ENCARGO.AYUDA_PROPINA * 100)} % más` : `lo que ${ayudas.length === 1 ? "puso" : "pusieron"} se fue con el encargo`}.`);
  if (sabotajes.length) {
    const cobradas = pescados.map((a) => (multas.get(a.usuario) > 0 ? `${mencion(a.usuario)} paga ${multas.get(a.usuario)} de multa` : `${mencion(a.usuario)} no tiene con qué pagar la multa`));
    const descubiertos = pescados.length ? `Se descubrió a ${enLista(pescados.map((a) => mencion(a.usuario)))}: ${enLista(cobradas)}${[...multas.values()].some((m) => m > 0) ? `, y va para ${quien}` : ""}.` : "No hubo cómo probarle nada a nadie.";
    lineas.push(`🐀 ${sabotajes.length === 1 ? "Saboteó" : "Sabotearon"} ${conMonto(sabotajes)}. ${descubiertos}`);
  }
  const mentions = [e.usuario, ...aportes.map((a) => a.usuario)];
  // The bets, as the market tells them, when anybody bet.
  if (apuestas && apuestasDeMercado(e.mercado).length) {
    lineas.push("", apuestas.texto);
    mentions.push(...(apuestas.mentions || []));
  }
  return { texto: lineas.join("\n"), mentions: [...new Set(mentions)], salioBien, chance, premio: salioBien ? premio : 0, pescados: pescados.map((a) => a.usuario) };
}

// ---------- .encargo / .encargos ----------
// How the errands stand in the group: the open one, if any, and how they work.
export function textoEncargos(chat, ahora = Date.now()) {
  const prendidos = getChat(chat)?.encargos === 1;
  const partes = [];
  const mentions = [];
  const e = encargoAbierto(chat);
  const encargo = e && e.vence > ahora ? buscarEncargo(e.clave) : null;
  if (encargo) {
    const aportes = aportesDe(e.id);
    const pts = puntos(aportes);
    const camino = e.camino ? encargo.caminos[e.camino - 1] : null;
    const lineas = [`🚨 *Encargo corriendo*, el de ${mencion(e.usuario)}: ${emojiDe(e.clave)} ${encargo.titulo}. Se sabe a las ${hora(e.vence)}.`];
    lineas.push(camino ? `Va por el camino ${e.camino}, «${camino.nombre}», con ${acotar(camino.chance + pts.ayuda - pts.sabotaje)} % de chance y ${camino.premio} UruCoins de premio.` : `Todavía no eligió camino:\n${encargo.caminos.map((c, i) => `${NUMEROS[i]} ${c.nombre} — _${porcentaje(c)}_`).join("\n")}`);
    const ayudas = aportes.filter((a) => a.tipo === "ayuda");
    const sabotajes = aportes.filter((a) => a.tipo === "sabotaje");
    if (ayudas.length) lineas.push(`🤝 Ayudan ${conMonto(ayudas)}: +${pts.ayuda}.`);
    if (sabotajes.length) lineas.push(`🐀 Sabotean ${conMonto(sabotajes)}: −${pts.sabotaje}.`);
    if (e.mercado) {
      const pozo = [0, 0];
      for (const a of apuestasDeMercado(e.mercado)) pozo[a.opcion] += a.cantidad;
      lineas.push(`📊 Apostado: ${pozo[0]} a que llega y ${pozo[1]} a que no.`);
    }
    partes.push(lineas.join("\n"));
    mentions.push(e.usuario, ...aportes.map((a) => a.usuario));
  } else partes.push("🚨 Ahora no hay ningún encargo corriendo.");
  const cuando = `hasta ${ENCARGO.MAX_DIA} por día, de ${ENCARGO.DESDE_HORA} a ${ENCARGO.HASTA_HORA} y solo si el grupo está charlando`;
  partes.push(prendidos ? `Los encargos urgentes están *prendidos* (${cuando}). Un admin los apaga con .encargos off` : `Los encargos urgentes están *apagados*. Un admin los prende con .encargos on (${cuando}).`);
  partes.push(
    `Cómo va: etiqueto a alguien que esté charlando y le tiro un encargo de su oficio (.laburos; sin oficio, uno general), con ${ENCARGO.PLAZO_MIN} minutos de plazo y 2 o 3 caminos, cada uno con su chance y su premio. Elige con el número o con .ruta 2; si no elige, va por el peor.\nMientras corre, los demás pueden: *.apuesto si 50* o *.apuesto no 50* a que llega o no (el pozo se reparte entre los que acierten) · *.ayudo 30*: cada ${ENCARGO.APORTE_PASO} UruCoins suben un punto la chance, y si llega se recupera lo puesto y un ${Math.round(ENCARGO.AYUDA_PROPINA * 100)} % más · *.saboteo 30*: cada ${ENCARGO.APORTE_PASO} bajan un punto, y a la hora hay ${ENCARGO.DESCUBRIR_CHANCE} % de que se descubra y toque pagar lo mismo otra vez, de multa, a quien tenía el encargo. Hasta ${ENCARGO.APORTE_MAX} por persona, y cada bando mueve a lo sumo ${ENCARGO.APORTE_TOPE} puntos.`,
  );
  return { texto: partes.join("\n\n"), mentions: [...new Set(mentions)] };
}

// ---------- the owner's monthly reminder ----------
const claveMes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const MAS_REPETIDOS = 3;

// How worn the bank is: how many of its errands have gone out at least once, and the ones that went out the most.
export function usoDelBanco() {
  const enBanco = new Set(todasLasClaves());
  const filas = db.prepare(`SELECT clave, veces FROM encargos_usos WHERE veces > 0 ORDER BY veces DESC, ultima DESC, clave`).all().filter((f) => enBanco.has(f.clave));
  return { usados: filas.length, total: enBanco.size, repetidos: filas.slice(0, MAS_REPETIDOS) };
}

// The line that goes to the owner once a month, with the backup that's sent anyway (lib/backup.js), so it's no
// message of its own: "📝 Acordate de renovar los encargos: van X usados de Y, los más repetidos son …". Returns
// { texto, enviado }: texto is "" when this month's has gone already or no errand has ever gone out, and enviado()
// marks the month done, called once the backup did go out.
export function recordatorioDeEncargos(ahora = new Date()) {
  const mes = claveMes(ahora);
  const nada = { texto: "", enviado: () => {} };
  if (periodoCerrado("encargos", "recordatorio", mes)) return nada;
  const { usados, total, repetidos } = usoDelBanco();
  if (!usados) return nada;
  const nombres = repetidos.map((f) => `«${buscarEncargo(f.clave).titulo}» (${f.clave.split("/")[0]}, ${f.veces} ${f.veces === 1 ? "vez" : "veces"})`);
  return {
    texto: `📝 Acordate de renovar los encargos: van ${usados} usados de ${total}, ${nombres.length === 1 ? "el más repetido es" : "los más repetidos son"} ${enLista(nombres)}. Están en lib/encargos-banco.js.`,
    enviado: () => marcarPeriodoCerrado("encargos", "recordatorio", mes),
  };
}
