// The town's elections (lib/pueblo.js): once a month the group elects its intendente. Only in a town that's alive
// (switched on, with the economy on); with the town off nothing here runs, and nothing else changes.
//
// The calendar. From the 1st of each month (or the first day after it the group talked the day before, up to
// INICIO_HASTA_DIA), at an hour the group's games are open (its .horariojuegos, or from DESDE_HORA to HASTA_HORA with
// none), Claudia opens the campaign in the group, with the rules: for CAMPANA_DIAS days the políticos from
// CANDIDATO_NIVEL on sign up with .candidato [a slogan]. Then the voting, for VOTACION_DIAS days from the moment it's
// announced: one vote per person, secret, in private (.votar, written to Claudia first: she never opens a private
// chat). Only the ones who play vote: whoever had a trade in the group from before the campaign and has been paid in
// it at least VOTO_COBROS_MIN times, so a few empty accounts don't make an intendente. Then the count, in the group
// and in El Eco. With nobody signed up, or nobody voting, the town's own intendente (the character) takes over.
//
// The term lasts until the next count, about a month. Reelection is allowed once in a row (MANDATOS_SEGUIDOS terms),
// and then a term has to go by. What the intendente did weighs on one going for reelection: the town's mood, its
// prosperity, the tax and the bank's rate (pressed down or up, or bouncing) add or take off some votes, a nudge that
// grows with how many voted and never passes GESTION_TOPE.
//
// Buying votes: a candidate can promise money to a voter (.prometer @persona 50). The money is held until the count,
// and goes to the voter if they voted (for whoever: the vote is secret, so the money can't ask) or back to the
// candidate if not. It's a bribe: the one who got it can report it (.denunciarcoima), and at the count the comisario
// may find each one out (COIMA_RIESGO %, more with someone he already has his eye on). Caught, the candidate is out
// of the election, the promised money and a fine go to the town's coffers, the comisario remembers and El Eco has a
// scandal.
//
// The juicio político: with the signatures of a share of the ones who play (JUICIO_PARTE, at least JUICIO_FIRMAS_MIN),
// gathered within JUICIO_DIAS, the intendente is removed before the term ends, the town's own takes over until the
// next count, and the one removed can't run in it.
//
// Every number is in ELECCION. The tables are in database-schema.js.
import { randomInt } from "crypto";
import { db, getChat, chatsConOpcion, ganarCoins, gastarCoins, getSaldoCoins, totalMensajesEntre } from "../database-functions.js";
import { puebloActivo, estadoDe, registrarHecho, recordar, memoriaDe, sumarArcas, hechosDesde, PUEBLO } from "./pueblo.js";
import { laburoDe, nivelDe } from "./laburos.js";
import { claveDia } from "./actividad.js";
import { nombreDe } from "./menciones.js";
import { esParticipante } from "./identidad.js";
import { filtrarTexto } from "./tienda.js";
import { horarioDe, juegosAbiertos, textoHorario } from "./horario-juegos.js";

export const ELECCION = {
  // the calendar
  INICIO_HASTA_DIA: 10, // the campaign opens from the 1st of the month; past this day, the month goes without one
  CAMPANA_DIAS: 3, // signing up
  VOTACION_DIAS: 2, // voting, from the moment it's announced
  DESDE_HORA: 10, // Claudia announces from 10:00 to 20:59, in a group with no game hours
  HASTA_HORA: 21,
  MENSAJES_AYER: PUEBLO.MENSAJES_AYER, // messages the group needs from the day before for the campaign to open
  // who runs and who votes
  CANDIDATO_NIVEL: 3, // a político from this level on
  FRASE_MAX: 80,
  VOTO_COBROS_MIN: 1, // paydays in the group's trade to vote (and to sign a juicio)
  MANDATOS_SEGUIDOS: 2, // the first term and one reelection; then one term out
  // what the term did, at the count, for one going for reelection
  GESTION_UMBRAL: 0.2, // a term scored under this, either way (from -1 to 1), moves no votes
  GESTION_PESO: 0.25, // at most this share of the votes cast...
  GESTION_TOPE: 3, // ...and never more than this many
  // the bribes
  PROMESA_MIN: 10,
  PROMESA_MAX: 200,
  PROMESAS_MAX: 5, // a candidate's, per election
  COIMA_RIESGO: 15, // % of each one coming out at the count
  COIMA_JUNADO: 15, // % more if the comisario already has the candidate in his notes
  COIMA_MULTA: 100, // what a candidate caught pays (or what they have, if less), to the coffers
  // the juicio político
  JUICIO_PARTE: 0.34, // of the ones who can vote, the intendente left out
  JUICIO_FIRMAS_MIN: 3,
  JUICIO_DIAS: 3, // to gather the signatures
  JUICIO_GRACIA_DIAS: 3, // a new intendente can't be tried in their first days
  JUICIO_ESPERA_DIAS: 7, // after one failed, before another
};

// The dice, here so the tests can load them.
export const _dep = { azar: (n) => randomInt(0, n) };
const DIA_MS = 24 * 60 * 60 * 1000;
const arroba = (id) => `@${String(id).split("@")[0]}`;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const limitar = (n, min, max) => Math.max(min, Math.min(max, n));
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const leerJson = (texto, vacio) => {
  try {
    return JSON.parse(texto || "") ?? vacio;
  } catch {
    return vacio;
  }
};

// "hoy a las 15:00", "mañana a las 15:00", "el jueves 4/12 a las 15:00".
export function cuando(ms, ahora = Date.now()) {
  const d = new Date(ms);
  const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (claveDia(d) === claveDia(new Date(ahora))) return `hoy a las ${hora}`;
  if (claveDia(d) === claveDia(new Date(ahora + DIA_MS))) return `mañana a las ${hora}`;
  return `el ${DIAS_SEMANA[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} a las ${hora}`;
}
const mesDe = (ahora) => {
  const d = new Date(ahora);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// ---------- the rows ----------
const filaPueblo = (chat) => db.prepare(`SELECT * FROM pueblos WHERE chat = ?`).get(chat) || null;
// The election running in a town (in campaign or voting), or null.
export const eleccionEnCurso = (chat) => db.prepare(`SELECT * FROM elecciones WHERE chat = ? AND estado IN ('campana', 'votacion') ORDER BY id DESC LIMIT 1`).get(chat) || null;
const ultimaCerrada = (chat) => db.prepare(`SELECT * FROM elecciones WHERE chat = ? AND estado = 'cerrada' ORDER BY id DESC LIMIT 1`).get(chat) || null;

// Where an election stands by the clock: 'campana' (signing up), 'votacion', 'escrutinio' (waiting for the count),
// or how it ended ('cerrada', 'anulada'). The clock rules what can be done; what Claudia has announced is estado.
export function faseDe(el, ahora = Date.now()) {
  if (el.estado === "cerrada" || el.estado === "anulada") return el.estado;
  if (ahora < el.cierra_inscripcion) return "campana";
  if (ahora < el.cierra_votacion) return "votacion";
  return "escrutinio";
}

// The candidates of an election in their ballot order; only the ones still running, unless todos.
export function candidatosDe(eleccion, { todos = false } = {}) {
  return db.prepare(`SELECT * FROM elecciones_candidatos WHERE eleccion = ? ${todos ? "" : "AND estado = 'activo'"} ORDER BY numero`).all(eleccion);
}
const candidatoDe = (eleccion, usuario) => db.prepare(`SELECT * FROM elecciones_candidatos WHERE eleccion = ? AND usuario = ?`).get(eleccion, usuario) || null;
const yaVoto = (eleccion, usuario) => Boolean(db.prepare(`SELECT 1 FROM elecciones_votos WHERE eleccion = ? AND votante = ?`).get(eleccion, usuario));
const votantes = (eleccion) => db.prepare(`SELECT COUNT(*) AS n FROM elecciones_votos WHERE eleccion = ?`).get(eleccion).n;

// Whether someone is still in the group, by the participants at hand (with none, everyone counts).
const enElGrupo = (participants, usuario) => !participants?.length || participants.some((p) => esParticipante(p, usuario.endsWith("@lid") ? { lid: usuario } : { jid: usuario }));

// Whether someone plays enough to vote (or sign): a trade in the group from before `antes`, paid VOTO_COBROS_MIN
// times. Returns null if they can, or why not.
export function porQueNoVota(chat, usuario, antes) {
  const l = laburoDe(chat, usuario);
  if (!l) return "Votan los que juegan: hace falta un oficio en el grupo (.laburos) y haber cobrado por lo menos una vez.";
  if ((l.desde || 0) >= antes) return "Tu oficio es de después de que arrancó: votan los que ya laburaban cuando se abrió. La próxima sí.";
  if ((l.cobros || 0) < ELECCION.VOTO_COBROS_MIN) return `Votan los que juegan: hay que haber cobrado por lo menos ${plural(ELECCION.VOTO_COBROS_MIN, "vez", "veces")} con tu oficio (.trabajar).`;
  return null;
}

// The people of a group who can vote now (a trade, paid enough), among the participants at hand.
function electores(chat, participants = null, antes = Date.now()) {
  return db
    .prepare(`SELECT usuario FROM laburos WHERE chat = ? AND laburo != '' AND cobros >= ? AND desde < ?`)
    .all(chat, ELECCION.VOTO_COBROS_MIN, antes)
    .map((r) => r.usuario)
    .filter((u) => enElGrupo(participants, u));
}

// Whether Claudia can tell the group something now: the group isn't closed by its hours and its games are open (by
// its .horariojuegos, or the daytime with none).
export function horaDeAvisar(chat, ahora = new Date()) {
  const fila = getChat(chat);
  if (!fila || fila.grupoCerradoPorHorario) return false;
  if (horarioDe(fila)) return juegosAbiertos(fila, ahora);
  const h = ahora.getHours();
  return h >= ELECCION.DESDE_HORA && h < ELECCION.HASTA_HORA;
}

// Whether the intendente can run again: not after MANDATOS_SEGUIDOS in a row, nor removed by a juicio.
function porQueNoCandidato(chat, usuario) {
  const fila = filaPueblo(chat);
  if (fila.inhabilitado && fila.inhabilitado === usuario) return "Te voltearon con un juicio político: en estas elecciones no te podés presentar. En las próximas, sí.";
  if (fila.intendente === usuario && (fila.mandatos || 0) >= ELECCION.MANDATOS_SEGUIDOS) return `Ya vas por ${plural(fila.mandatos, "mandato", "mandatos")} seguidos: la reelección se puede una sola vez. Esperá un mandato y volvé.`;
  return null;
}

// ---------- the campaign ----------
// .candidato [slogan]: a político from CANDIDATO_NIVEL signs up while the campaign runs (said again, the slogan
// changes). Returns { ok, mensaje, mentions } or { ok: false, error }.
export function anotarCandidato(chat, usuario, frase = "", ahora = Date.now()) {
  if (!puebloActivo(chat)) return { ok: false, error: "Sin pueblo no hay intendencia, ni elecciones. Un admin lo prende con .pueblo on" };
  const el = eleccionEnCurso(chat);
  if (!el) return { ok: false, error: `Ahora no hay elecciones. ${textoProxima(chat, ahora)}` };
  if (faseDe(el, ahora) !== "campana") return { ok: false, error: "Las listas ya cerraron: ahora se vota (.elecciones)." };
  const l = laburoDe(chat, usuario);
  if (!l || l.laburo !== "politico") return { ok: false, error: `Para intendente se presentan los políticos (nivel ${ELECCION.CANDIDATO_NIVEL} o más). Vos podés votar, que también es un derecho.` };
  if (nivelDe(l.cobros) < ELECCION.CANDIDATO_NIVEL) return { ok: false, error: `Te falta calle: los candidatos son políticos de nivel ${ELECCION.CANDIDATO_NIVEL} o más, y vos sos nivel ${nivelDe(l.cobros)}. Seguí repartiendo volantes (.trabajar).` };
  const no = porQueNoCandidato(chat, usuario);
  if (no) return { ok: false, error: no };
  let linea = "";
  if (String(frase || "").trim()) {
    const f = filtrarTexto(frase, { min: 3, max: ELECCION.FRASE_MAX, graves: true });
    if (!f.ok) return { ok: false, error: f.error };
    linea = f.texto;
  }
  const ya = candidatoDe(el.id, usuario);
  if (ya?.estado === "descalificado") return { ok: false, error: "Te bajaron por la coima: en esta no corrés más." };
  if (ya) {
    db.prepare(`UPDATE elecciones_candidatos SET frase = ?, estado = 'activo' WHERE eleccion = ? AND usuario = ?`).run(linea, el.id, usuario);
    return { ok: true, mensaje: `🗳️ ${ya.estado === "baja" ? "Volviste a la lista" : "Listo, cambié tu frase"}: ${arroba(usuario)} es la lista ${ya.numero}${linea ? `, «${linea}»` : ""}.`, mentions: [usuario] };
  }
  const numero = (db.prepare(`SELECT MAX(numero) AS n FROM elecciones_candidatos WHERE eleccion = ?`).get(el.id).n || 0) + 1;
  db.prepare(`INSERT INTO elecciones_candidatos (eleccion, usuario, numero, frase, desde) VALUES (?, ?, ?, ?, ?)`).run(el.id, usuario, numero, linea, ahora);
  const fila = filaPueblo(chat);
  const reeleccion = fila.intendente === usuario ? " Va por la reelección: lo que hizo en el mandato le va a sumar o restar unos votos." : "";
  return {
    ok: true,
    mensaje: `🗳️ ${arroba(usuario)} se presenta para intendente: es la *lista ${numero}*${linea ? `, «${linea}»` : ""}.${reeleccion}\n_Las listas cierran ${cuando(el.cierra_inscripcion, ahora)}. Con .candidato baja te bajás._`,
    mentions: [usuario],
  };
}

// .candidato baja: stands down while the campaign runs. The bribes promised go back.
export function bajarCandidato(chat, usuario, ahora = Date.now()) {
  const el = puebloActivo(chat) ? eleccionEnCurso(chat) : null;
  const c = el && candidatoDe(el.id, usuario);
  if (!c || c.estado !== "activo") return { ok: false, error: "No estás en ninguna lista." };
  if (faseDe(el, ahora) !== "campana") return { ok: false, error: "Las listas ya cerraron: ahora tu nombre está en la boleta, te guste o no." };
  db.transaction(() => {
    db.prepare(`UPDATE elecciones_candidatos SET estado = 'baja' WHERE eleccion = ? AND usuario = ?`).run(el.id, usuario);
    devolverPromesas(el.id, usuario);
  })();
  return { ok: true, mensaje: `🗳️ ${arroba(usuario)} se bajó de la lista ${c.numero}. "Por motivos personales", dijo. ${estadoDe(chat, ahora)?.npc.almacenera || "La almacenera"} sabe cuáles.`, mentions: [usuario] };
}

// ---------- the vote ----------
// .votar: a vote in the ballot box. cual is the list's number (or the candidate's id). The box keeps that they voted,
// and adds one to the candidate's tally: who voted for whom is kept nowhere. Returns { ok, mensaje } or { ok: false,
// error }. In private, where it's asked from; the plugin checks the group's hours.
export function votar(chat, votante, cual, ahora = Date.now()) {
  if (!puebloActivo(chat)) return { ok: false, error: "Ahí el pueblo está apagado: no hay elecciones." };
  const el = eleccionEnCurso(chat);
  const fase = el ? faseDe(el, ahora) : null;
  if (fase !== "votacion") return { ok: false, error: fase === "campana" ? `Todavía es la campaña: se vota desde ${cuando(el.cierra_inscripcion, ahora)}.` : fase === "escrutinio" ? "La votación ya cerró: se están contando los votos." : "Ahora no hay votación." };
  const no = porQueNoVota(chat, votante, el.anuncio);
  if (no) return { ok: false, error: no };
  if (yaVoto(el.id, votante)) return { ok: false, error: "Ya votaste. Un voto por cabeza: esto no es la interna de un club." };
  const lista = candidatosDe(el.id);
  const c = lista.find((x) => x.numero === cual || x.usuario === cual);
  if (!c) return { ok: false, error: `No hay ninguna lista ${cual}. Las de la boleta: ${lista.map((x) => x.numero).join(", ")}.` };
  db.transaction(() => {
    db.prepare(`INSERT INTO elecciones_votos (eleccion, votante, fecha) VALUES (?, ?, ?)`).run(el.id, votante, ahora);
    db.prepare(`UPDATE elecciones_candidatos SET votos = votos + 1 WHERE eleccion = ? AND usuario = ?`).run(el.id, c.usuario);
  })();
  return { ok: true, mensaje: `🗳️ Listo: tu voto por la lista ${c.numero} (${nombreDe(c.usuario) || "sin nombre"}) quedó en la urna. Yo anoto que votaste, no a quién: ni yo lo sé ya. El escrutinio es ${cuando(el.cierra_votacion, ahora)} o apenas pueda, en el grupo.` };
}

// The ballot: each list with its number, its candidate's name and slogan. Names, never mentions.
export function boleta(el) {
  return candidatosDe(el.id).map((c) => `*${c.numero}.* ${nombreDe(c.usuario) || arroba(c.usuario)}${c.frase ? ` — «${c.frase}»` : ""}`);
}

// ---------- the bribes ----------
const promesasDe = (eleccion, candidato) => db.prepare(`SELECT * FROM elecciones_promesas WHERE eleccion = ? AND candidato = ? AND estado = 'pendiente'`).all(eleccion, candidato);
function devolverPromesas(eleccion, candidato = null) {
  const filas = db.prepare(`SELECT * FROM elecciones_promesas WHERE eleccion = ? AND estado = 'pendiente' ${candidato ? "AND candidato = ?" : ""}`).all(...(candidato ? [eleccion, candidato] : [eleccion]));
  for (const p of filas) {
    db.prepare(`UPDATE elecciones_promesas SET estado = 'devuelta' WHERE id = ?`).run(p.id);
    ganarCoins(p.chat, p.candidato, p.monto, "coima devuelta");
  }
}

// .prometer @persona 50: a candidate promises money for a vote. It's taken now and held until the count. Returns
// { ok, mensaje, mentions } or { ok: false, error }.
export function prometer(chat, candidato, votante, monto, participants = null, ahora = Date.now()) {
  if (!puebloActivo(chat)) return { ok: false, error: "Sin pueblo no hay elecciones, y sin elecciones no hay a quién coimear." };
  const el = eleccionEnCurso(chat);
  const fase = el ? faseDe(el, ahora) : null;
  if (fase !== "campana" && fase !== "votacion") return { ok: false, error: "Ahora no hay elecciones: guardá la plata para la próxima campaña." };
  const c = candidatoDe(el.id, candidato);
  if (!c || c.estado !== "activo") return { ok: false, error: "Prometen los candidatos. Vos, por ahora, sos votante: si te ofrecen algo, .denunciarcoima" };
  if (!votante) return { ok: false, error: `¿A quién? .prometer @persona ${ELECCION.PROMESA_MIN * 5}` };
  if (votante === candidato) return { ok: false, error: "Comprarte tu propio voto es lo único que en política sale gratis." };
  if (!enElGrupo(participants, votante)) return { ok: false, error: "Esa persona no está en el grupo." };
  if (!Number.isInteger(monto) || monto < ELECCION.PROMESA_MIN || monto > ELECCION.PROMESA_MAX) return { ok: false, error: `La promesa va de ${ELECCION.PROMESA_MIN} a ${ELECCION.PROMESA_MAX} UruCoins: más que eso ya es una licitación.` };
  if (porQueNoVota(chat, votante, el.anuncio)) return { ok: false, error: "Esa persona no vota en estas elecciones: la plata estaría tirada." };
  if (yaVoto(el.id, votante)) return { ok: false, error: "Esa persona ya votó: llegaste tarde con el sobre." };
  if (db.prepare(`SELECT 1 FROM elecciones_promesas WHERE eleccion = ? AND candidato = ? AND votante = ?`).get(el.id, candidato, votante)) return { ok: false, error: "A esa persona ya le prometiste. Dos sobres al mismo es despilfarro." };
  if (promesasDe(el.id, candidato).length >= ELECCION.PROMESAS_MAX) return { ok: false, error: `Ya repartiste ${ELECCION.PROMESAS_MAX} sobres: más, y te ven hasta desde la ruta.` };
  if (!gastarCoins(chat, candidato, monto, "coima electoral")) return { ok: false, error: `No te alcanza: tenés ${getSaldoCoins(chat, candidato)} UruCoins.` };
  db.prepare(`INSERT INTO elecciones_promesas (eleccion, chat, candidato, votante, monto, fecha) VALUES (?, ?, ?, ?, ?, ?)`).run(el.id, chat, candidato, votante, monto, ahora);
  return {
    ok: true,
    mensaje: `🤫 Anotado: ${arroba(candidato)} le promete a ${arroba(votante)} *${monto} UruCoins*. La plata la guardo yo hasta el escrutinio: si ${arroba(votante)} vota (por quien sea, que el voto es secreto), la cobra; si no, vuelve.\n_Es coima: si te denuncian (.denunciarcoima) o el comisario se entera, quedás afuera, perdés la plata y pagás ${ELECCION.COIMA_MULTA} de multa._`,
    mentions: [candidato, votante],
  };
}

// A candidate caught buying votes: out of the election, the promised money and a fine to the coffers, the comisario
// takes note and it's news. Returns what was taken.
function escandalo(chat, el, candidato, como, ahora) {
  const promesas = promesasDe(el.id, candidato);
  const decomiso = promesas.reduce((s, p) => s + p.monto, 0);
  const multa = Math.min(ELECCION.COIMA_MULTA, getSaldoCoins(chat, candidato));
  db.prepare(`UPDATE elecciones_candidatos SET estado = 'descalificado' WHERE eleccion = ? AND usuario = ?`).run(el.id, candidato);
  db.prepare(`UPDATE elecciones_promesas SET estado = 'decomisada' WHERE eleccion = ? AND candidato = ? AND estado = 'pendiente'`).run(el.id, candidato);
  if (multa > 0) gastarCoins(chat, candidato, multa, "multa por coima electoral");
  sumarArcas(chat, decomiso + multa);
  recordar(chat, "comisario", candidato, "coima electoral", ahora);
  registrarHecho(chat, "escandalo_coima", { usuario: candidato, monto: decomiso, sobres: promesas.length, como }, ahora);
  return { decomiso, multa, sobres: promesas.length };
}

// .denunciarcoima [@candidato]: the one who was promised money reports it. The candidate is caught at once.
export function denunciarCoima(chat, denunciante, candidato = null, ahora = Date.now()) {
  if (!puebloActivo(chat)) return { ok: false, error: "Sin pueblo no hay comisaría que te atienda." };
  const el = eleccionEnCurso(chat);
  const recibidas = el ? db.prepare(`SELECT * FROM elecciones_promesas WHERE eleccion = ? AND votante = ? AND estado = 'pendiente'`).all(el.id, denunciante) : [];
  if (!recibidas.length) return { ok: false, error: "A vos nadie te prometió nada en estas elecciones. Una denuncia sin sobre es un chisme: para eso está la almacenera." };
  const cual = candidato ? recibidas.find((p) => p.candidato === candidato) : recibidas.length === 1 ? recibidas[0] : null;
  if (!cual) return { ok: false, error: candidato ? "Esa persona no te prometió nada." : `Te prometieron ${recibidas.length}: decime a quién denunciás, .denunciarcoima @persona` };
  const fase = faseDe(el, ahora);
  if (fase !== "campana" && fase !== "votacion") return { ok: false, error: "Ya se están contando los votos: el comisario está ocupado custodiando la urna." };
  const p = estadoDe(chat, ahora);
  const r = db.transaction(() => escandalo(chat, el, cual.candidato, "denuncia", ahora))();
  return {
    ok: true,
    mensaje: `🚨 *ESCÁNDALO EN LA CAMPAÑA* 🚨\n${arroba(denunciante)} fue a la comisaría con el sobre: ${arroba(cual.candidato)} le había prometido ${cual.monto} UruCoins por el voto. ${p.npc.comisario[0].toUpperCase()}${p.npc.comisario.slice(1)} lo anotó en la libreta grande.\n${arroba(cual.candidato)} queda *afuera de la elección*, pierde los ${r.decomiso} de ${plural(r.sobres, "sobre", "sobres")}${r.multa ? ` y paga ${r.multa} de multa` : ""}: todo a las arcas del pueblo. Sale en El Eco del domingo.`,
    mentions: [denunciante, cual.candidato],
  };
}

// ---------- what the term did ----------
// How the intendente's term went, for one going for reelection: a score from -1 to 1 and the reasons, by the town's
// mood and prosperity, the tax since they took office and what they did with the bank's rate.
export function gestionDe(chat, ahora = Date.now()) {
  const p = estadoDe(chat, ahora);
  if (!p?.intendente.persona) return { puntos: 0, motivos: [] };
  const yo = p.intendente.usuario;
  const motivos = [];
  const humor = (p.humor - PUEBLO.REPOSO) / PUEBLO.REPOSO;
  const prosperidad = (p.prosperidad - PUEBLO.REPOSO) / PUEBLO.REPOSO;
  if (p.humor >= 60) motivos.push("el pueblo anda contento");
  else if (p.humor <= 40) motivos.push("el pueblo anda caliente");
  if (p.prosperidad >= 60) motivos.push("hay plata en la calle");
  else if (p.prosperidad <= 40) motivos.push("la cosa está brava");
  // The facts of the term, the oldest first: the tax as it was when they took office, and the rate.
  const hechos = hechosDesde(chat, p.intendente.desde || 0, ahora + 1).reverse();
  const primerImpuesto = hechos.find((h) => h.tipo === "impuesto");
  const delta = primerImpuesto ? p.impuesto - primerImpuesto.datos.antes : 0;
  const impuesto = limitar(-delta / 10, -1, 1);
  if (delta < 0) motivos.push(`bajó el impuesto (${primerImpuesto.datos.antes} → ${p.impuesto} %)`);
  else if (delta > 0) motivos.push(`subió el impuesto (${primerImpuesto.datos.antes} → ${p.impuesto} %)`);
  let tasa = 0;
  for (const h of hechos) {
    if (h.tipo === "tasa_presion" && h.datos.usuario === yo) tasa += h.datos.puntos < 0 ? 0.5 : -0.5;
    if (h.tipo === "tasa_rebote") tasa -= 1;
  }
  tasa = limitar(tasa, -1, 1);
  if (tasa > 0) motivos.push("abarató el crédito");
  else if (tasa < 0) motivos.push(hechos.some((h) => h.tipo === "tasa_rebote") ? "la tasa le rebotó en la cara" : "encareció el crédito");
  const puntos = limitar(0.3 * humor + 0.3 * prosperidad + 0.2 * impuesto + 0.2 * tasa, -1, 1);
  return { puntos, motivos };
}

// The votes the term is worth, out of the votes cast: none for a so-so term (under GESTION_UMBRAL either way), and
// otherwise one at least and at most GESTION_PESO of the votes cast, never more than GESTION_TOPE.
export function votosDeGestion(puntos, emitidos) {
  if (Math.abs(puntos) < ELECCION.GESTION_UMBRAL) return 0;
  const max = Math.min(ELECCION.GESTION_TOPE, Math.max(1, Math.ceil(emitidos * ELECCION.GESTION_PESO)));
  return Math.sign(puntos) * Math.max(1, Math.round(Math.abs(puntos) * max));
}

// ---------- the calendar ----------
// When the next campaign opens, in words.
export function textoProxima(chat, ahora = Date.now()) {
  const d = new Date(ahora);
  const esteMes = db.prepare(`SELECT 1 FROM elecciones WHERE chat = ? AND mes = ?`).get(chat, mesDe(ahora));
  if (!esteMes && d.getDate() <= ELECCION.INICIO_HASTA_DIA) return "La campaña de este mes arranca en cuanto el grupo esté despierto y en horario.";
  const sig = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `Las próximas arrancan el 1 de ${MESES[sig.getMonth()]}.`;
}

// The rules, as the campaign's announcement and the board tell them.
function reglas(chat, el, ahora) {
  const horario = horarioDe(getChat(chat));
  return [
    `📋 *Candidatos:* los políticos de nivel ${ELECCION.CANDIDATO_NIVEL} o más, con *.candidato* y una frase de campaña si quieren (.candidato Un asado por barrio). Las listas cierran ${cuando(el.cierra_inscripcion, ahora)}.`,
    `🗳️ *Votación:* después, por ${ELECCION.VOTACION_DIAS} días. Un voto por persona y *secreto*: me escribís *.votar* por privado${horario ? ` (en el horario de juegos, ${textoHorario(horario)})` : ""}. Votan los que juegan: oficio en el grupo desde antes de hoy y por lo menos un cobro.`,
    `🔁 *Reelección:* una sola vez seguida; después hay que esperar un mandato. Al que va por la reelección, lo que hizo le suma o le resta unos votos: el humor del pueblo, la prosperidad, el impuesto y la tasa del banco.`,
    `🤫 *Coimas:* se puede prometer plata por el voto (.prometer @persona 50), pero es coima: el que la recibe la puede denunciar (.denunciarcoima) y ${estadoDe(chat, ahora)?.npc.comisario || "el comisario"} anda mirando. Si te agarran, quedás afuera.`,
    `⚖️ *Juicio político:* con firmas de una parte de los que juegan (.juiciopolitico) se voltea al intendente antes de tiempo.`,
    `Si nadie se presenta, sigue ${estadoDe(chat, ahora)?.npc.intendente || "el intendente del pueblo"}. El mandato dura hasta las próximas, en un mes.`,
  ];
}

// The campaign opens: Claudia tells the group, with the rules. Sent before it's stored: a send that fails leaves
// nothing open, and the next round tries again.
async function abrirCampana(client, chat, ahora) {
  const el = { anuncio: ahora, cierra_inscripcion: ahora + ELECCION.CAMPANA_DIAS * DIA_MS, cierra_votacion: ahora + (ELECCION.CAMPANA_DIAS + ELECCION.VOTACION_DIAS) * DIA_MS };
  const p = estadoDe(chat, ahora);
  const quien = p.intendente.persona ? `${nombreDe(p.intendente.usuario) || "el que está"}, que ${p.intendente.mandatos >= ELECCION.MANDATOS_SEGUIDOS ? "ya va por su segundo mandato seguido y esta vez no puede presentarse" : "puede ir por la reelección"}` : `${p.npc.intendente}, el del pueblo`;
  const texto = [`🗳️ *ELECCIONES EN ${p.nombre.toUpperCase()}*`, `Se abre la campaña para intendente. Hoy está ${quien}.`, "", ...reglas(chat, el, ahora), "", "_.elecciones muestra las listas y el calendario._"].join("\n");
  await client.sendMessage(chat, { text: texto });
  db.prepare(`INSERT INTO elecciones (chat, mes, anuncio, cierra_inscripcion, cierra_votacion, estado) VALUES (?, ?, ?, ?, ?, 'campana')`).run(chat, mesDe(ahora), el.anuncio, el.cierra_inscripcion, el.cierra_votacion);
  return true;
}

// The lists close: with someone running, the voting opens (for VOTACION_DIAS from now, however late it's announced);
// with nobody, the town's own takes over.
async function abrirVotacion(client, chat, el, ahora) {
  const p = estadoDe(chat, ahora);
  const lista = candidatosDe(el.id);
  if (!lista.length) {
    const texto = `🗳️ *ELECCIONES EN ${p.nombre.toUpperCase()}*: nadie se presentó. Sigue ${p.npc.intendente}, el del pueblo, hasta las próximas. ${p.npc.almacenera[0].toUpperCase()}${p.npc.almacenera.slice(1)} dice que es por miedo; ${p.npc.intendente.replace(/^el intendente /, "él")} dice que es por cariño.`;
    await client.sendMessage(chat, { text: texto });
    cerrar(chat, el, { ganador: "", resultado: { desierta: true, lista: [] } }, ahora);
    return true;
  }
  const hasta = ahora + ELECCION.VOTACION_DIAS * DIA_MS;
  const horario = horarioDe(getChat(chat));
  const texto = [
    `🗳️ *SE VOTA EN ${p.nombre.toUpperCase()}*`,
    `Cerraron las listas. La boleta:`,
    ...boleta(el),
    "",
    `Votá por privado: escribime *.votar* y te paso la boleta, o directo *.votar ${lista[0].numero}*. El voto es secreto: anoto que votaste, no a quién. Votan los que ya tenían oficio cuando arrancó la campaña y cobraron alguna vez.`,
    `La urna cierra ${cuando(hasta, ahora)}${horario ? ` (se vota en el horario de juegos, ${textoHorario(horario)})` : ""}, y después cuento acá.`,
  ].join("\n");
  await client.sendMessage(chat, { text: texto });
  db.transaction(() => {
    db.prepare(`UPDATE elecciones SET estado = 'votacion', cierra_votacion = ? WHERE id = ?`).run(hasta, el.id);
    registrarHecho(chat, "campana", { candidatos: lista.map((c) => c.usuario), usuario: lista[0].usuario }, ahora);
  })();
  return true;
}

// The count, worked out (with the comisario's dice) but not stored: each list with its votes, the term's nudge for
// one going for reelection, who got caught, and the winner ('' for nobody).
export function contar(chat, el, ahora = Date.now()) {
  const p = estadoDe(chat, ahora);
  const lista = candidatosDe(el.id);
  const emitidos = votantes(el.id);
  const incumbente = p.intendente.persona ? p.intendente.usuario : null;
  const gestion = incumbente && lista.some((c) => c.usuario === incumbente) ? gestionDe(chat, ahora) : null;
  const extra = gestion ? votosDeGestion(gestion.puntos, emitidos) : 0;
  const filas = lista.map((c) => {
    const promesas = promesasDe(el.id, c.usuario);
    const riesgo = ELECCION.COIMA_RIESGO + (memoriaDe(chat, "comisario", c.usuario).veces >= PUEBLO.COMISARIO_JUNA ? ELECCION.COIMA_JUNADO : 0);
    const cazado = promesas.some(() => _dep.azar(100) < riesgo);
    const suma = c.usuario === incumbente ? extra : 0;
    return { usuario: c.usuario, numero: c.numero, votos: c.votos, extra: suma, total: Math.max(0, c.votos + suma), cazado, sobres: promesas.length };
  });
  const validos = filas.filter((f) => !f.cazado);
  const orden = [...validos].sort((a, b) => b.total - a.total || b.votos - a.votos || a.numero - b.numero);
  const reales = validos.reduce((s, f) => s + f.votos, 0);
  const ganador = reales > 0 && orden[0]?.total > 0 ? orden[0].usuario : "";
  return { lista: filas, emitidos, gestion: gestion ? { ...gestion, votos: extra } : null, incumbente, ganador };
}

// What the count does once told: the caught pay, the bribes go to whoever voted (or back), the intendente takes over.
function cerrar(chat, el, r, ahora) {
  db.transaction(() => {
    const fila = filaPueblo(chat);
    const escandalos = [];
    for (const f of r.resultado.lista) if (f.cazado) escandalos.push({ usuario: f.usuario, ...escandalo(chat, el, f.usuario, "comisario", ahora) });
    for (const pr of db.prepare(`SELECT * FROM elecciones_promesas WHERE eleccion = ? AND estado = 'pendiente'`).all(el.id)) {
      const voto = yaVoto(el.id, pr.votante);
      db.prepare(`UPDATE elecciones_promesas SET estado = ? WHERE id = ?`).run(voto ? "pagada" : "devuelta", pr.id);
      ganarCoins(chat, voto ? pr.votante : pr.candidato, pr.monto, voto ? "promesa de campaña" : "coima devuelta");
    }
    const antes = fila.intendente || "";
    const mandatos = !r.ganador ? 0 : r.ganador === antes ? (fila.mandatos || 0) + 1 : 1;
    db.prepare(`UPDATE pueblos SET intendente = ?, intendente_desde = ?, mandatos = ?, inhabilitado = '' WHERE chat = ?`).run(r.ganador, ahora, mandatos, chat);
    db.prepare(`UPDATE elecciones SET estado = 'cerrada', ganador = ?, resultado = ?, cerrada = ? WHERE id = ?`).run(r.ganador, JSON.stringify(r.resultado), ahora, el.id);
    db.prepare(`UPDATE elecciones_juicios SET estado = 'sin_efecto' WHERE chat = ? AND estado = 'abierto'`).run(chat);
    registrarHecho(chat, "eleccion", { usuario: r.ganador, antes, reelecto: Boolean(r.ganador) && r.ganador === antes, mandatos, votos: r.resultado.lista.find((f) => f.usuario === r.ganador)?.total || 0, emitidos: r.resultado.emitidos || 0, desierta: Boolean(r.resultado.desierta), escandalos: escandalos.length }, ahora);
  })();
}

// The count, told in the group and then stored.
async function escrutinio(client, chat, el, ahora) {
  const p = estadoDe(chat, ahora);
  const r = contar(chat, el, ahora);
  const mentions = r.lista.map((f) => f.usuario);
  const lineas = [`🗳️ *ESCRUTINIO EN ${p.nombre.toUpperCase()}*`, `Votaron ${plural(r.emitidos, "vecino", "vecinos")}.`, ""];
  const orden = [...r.lista].sort((a, b) => a.cazado - b.cazado || b.total - a.total || b.votos - a.votos || a.numero - b.numero);
  for (const f of orden) {
    if (f.cazado) {
      lineas.push(`🚨 Lista ${f.numero}, ${arroba(f.usuario)}: *afuera*. ${p.npc.comisario[0].toUpperCase()}${p.npc.comisario.slice(1)} encontró ${plural(f.sobres, "sobre", "sobres")} con plata a cambio de votos.`);
      continue;
    }
    const extra = f.extra ? ` (${f.extra > 0 ? "+" : ""}${f.extra} por la gestión) = *${f.total}*` : "";
    lineas.push(`${f.usuario === r.ganador ? "🏆" : "▫️"} Lista ${f.numero}, ${arroba(f.usuario)}: ${plural(f.votos, "voto", "votos")}${extra}`);
  }
  if (r.gestion && r.gestion.votos) lineas.push("", `_La gestión ${r.gestion.votos > 0 ? "sumó" : "restó"}: ${r.gestion.motivos.join(", ") || "la gente se acuerda"}._`);
  lineas.push("");
  if (r.ganador) {
    const reelecto = r.ganador === p.intendente.usuario;
    const mandatos = reelecto ? (p.intendente.mandatos || 0) + 1 : 1;
    lineas.push(`🏛️ ${arroba(r.ganador)} ${reelecto ? "*sigue de intendente*: reelecto" : "*es el nuevo intendente*"} hasta las próximas elecciones, en un mes.${mandatos >= ELECCION.MANDATOS_SEGUIDOS ? " Es su segundo mandato seguido: en las próximas no se puede presentar." : ""} Fija el impuesto (.impuesto) y le aprieta la tasa al banco (.tasa).`);
  } else {
    lineas.push(`🏛️ ${r.emitidos ? "Ninguna lista quedó en pie" : "Nadie fue a votar"}: sigue ${p.npc.intendente}, el del pueblo, hasta las próximas.`);
  }
  await client.sendMessage(chat, { text: lineas.join("\n"), mentions });
  cerrar(chat, el, { ganador: r.ganador, resultado: { lista: r.lista, emitidos: r.emitidos, gestion: r.gestion } }, ahora);
  return true;
}

// A town's round: the juicios that ran out end and, at an hour its games are open, an election that's due moves on
// (the lists close, the box closes), or from the 1st of the month the campaign opens. At most one message. Resolves
// to whether one went out.
export async function rondaElecciones(client, chat, ahora = new Date()) {
  if (!puebloActivo(chat)) return false;
  const ms = ahora.getTime();
  vencerJuicios(chat, ms);
  if (!client || !horaDeAvisar(chat, ahora)) return false;
  const el = eleccionEnCurso(chat);
  if (el) {
    const fase = faseDe(el, ms);
    if (el.estado === "campana" && fase !== "campana") return abrirVotacion(client, chat, el, ms);
    if (el.estado === "votacion" && fase === "escrutinio") return escrutinio(client, chat, el, ms);
    return false;
  }
  if (ahora.getDate() > ELECCION.INICIO_HASTA_DIA) return false;
  if (db.prepare(`SELECT 1 FROM elecciones WHERE chat = ? AND mes = ?`).get(chat, mesDe(ms))) return false;
  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  if (totalMensajesEntre(chat, [claveDia(ayer)]) < ELECCION.MENSAJES_AYER) return false;
  return abrirCampana(client, chat, ms);
}

// Every 5 minutes from tareas-programadas.js: each town's round. Returns how many messages went out.
export async function chequearElecciones(client, ahora = new Date()) {
  let enviados = 0;
  for (const chat of chatsConOpcion("pueblo")) {
    try {
      if (await rondaElecciones(client, chat, ahora)) enviados++;
    } catch (e) {
      console.error("[elecciones]", chat, e);
    }
  }
  return enviados;
}

// .pueblo off: the election running is void (the bribes go back), and so is a juicio. Next month, if it's on again,
// another one.
export function anularElecciones(chat) {
  db.transaction(() => {
    const el = eleccionEnCurso(chat);
    if (el) {
      devolverPromesas(el.id);
      db.prepare(`UPDATE elecciones SET estado = 'anulada' WHERE id = ?`).run(el.id);
    }
    db.prepare(`UPDATE elecciones_juicios SET estado = 'sin_efecto' WHERE chat = ? AND estado = 'abierto'`).run(chat);
  })();
}

// ---------- the juicio político ----------
const juicioAbierto = (chat) => db.prepare(`SELECT * FROM elecciones_juicios WHERE chat = ? AND estado = 'abierto' ORDER BY id DESC LIMIT 1`).get(chat) || null;
const firmasDe = (juicio) => db.prepare(`SELECT COUNT(*) AS n FROM elecciones_firmas WHERE juicio = ?`).get(juicio).n;

// The juicios whose time ran out without the signatures: they fail, quietly (it's in El Eco).
function vencerJuicios(chat, ahora) {
  for (const j of db.prepare(`SELECT * FROM elecciones_juicios WHERE chat = ? AND estado = 'abierto' AND hasta <= ?`).all(chat, ahora)) {
    db.prepare(`UPDATE elecciones_juicios SET estado = 'fallido' WHERE id = ?`).run(j.id);
    registrarHecho(chat, "juicio_fallido", { usuario: j.intendente, firmas: firmasDe(j.id), necesarias: j.necesarias }, ahora);
  }
}

// .juiciopolitico: the first one opens it against the intendente (a person) and signs; the next ones sign. With the
// signatures needed, the intendente is out. Returns { ok, mensaje, mentions } or { ok: false, error }.
export function firmarJuicio(chat, usuario, participants = null, ahora = Date.now()) {
  if (!puebloActivo(chat)) return { ok: false, error: "Sin pueblo no hay intendente que voltear." };
  vencerJuicios(chat, ahora);
  const p = estadoDe(chat, ahora);
  const yo = p.intendente;
  if (!yo.persona) return { ok: false, error: `Hoy manda ${p.npc.intendente}, el del pueblo: a ese no lo voltea nadie, porque nadie lo eligió. Se vota en las elecciones (.elecciones).` };
  if (yo.usuario === usuario) return { ok: false, error: "¿Un juicio político contra vos mismo? Para renunciar no hacen falta firmas: alcanza con no presentarte." };
  const l = laburoDe(chat, usuario);
  if (!l || (l.cobros || 0) < ELECCION.VOTO_COBROS_MIN) return { ok: false, error: `Firman los que juegan: hace falta un oficio en el grupo (.laburos) y haber cobrado con él por lo menos ${plural(ELECCION.VOTO_COBROS_MIN, "vez", "veces")}.` };
  let j = juicioAbierto(chat);
  const mentions = [usuario, yo.usuario];
  let abre = false;
  if (!j) {
    const el = eleccionEnCurso(chat);
    if (el) return { ok: false, error: "Ya hay elecciones en marcha: para sacarlo, no lo votes." };
    if (ahora - yo.desde < ELECCION.JUICIO_GRACIA_DIAS * DIA_MS) return { ok: false, error: `Recién asumió: hay ${ELECCION.JUICIO_GRACIA_DIAS} días de luna de miel. Se puede ${cuando(yo.desde + ELECCION.JUICIO_GRACIA_DIAS * DIA_MS, ahora)}.` };
    const anterior = db.prepare(`SELECT * FROM elecciones_juicios WHERE chat = ? AND estado = 'fallido' ORDER BY id DESC LIMIT 1`).get(chat);
    if (anterior && anterior.hasta + ELECCION.JUICIO_ESPERA_DIAS * DIA_MS > ahora) return { ok: false, error: `El último juicio político no juntó las firmas: hasta ${cuando(anterior.hasta + ELECCION.JUICIO_ESPERA_DIAS * DIA_MS, ahora)} no se abre otro.` };
    const base = electores(chat, participants, ahora).filter((u) => u !== yo.usuario).length;
    const necesarias = Math.max(ELECCION.JUICIO_FIRMAS_MIN, Math.ceil(base * ELECCION.JUICIO_PARTE));
    const id = Number(db.prepare(`INSERT INTO elecciones_juicios (chat, intendente, desde, hasta, necesarias) VALUES (?, ?, ?, ?, ?)`).run(chat, yo.usuario, ahora, ahora + ELECCION.JUICIO_DIAS * DIA_MS, necesarias).lastInsertRowid);
    j = juicioAbierto(chat) || { id, necesarias, hasta: ahora + ELECCION.JUICIO_DIAS * DIA_MS };
    abre = true;
  } else if (db.prepare(`SELECT 1 FROM elecciones_firmas WHERE juicio = ? AND usuario = ?`).get(j.id, usuario)) {
    return { ok: false, error: `Ya firmaste. Van ${firmasDe(j.id)} de ${j.necesarias}; vence ${cuando(j.hasta, ahora)}.` };
  }
  db.prepare(`INSERT INTO elecciones_firmas (juicio, usuario, fecha) VALUES (?, ?, ?)`).run(j.id, usuario, ahora);
  const firmas = firmasDe(j.id);
  if (firmas >= j.necesarias) {
    db.transaction(() => {
      db.prepare(`UPDATE elecciones_juicios SET estado = 'aprobado' WHERE id = ?`).run(j.id);
      db.prepare(`UPDATE pueblos SET intendente = '', intendente_desde = ?, mandatos = 0, inhabilitado = ? WHERE chat = ?`).run(ahora, yo.usuario, chat);
      registrarHecho(chat, "juicio_politico", { usuario: yo.usuario, firmas }, ahora);
    })();
    return {
      ok: true,
      mensaje: `⚖️🏛️ *JUICIO POLÍTICO: ${arroba(yo.usuario)} AFUERA*\nCon ${plural(firmas, "firma", "firmas")}, el pueblo lo sacó del sillón antes de tiempo. Vuelve ${p.npc.intendente}, el del pueblo, hasta las próximas elecciones, y ${arroba(yo.usuario)} no se puede presentar en ellas. ${p.npc.almacenera[0].toUpperCase()}${p.npc.almacenera.slice(1)} ya está haciendo pastafrola para festejar.`,
      mentions,
    };
  }
  return {
    ok: true,
    mensaje: abre
      ? `⚖️ ${arroba(usuario)} abrió un *juicio político* contra el intendente ${arroba(yo.usuario)}. Para voltearlo hacen falta *${j.necesarias} firmas* de los que juegan (oficio y algún cobro), con *.juiciopolitico*, hasta ${cuando(j.hasta, ahora)}. Va ${firmas}.`
      : `⚖️ ${arroba(usuario)} firmó el juicio político contra ${arroba(yo.usuario)}: van *${firmas} de ${j.necesarias}*. Vence ${cuando(j.hasta, ahora)}.`,
    mentions,
  };
}

// ---------- the boards ----------
// One line for .pueblo: what's going on with the elections.
export function lineaEleccionesPueblo(chat, ahora = Date.now()) {
  const el = eleccionEnCurso(chat);
  const j = juicioAbierto(chat);
  const partes = [];
  if (el) {
    const fase = faseDe(el, ahora);
    if (fase === "campana") partes.push(`🗳️ Campaña abierta: ${plural(candidatosDe(el.id).length, "lista", "listas")}, cierran ${cuando(el.cierra_inscripcion, ahora)} (.elecciones)`);
    else if (fase === "votacion") partes.push(`🗳️ Se vota por privado (.votar) hasta ${cuando(el.cierra_votacion, ahora)}`);
    else partes.push("🗳️ Se están contando los votos");
  } else partes.push(`🗳️ ${textoProxima(chat, ahora)}`);
  if (j && j.hasta > ahora) partes.push(`⚖️ juicio político: ${firmasDe(j.id)} de ${j.necesarias} firmas`);
  return partes.join(" · ");
}

// .elecciones: the board. Returns { texto, mentions }.
export function textoElecciones(chat, usuario, ahora = Date.now()) {
  const p = estadoDe(chat, ahora);
  if (!p) return { texto: "🗳️ Sin pueblo no hay elecciones: un admin lo prende con .pueblo on, y una vez por mes el grupo elige intendente.", mentions: [] };
  const mentions = [];
  const lineas = [`🗳️ *ELECCIONES EN ${p.nombre.toUpperCase()}*`];
  if (p.intendente.persona) {
    lineas.push(`🏛️ Intendente: ${p.intendente.como}, ${p.intendente.mandatos >= 2 ? `${p.intendente.mandatos}º mandato seguido` : "primer mandato"}${p.intendente.desde ? `, desde el ${new Date(p.intendente.desde).getDate()}/${new Date(p.intendente.desde).getMonth() + 1}` : ""}.`);
    mentions.push(p.intendente.usuario);
  } else lineas.push(`🏛️ Intendente: ${p.npc.intendente.replace(/^el intendente /, "")}, el del pueblo (nadie del grupo ganó una elección, o lo voltearon).`);
  const el = eleccionEnCurso(chat);
  if (!el) {
    lineas.push("", textoProxima(chat, ahora));
    const ultima = ultimaCerrada(chat);
    if (ultima) {
      const r = leerJson(ultima.resultado, {});
      lineas.push(`Las últimas (${ultima.mes}): ${ultima.ganador ? `ganó ${nombreDe(ultima.ganador) || arroba(ultima.ganador)}` : r.desierta ? "nadie se presentó" : "no ganó nadie"}${r.emitidos ? `, con ${plural(r.emitidos, "voto emitido", "votos emitidos")}` : ""}.`);
    }
  } else {
    const fase = faseDe(el, ahora);
    lineas.push("", fase === "campana" ? `*Campaña:* las listas cierran ${cuando(el.cierra_inscripcion, ahora)}. Se anota con .candidato [frase] un político de nivel ${ELECCION.CANDIDATO_NIVEL} o más.` : fase === "votacion" ? `*Votación:* hasta ${cuando(el.cierra_votacion, ahora)}, por privado (.votar). Votaron hasta ahora: ${votantes(el.id)}.` : "*Escrutinio:* la urna cerró; cuento en cuanto el grupo esté en horario.");
    const b = boleta(el);
    lineas.push(b.length ? b.join("\n") : "_Todavía no se anotó nadie._");
    if (p.intendente.persona && candidatosDe(el.id).some((c) => c.usuario === p.intendente.usuario)) {
      const g = gestionDe(chat, ahora);
      lineas.push("", `_La gestión de ${nombreDe(p.intendente.usuario) || "el intendente"} hoy ${g.puntos > 0.05 ? "le suma" : g.puntos < -0.05 ? "le resta" : "ni le suma ni le resta"}${g.motivos.length ? `: ${g.motivos.join(", ")}` : ""}._`);
    }
    if (usuario) {
      const no = porQueNoVota(chat, usuario, el.anuncio);
      lineas.push("", no ? `🙅 Vos no votás en estas: ${no}` : yaVoto(el.id, usuario) ? "✅ Vos ya votaste." : "🗳️ Vos podés votar: escribime .votar por privado.");
    }
  }
  const j = juicioAbierto(chat);
  if (j && j.hasta > ahora) lineas.push("", `⚖️ Juicio político abierto: ${firmasDe(j.id)} de ${j.necesarias} firmas, hasta ${cuando(j.hasta, ahora)} (.juiciopolitico firma).`);
  lineas.push("", `_Reelección: una sola vez seguida. Votan los que tienen oficio y cobraron alguna vez. El voto es secreto, por privado._`);
  return { texto: lineas.join("\n"), mentions };
}
