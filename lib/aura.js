// The aura duel: someone challenges someone else in a group (.aura @persona, plugins/fun-aura.js), who accepts with
// .aura si or passes with .aura no, and the group votes for a few minutes reacting to Claudia's ballot with 🔵 (who
// challenged) or 🔴 (who was challenged). Whoever gets more votes adds AURA.PREMIO to their aura of the month; the
// loser loses nothing, and a tie or no votes adds nothing. Aura isn't UruCoins: it's prestige, the month's ranking
// (.aura) with the crown for the first. Only results are kept (aura_mensual); the challenge, the ballot and its votes
// live in memory, like the casino's tables, and a restart loses a duel in course with nothing to give back.
//
// Consent: the challenged can say no, and .noaura (plugins/fun-noaura.js) takes someone out of a group's duels. Limits:
// one duel at a time per group, AURA.DESAFIOS_POR_DIA challenges a day per person, and one duel played a day between
// the same two people: with a friend voting, two people could hand each other aura every day.
import { anotarDueloDeAura, topAura, auraDe } from "../database-functions.js";
import { claveDia } from "./actividad.js";
import { mesDe, MESES } from "./hashtags.js";
import { esElBot, mismaPersona, idsDeParticipante, idsDelGrupo, buscarEnGrupo, participanteDe } from "./identidad.js";
import { abrirJuego } from "./juego-rapido.js";
import { eleccionEnGrupo } from "./menciones-generales.js";
import { nombreDe } from "./menciones.js";

export const AURA = { MINUTOS_RESPUESTA: 5, MINUTOS_VOTACION: 5, PREMIO: 1000, DESAFIOS_POR_DIA: 3, TOP: 10 };

export const desafios = new Map(); // chat -> the challenge waiting for its answer
export const votaciones = {}; // chat -> the ballot being voted (abrirJuego's map: it takes it before sending)
// Ballots already closed: a late reaction to one is swallowed, not paid as an ordinary reaction to Claudia.
const cerradas = new Set();
const CERRADAS_MAX = 200;
// The day's limits, emptied when the day changes: challenges per person and pairs that played, per group.
const hoy = { dia: null, desafios: new Map(), parejas: new Set() };

const LADOS = { "🔵": "retador", "🔴": "retado" };
const SIN_DESAFIO = "No tenés ningún desafío de aura pendiente. Para desafiar a alguien: .aura @persona";
const esLid = (id) => typeof id === "string" && id.endsWith("@lid");
const mencion = (id) => `@${String(id).split("@")[0]}`;
const sinDispositivo = (id) => id.replace(/:\d+@/, "@");
// 1000 as "1.000", by hand like the months (lib/hashtags.js, MESES). The menu writes the prize with it.
export const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const votos = (n) => `${n} ${n === 1 ? "voto" : "votos"}`;

// Whether two lists of ids are the same person: an id in common or, when one of them brings no LID to go by, the LID
// the database knows for a number (mismaPersona). Two different LIDs are two people whatever the database says about a
// number: a recycled number has two people's LIDs.
const misma = (a, b) => a.some((id) => b.includes(id)) || ((!a.some(esLid) || !b.some(esLid)) && mismaPersona(a, b));

// One key per person, for the limits and the votes: their LID when the ids bring it, which is theirs for good.
const claveDePersona = (ids) => ids.find(esLid) || ids[0];
const claveDePareja = (chat, a, b) => [chat, ...[a, b].sort()].join("|");

function limitesDeHoy(ahora) {
  const dia = claveDia(new Date(ahora));
  if (hoy.dia !== dia) Object.assign(hoy, { dia, desafios: new Map(), parejas: new Set() });
  return hoy;
}

// The duel a group has going, waiting for its answer or being voted, or null: one at a time.
export const dueloDeAuraEn = (chat) => desafios.get(chat) || votaciones[chat] || null;

// Whether someone took themselves out of a group's aura duels (.noaura).
export const fueraDeAura = (chat, ids) => eleccionEnGrupo(chat, ids, "sinAura");

// What goes out after a while (the expiry, the result) comes from a timer, where an error thrown takes the bot down.
function anunciar(avisar, calcular) {
  let aviso;
  try {
    aviso = calcular();
  } catch (e) {
    return console.error("[aura] no se pudo cerrar la batalla:", e?.message || e);
  }
  Promise.resolve()
    .then(() => avisar?.(aviso))
    .catch((e) => console.error("[aura] no se pudo avisar:", e?.message || e));
}

// .aura @persona. retador and retadorJid are whoever writes (m.sender, m.senderJid); retado, whom they name, as
// mencionadoActual gives it with deWhatsApp. alVencer({ texto, mentions }) announces the expiry. Returns { ok, texto,
// mentions } or { ok: false, error }, which names people without tagging them.
export function desafiarAura(chat, { retador, retadorJid = "", retado, participants, deWhatsApp = null, alVencer = null, ahora = Date.now() } = {}) {
  if (!participants?.length) return { ok: false, error: "No pude ver la lista de miembros del grupo; probá de nuevo en un rato." };
  if (!retado) return { ok: false, error: "¿A quién desafiás? Elegí a la persona de la lista que aparece al escribir @, o respondé un mensaje suyo con .aura" };
  if (esElBot(retado)) return { ok: false, error: "Conmigo no: yo el aura la traigo de fábrica 😌" };
  const el = participanteDe(participants, deWhatsApp)(retado);
  if (!el) return { ok: false, error: "Solo podés desafiar a alguien de este grupo." };
  const idsRetador = idsDeParticipante({ id: retador, phoneNumber: retadorJid }, participants);
  const idsRetado = [...new Set([retado, ...idsDelGrupo(el)])];
  // The group knows best whether it's the same participant; the database only for someone it doesn't list. Compared as
  // they came, someone writing from their number could challenge their own LID (as .duelo still lets them).
  const yo = buscarEnGrupo(participants, { lid: retador, jid: retadorJid });
  if (yo ? yo === el : misma(idsRetador, idsRetado)) return { ok: false, error: "Desafiarte a vos mismo no cuenta 😅" };
  if (fueraDeAura(chat, idsRetador)) return { ok: false, error: "Estás fuera de las batallas de aura de este grupo. Con .siaura volvés." };
  const enCurso = dueloDeAuraEn(chat);
  if (enCurso && desafios.get(chat) === enCurso && misma(idsRetador, enCurso.idsRetado)) return { ok: false, error: "Ya te desafiaron: respondé .aura si o .aura no." };
  if (enCurso) return { ok: false, error: `Ya hay una batalla de aura en curso (${nombreDe(enCurso.retador)} contra ${nombreDe(enCurso.retado)}): esperá a que termine.` };
  if (fueraDeAura(chat, idsRetado)) return { ok: false, error: `${nombreDe(retado)} no juega batallas de aura en este grupo.` };
  const limites = limitesDeHoy(ahora);
  const [claveRetador, claveRetado] = [claveDePersona(idsRetador), claveDePersona(idsRetado)];
  const hechos = limites.desafios.get(`${chat}|${claveRetador}`) || 0;
  if (hechos >= AURA.DESAFIOS_POR_DIA) return { ok: false, error: `Ya hiciste ${AURA.DESAFIOS_POR_DIA} desafíos de aura hoy en este grupo: mañana podés de nuevo.` };
  if (limites.parejas.has(claveDePareja(chat, claveRetador, claveRetado))) return { ok: false, error: `${nombreDe(retado)} y vos ya tuvieron una batalla de aura hoy: mañana pueden de nuevo.` };

  // Counted whatever comes of it: turned down, expired or taken back, it was a notice to the group all the same.
  limites.desafios.set(`${chat}|${claveRetador}`, hechos + 1);
  const d = { chat, retador, retado, idsRetador, idsRetado, claveRetador, claveRetado, timeout: null };
  d.timeout = setTimeout(() => {
    if (desafios.get(chat) !== d) return;
    desafios.delete(chat);
    anunciar(alVencer, () => ({ texto: `⌛ La batalla de aura de ${mencion(retador)} contra ${mencion(retado)} venció sin respuesta.`, mentions: [retador, retado] }));
  }, AURA.MINUTOS_RESPUESTA * 60_000);
  desafios.set(chat, d);
  return {
    ok: true,
    texto: `✨ ${mencion(retador)} desafía a ${mencion(retado)} a una *batalla de aura*: si acepta, el grupo vota quién tiene más.\n${mencion(retado)}: .aura si para aceptar o .aura no para pasar (tenés ${AURA.MINUTOS_RESPUESTA} minutos).`,
    mentions: [retador, retado],
  };
}

// What waits on whoever writes .aura si or .aura no here, for comoLoEsperan (lib/identidad.js): the one challenged,
// unless it's the one who challenged, from their other id.
export function retadoEn(chat, quien = null) {
  const d = desafios.get(chat);
  return d && !(quien && misma([quien], d.idsRetador)) ? [d.retado] : [];
}

// .aura no: the one challenged passes, and the one who challenged takes it back (a challenge made by replying to a
// message by mistake). como is who the one answering stands for (comoLoEsperan).
export function rechazarAura(chat, { quien, quienJid = "", como = quien } = {}) {
  const d = desafios.get(chat);
  const loRetiro = d && misma(idsDeParticipante({ id: quien, phoneNumber: quienJid }), d.idsRetador);
  if (!d || (d.retado !== como && !loRetiro)) return { ok: false, error: SIN_DESAFIO };
  clearTimeout(d.timeout);
  desafios.delete(chat);
  if (loRetiro) return { ok: true, texto: `↩️ ${mencion(d.retador)} retiró su desafío de aura.`, mentions: [d.retador] };
  return { ok: true, texto: `🏳️ ${mencion(d.retado)} no aceptó la batalla de aura de ${mencion(d.retador)}.`, mentions: [d.retado, d.retador] };
}

const textoVotacion = (v) => `🗳️ *Batalla de aura*\n🔵 ${mencion(v.retador)}  vs  🔴 ${mencion(v.retado)}\nReaccioná a este mensaje con 🔵 o 🔴: ¿quién tiene más aura? Cierra en ${AURA.MINUTOS_VOTACION} minutos.`;

// .aura si: Claudia's ballot goes out (enviar(texto, mentions), returning what was sent) and the vote is open until
// alCerrar({ texto, mentions, citar }) announces the result. The duel is played by whoever accepted, by the id they
// answered with (quien), as .duelo: that's where their .aura finds it. Throws if the ballot doesn't go out; the group
// is free again then.
export async function aceptarAura(chat, { quien, quienJid = "", como = quien, participants = null, enviar, alCerrar = null, ahora = Date.now() } = {}) {
  const d = desafios.get(chat);
  if (!d || d.retado !== como) return { ok: false, error: SIN_DESAFIO };
  clearTimeout(d.timeout);
  desafios.delete(chat);
  if (participants?.length && !buscarEnGrupo(participants, { lid: d.retador, jid: d.idsRetador.find((id) => !esLid(id)) })) {
    return { ok: false, error: "Quien te desafió ya no está en el grupo: la batalla queda sin efecto." };
  }
  const contendientes = [...new Set([...d.idsRetador, ...d.idsRetado, ...idsDeParticipante({ id: quien, phoneNumber: quienJid }, participants)])];
  const v = { chat, retador: d.retador, retado: quien, contendientes, votos: new Map(), mensaje: null, mensajeId: null, timeout: null };
  // Nothing waits between the challenge leaving and the ballot taking the group: abrirJuego takes it before sending.
  await abrirJuego(votaciones, chat, {
    juego: v,
    nombre: "aura",
    ms: AURA.MINUTOS_VOTACION * 60_000,
    enviar: async () => {
      const enviado = await enviar(textoVotacion(v), [v.retador, v.retado]);
      // Baileys gives nothing back when nothing went out: with no id, nobody could vote.
      if (!enviado?.key?.id) throw new Error("la votación no salió");
      v.mensaje = enviado;
      return enviado;
    },
    alVencer: () => anunciar(alCerrar, () => cerrarVotacion(v)),
  });
  limitesDeHoy(ahora).parejas.add(claveDePareja(chat, d.claveRetador, d.claveRetado));
  return { ok: true };
}

function recordarCerrada(id) {
  if (!id) return;
  cerradas.add(id);
  if (cerradas.size > CERRADAS_MAX) cerradas.delete(cerradas.values().next().value);
}

// The count when time's up: the most votes adds the aura; a tie, or no votes, adds nothing and writes nothing.
function cerrarVotacion(v, ahora = Date.now()) {
  recordarCerrada(v.mensajeId);
  const cuenta = { retador: 0, retado: 0 };
  for (const { lado } of v.votos.values()) cuenta[lado]++;
  const base = { mentions: [v.retador, v.retado], citar: v.mensaje };
  if (!cuenta.retador && !cuenta.retado) return { ...base, texto: `🦗 *Batalla de aura*: nadie votó entre ${mencion(v.retador)} y ${mencion(v.retado)}, así que nadie suma aura.` };
  const marcador = `🔵 ${mencion(v.retador)} ${votos(cuenta.retador)} · 🔴 ${mencion(v.retado)} ${votos(cuenta.retado)}`;
  if (cuenta.retador === cuenta.retado) return { ...base, texto: `🤝 *Batalla de aura*: ${marcador}\nEmpate: nadie suma aura.` };
  const [ganador, perdedor] = cuenta.retador > cuenta.retado ? [v.retador, v.retado] : [v.retado, v.retador];
  anotarDueloDeAura(mesDe(ahora), v.chat, ganador, perdedor, AURA.PREMIO, ahora);
  return { ...base, texto: `🏆 *Batalla de aura*: ${marcador}\n${mencion(ganador)} tiene más aura y suma *+${miles(AURA.PREMIO)}* este mes.` };
}

// A reaction to a group's message (lib/reacciones.js, before anything else counts it): true if it's about an aura
// ballot, open or already closed, and then it counts for nothing else, neither UruCoins nor the reactions' ranking.
// Each one's last reaction is their vote: 🔵 or 🔴; taking it back (text "") or switching to another emoji takes the
// vote away. Whoever reacts comes by participant and participantAlt (their number and their LID, in either order); the
// two playing and Claudia don't vote.
export function votoDeAura(client, { key, reaction } = {}) {
  const v = votaciones[key?.remoteJid];
  if (!key?.id || !v?.mensajeId || v.mensajeId !== key.id) return Boolean(key?.id && cerradas.has(key.id));
  const quien = reaction?.key || {};
  const ids = [...new Set([quien.participant, quien.participantAlt].filter((id) => typeof id === "string" && id).map(sinDispositivo))];
  if (!ids.length || quien.fromMe || esElBot(ids, client) || misma(ids, v.contendientes)) return true;
  for (const [clave, voto] of v.votos) if (misma(ids, voto.ids)) v.votos.delete(clave);
  const lado = LADOS[String(reaction?.text || "").replace(/\uFE0F/g, "")];
  if (lado) v.votos.set(claveDePersona(ids), { lado, ids });
  return true;
}

// .noaura: a challenge waiting for an answer with them in it goes, with no notice; returns it, or null.
export function soltarDesafioDe(chat, ids) {
  const d = desafios.get(chat);
  if (!d || !(misma(ids, d.idsRetador) || misma(ids, d.idsRetado))) return null;
  clearTimeout(d.timeout);
  desafios.delete(chat);
  return d;
}

// Whether a ballot with them playing is being voted: it ends as it is, since both accepted.
export const votandoCon = (chat, ids) => Boolean(votaciones[chat] && misma(ids, votaciones[chat].contendientes));

// .aura: the month's ranking, by name and without tagging anyone (ten tags per query fill phones with notifications,
// as .baltop says), the first with the crown, and how whoever asks is doing.
export function textoAura(chat, quien, ahora = Date.now()) {
  const mes = mesDe(ahora);
  const lineas = topAura(chat, mes, AURA.TOP).map((r, i) => (i === 0 ? `👑 ${nombreDe(r.usuario)} — *${miles(r.aura)}* (el aura del mes)` : `${i + 1}. ${nombreDe(r.usuario)} — *${miles(r.aura)}*`));
  const ranking = lineas.length ? lineas.join("\n") : `Este mes nadie sumó aura todavía: desafiá a alguien con .aura @persona, el grupo vota y el que gana suma ${miles(AURA.PREMIO)}.`;
  const a = auraDe(chat, mes, quien);
  const duelos = `${a.ganados} ${a.ganados === 1 ? "batalla ganada" : "batallas ganadas"} y ${a.perdidos} ${a.perdidos === 1 ? "perdida" : "perdidas"}`;
  const delMes = a.delMes > 0 ? `*${miles(a.delMes)}* este mes (puesto ${a.puesto})` : "nada este mes";
  const vos = a.ganados || a.perdidos ? `Vos: ${delMes} · *${miles(a.total)}* en total · ${duelos}.` : "Vos: todavía no ganaste ni perdiste ninguna batalla de aura.";
  return `✨ *Ranking de aura — ${MESES[Number(mes.slice(5)) - 1]}*\n\n${ranking}\n\n${vos}`;
}

// Everything in course, with its timers, and the day's limits: for the tests.
export function olvidarDuelosDeAura() {
  for (const d of desafios.values()) clearTimeout(d.timeout);
  desafios.clear();
  for (const chat of Object.keys(votaciones)) {
    clearTimeout(votaciones[chat].timeout);
    delete votaciones[chat];
  }
  cerradas.clear();
  Object.assign(hoy, { dia: null, desafios: new Map(), parejas: new Set() });
}
