// One-on-one duels with UruCoins: someone challenges another person for an amount, the other accepts, and they play
// a die (highest number wins, a tie is re-rolled), a card (highest wins; the suit breaks ties) or a turn-based FIGHT
// (each picks punch, kick, guard or heal until someone runs out of health). Both put up the same and the winner takes
// it all: the house takes nothing. The challenge expires after a few minutes and refunds the stake. It lives in
// memory, like the tables.
import { randomInt as randomIntCrypto } from "crypto";
import { gastarCoins, ganarCoins, getSaldoCoins } from "../database-functions.js";
import { protegerApuesta } from "./tienda.js";
import { COINS, apuestaMaxima, textoApuestaMaxima } from "./urucoins.js";

export const _rng = { randomInt: randomIntCrypto };
export const DUELO = { MINUTOS: 5 };
if (!globalThis.duelos) globalThis.duelos = new Map(); // "chat|retado" -> pending challenge

const mencion = (lid) => `@${lid.split("@")[0]}`;
const clave = (chat, retado) => `${chat}|${retado}`;
const TIPOS = { dado: "dado", dados: "dado", carta: "carta", cartas: "carta", pelea: "pelea", peleas: "pelea", piñas: "pelea", pinas: "pelea" };
const NOMBRE_TIPO = { dado: "dados 🎲", carta: "cartas 🃏", pelea: "pelea 🥊" };
const VALORES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const PALOS = ["♣", "♦", "♥", "♠"]; // lowest to highest, for breaking ties

export function desafiar(chat, retador, retado, cantidad, tipoTexto, alVencer) {
  const tipo = TIPOS[String(tipoTexto || "dado").toLowerCase()];
  if (!retado) return { ok: false, error: "¿A quién desafiás? Ej: .duelo @alguien 20 (o respondé a un mensaje suyo con .duelo 20)" };
  if (retado === retador) return { ok: false, error: "Desafiarte a vos mismo no cuenta 😅" };
  if (retado === globalThis.client?.user?.lid) return { ok: false, error: "Conmigo no, que la banca soy yo." };
  if (!tipo) return { ok: false, error: "Los duelos son a dado, a carta o a pelea. Ej: .duelo @alguien 20 pelea" };
  if (!Number.isInteger(cantidad) || cantidad < COINS.APUESTA_MIN) return { ok: false, error: `La apuesta mínima es ${COINS.APUESTA_MIN} UruCoins.` };
  const maximo = apuestaMaxima(chat, retador, COINS.DUELO_APUESTA_MAX);
  if (cantidad > maximo) return { ok: false, error: `Tu apuesta máxima en un duelo es ${maximo} UruCoins (${textoApuestaMaxima(COINS.DUELO_APUESTA_MAX)}).` };
  if (globalThis.duelos.has(clave(chat, retado))) return { ok: false, error: `${mencion(retado)} ya tiene un desafío pendiente; que lo conteste primero.`, mentions: [retado] };
  if ([...globalThis.duelos.values()].some((d) => d.chat === chat && d.retador === retador)) return { ok: false, error: "Ya tenés un desafío pendiente; esperá a que lo contesten o a que venza." };
  if (!gastarCoins(chat, retador, cantidad, "duelo_apuesta")) return { ok: false, error: `No te alcanza: tenés ${getSaldoCoins(chat, retador)} UruCoins.` };

  const d = { chat, retador, retado, cantidad, tipo, creado: Date.now(), timeout: null };
  d.timeout = setTimeout(() => {
    if (globalThis.duelos.get(clave(chat, retado)) !== d) return;
    globalThis.duelos.delete(clave(chat, retado));
    ganarCoins(chat, retador, cantidad, "duelo_devolucion");
    Promise.resolve(alVencer?.({ texto: `⌛ El duelo de ${mencion(retador)} contra ${mencion(retado)} venció sin respuesta; se devuelven los ${cantidad} UruCoins.`, mentions: [retador, retado] })).catch((e) => console.error("[duelos] no se pudo avisar:", e.message));
  }, DUELO.MINUTOS * 60 * 1000);
  globalThis.duelos.set(clave(chat, retado), d);
  return {
    ok: true,
    texto: `⚔️ ${mencion(retador)} desafía a ${mencion(retado)} a un duelo de ${NOMBRE_TIPO[tipo]} por *${cantidad} UruCoins*.\n${mencion(retado)}: .acepto para jugar o .rechazo para pasar (tenés ${DUELO.MINUTOS} minutos).`,
    mentions: [retador, retado],
  };
}

const SIN_DESAFIO = { ok: false, error: "No tenés ningún desafío pendiente. Para desafiar a alguien: .duelo @alguien 20" };

// "avisar(mensaje)" is used by the fight to send the automatic turn when someone doesn't answer in time.
export function aceptar(chat, retado, avisar = null) {
  const d = globalThis.duelos.get(clave(chat, retado));
  if (!d) return SIN_DESAFIO;
  if (!gastarCoins(chat, retado, d.cantidad, "duelo_apuesta")) return { ok: false, error: `No te alcanza: el duelo es por ${d.cantidad} y tenés ${getSaldoCoins(chat, retado)} UruCoins.` };
  clearTimeout(d.timeout);
  globalThis.duelos.delete(clave(chat, retado));
  if (d.tipo === "pelea") return iniciarPelea(d, avisar);
  return jugar(d);
}

export function rechazar(chat, retado) {
  const d = globalThis.duelos.get(clave(chat, retado));
  if (!d) return SIN_DESAFIO;
  clearTimeout(d.timeout);
  globalThis.duelos.delete(clave(chat, retado));
  ganarCoins(chat, d.retador, d.cantidad, "duelo_devolucion");
  return { ok: true, texto: `🏳️ ${mencion(retado)} no aceptó el duelo. ${mencion(d.retador)} recupera sus ${d.cantidad} UruCoins.`, mentions: [retado, d.retador] };
}

function jugar(d) {
  let detalle;
  let ganaRetador;
  if (d.tipo === "dado") {
    let a;
    let b;
    do {
      a = _rng.randomInt(1, 7);
      b = _rng.randomInt(1, 7);
    } while (a === b);
    ganaRetador = a > b;
    detalle = `🎲 ${mencion(d.retador)} tiró *${a}* · ${mencion(d.retado)} tiró *${b}*`;
  } else {
    const c1 = _rng.randomInt(0, 52);
    let c2 = _rng.randomInt(0, 51);
    if (c2 >= c1) c2++; // two different cards from the same deck
    const carta = (i) => ({ valor: i % 13, palo: Math.floor(i / 13), texto: `${VALORES[i % 13]}${PALOS[Math.floor(i / 13)]}` });
    const [x, y] = [carta(c1), carta(c2)];
    ganaRetador = x.valor !== y.valor ? x.valor > y.valor : x.palo > y.palo;
    detalle = `🃏 ${mencion(d.retador)} sacó *${x.texto}* · ${mencion(d.retado)} sacó *${y.texto}*`;
  }
  const ganador = ganaRetador ? d.retador : d.retado;
  const perdedor = ganaRetador ? d.retado : d.retador;
  const pozo = d.cantidad * 2;
  ganarCoins(d.chat, ganador, pozo, "duelo_premio");
  const devuelto = protegerApuesta(d.chat, perdedor, d.cantidad);
  return { ok: true, ganador, texto: `${detalle}\n🏆 Gana ${mencion(ganador)} y se lleva *${pozo} UruCoins*.${devuelto ? `\n🛡️ ${mencion(perdedor)} tenía escudo y recupera sus ${devuelto}.` : ""}`, mentions: [d.retador, d.retado] };
}

export function textoDuelos(chat) {
  const lista = [...globalThis.duelos.values()].filter((d) => d.chat === chat);
  if (lista.length === 0) return null;
  return {
    texto: `⚔️ *Duelos pendientes*\n${lista.map((d) => `• ${mencion(d.retador)} vs ${mencion(d.retado)} — ${d.cantidad} UruCoins a ${NOMBRE_TIPO[d.tipo]}`).join("\n")}`,
    mentions: [...new Set(lista.flatMap((d) => [d.retador, d.retado]))],
  };
}

// ====================== Turn-based fight ======================
// Each starts with PELEA.HP health. On their turn they pick: punch (nearly always lands, medium damage), kick (more
// damage, but misses more), guard (the next hit taken does half and may counter) or heal (restores health, CURAS
// times per fight). With no pick within SEGUNDOS_TURNO, a punch is thrown automatically. At MAX_TURNOS whoever has more
// vida; empate devuelve lo apostado.
export const PELEA = { HP: 100, SEGUNDOS_TURNO: 45, MAX_TURNOS: 20, CURAS: 2 };
if (!globalThis.peleas) globalThis.peleas = new Map(); // "chat|usuario" -> fight (both people point at the same one)

const ATAQUES = {
  golpe: { nombre: "un golpe", emoji: "👊", acierto: 85, min: 12, max: 20, critico: 10 },
  patada: { nombre: "una patada", emoji: "🦵", acierto: 60, min: 22, max: 34, critico: 5 },
};
const barra = (hp) => {
  const llenos = Math.round((Math.max(0, hp) / PELEA.HP) * 12);
  return "█".repeat(llenos) + "░".repeat(12 - llenos);
};
const vidaDe = (pelea, u) => `${mencion(u)} ❤️ ${pelea.jugadores[u].hp} ${barra(pelea.jugadores[u].hp)}`;
const rivalDe = (pelea, u) => pelea.orden.find((x) => x !== u);

function textoTurno(pelea) {
  const actual = pelea.orden[pelea.turno];
  const yo = pelea.jugadores[actual];
  const opciones = [".golpe", ".patada", ".cubrirse", yo.curas > 0 ? `.curar (${yo.curas})` : null].filter(Boolean).join(" · ");
  return `${vidaDe(pelea, pelea.orden[0])}\n${vidaDe(pelea, pelea.orden[1])}\nTurno de ${mencion(actual)}: ${opciones} (${PELEA.SEGUNDOS_TURNO} s)`;
}

function armarTurno(pelea) {
  clearTimeout(pelea.timeout);
  pelea.timeout = setTimeout(() => {
    const actual = pelea.orden[pelea.turno];
    if (globalThis.peleas.get(clave(pelea.chat, actual)) !== pelea) return;
    const r = accionPelea(pelea.chat, actual, "golpe");
    Promise.resolve(pelea.avisar?.({ ...r, texto: `⏳ ${mencion(actual)} se quedó pensando y tira un golpe solo.\n${r.texto}` })).catch((e) => console.error("[pelea] no se pudo avisar:", e.message));
  }, PELEA.SEGUNDOS_TURNO * 1000);
}

function iniciarPelea(d, avisar) {
  const primero = _rng.randomInt(0, 2) === 0 ? d.retador : d.retado;
  const segundo = primero === d.retador ? d.retado : d.retador;
  const pelea = { chat: d.chat, cantidad: d.cantidad, orden: [primero, segundo], turno: 0, turnos: 0, jugadores: {}, timeout: null, avisar };
  for (const u of pelea.orden) pelea.jugadores[u] = { hp: PELEA.HP, curas: PELEA.CURAS, guardia: false };
  globalThis.peleas.set(clave(d.chat, d.retador), pelea);
  globalThis.peleas.set(clave(d.chat, d.retado), pelea);
  armarTurno(pelea);
  return { ok: true, texto: `🥊 *¡Empieza la pelea!* ${d.cantidad * 2} UruCoins en juego.\n${textoTurno(pelea)}`, mentions: pelea.orden };
}

function terminarPelea(pelea, ganador, motivo) {
  clearTimeout(pelea.timeout);
  for (const u of pelea.orden) globalThis.peleas.delete(clave(pelea.chat, u));
  const pozo = pelea.cantidad * 2;
  if (!ganador) {
    for (const u of pelea.orden) ganarCoins(pelea.chat, u, pelea.cantidad, "duelo_devolucion");
    return `${motivo} Empate: cada uno recupera sus ${pelea.cantidad} UruCoins.`;
  }
  ganarCoins(pelea.chat, ganador, pozo, "duelo_premio");
  const perdedor = pelea.orden.find((u) => u !== ganador);
  const devuelto = perdedor ? protegerApuesta(pelea.chat, perdedor, pelea.cantidad) : 0;
  return `${motivo}\n🏆 ${mencion(ganador)} gana la pelea y se lleva *${pozo} UruCoins*.${devuelto ? `\n🛡️ ${mencion(perdedor)} tenía escudo y recupera sus ${devuelto}.` : ""}`;
}

// The player's action on their turn. Returns { ok, texto, mentions, terminada } or { ok: false, error }.
export function accionPelea(chat, usuario, nombre) {
  const pelea = globalThis.peleas.get(clave(chat, usuario));
  if (!pelea) return { ok: false, error: "No estás en ninguna pelea. Desafiá a alguien con .pelea @alguien 20" };
  const actual = pelea.orden[pelea.turno];
  if (actual !== usuario) return { ok: false, error: `No es tu turno, es el de ${mencion(actual)}.`, mentions: [actual] };
  const yo = pelea.jugadores[usuario];
  const rivalId = rivalDe(pelea, usuario);
  const rival = pelea.jugadores[rivalId];
  const lineas = [];

  if (nombre === "curar") {
    if (yo.curas <= 0) return { ok: false, error: "Ya usaste tus curas en esta pelea." };
    const cura = Math.min(_rng.randomInt(20, 31), PELEA.HP - yo.hp);
    yo.hp += cura;
    yo.curas--;
    lineas.push(`💊 ${mencion(usuario)} se cura +${cura}`);
  } else if (nombre === "cubrirse") {
    yo.guardia = true;
    lineas.push(`🛡️ ${mencion(usuario)} se cubre: el próximo golpe le hace la mitad, y puede contraatacar`);
  } else {
    const ataque = ATAQUES[nombre];
    if (!ataque) return { ok: false, error: "Opciones: .golpe · .patada · .cubrirse · .curar" };
    yo.guardia = false;
    if (_rng.randomInt(0, 100) < ataque.acierto) {
      let danio = _rng.randomInt(ataque.min, ataque.max + 1);
      const critico = _rng.randomInt(0, 100) < ataque.critico;
      if (critico) danio = Math.round(danio * 1.5);
      let nota = critico ? " ✨ crítico" : "";
      if (rival.guardia) {
        danio = Math.ceil(danio / 2);
        nota += ` (a medias, ${mencion(rivalId)} estaba cubierto)`;
      }
      rival.hp = Math.max(0, rival.hp - danio);
      lineas.push(`${ataque.emoji} ${mencion(usuario)} lanza ${ataque.nombre} y conecta: −${danio}${nota}`);
    } else {
      lineas.push(`${ataque.emoji} ${mencion(usuario)} lanza ${ataque.nombre}... y falla`);
      if (rival.guardia && _rng.randomInt(0, 100) < 40) {
        const contra = _rng.randomInt(8, 13);
        yo.hp = Math.max(0, yo.hp - contra);
        lineas.push(`↩️ ${mencion(rivalId)} contraataca desde la guardia: −${contra}`);
      }
    }
    rival.guardia = false;
  }

  pelea.turnos++;
  const mentions = [...pelea.orden];
  if (rival.hp <= 0) return { ok: true, terminada: true, mentions, texto: `${lineas.join("\n")}\n${vidaDe(pelea, usuario)}\n${vidaDe(pelea, rivalId)}\n${terminarPelea(pelea, usuario, `💀 ${mencion(rivalId)} cae.`)}` };
  if (yo.hp <= 0) return { ok: true, terminada: true, mentions, texto: `${lineas.join("\n")}\n${vidaDe(pelea, usuario)}\n${vidaDe(pelea, rivalId)}\n${terminarPelea(pelea, rivalId, `💀 ${mencion(usuario)} cae por el contraataque.`)}` };
  if (pelea.turnos >= PELEA.MAX_TURNOS) {
    const [p, q] = pelea.orden;
    const ganador = pelea.jugadores[p].hp === pelea.jugadores[q].hp ? null : pelea.jugadores[p].hp > pelea.jugadores[q].hp ? p : q;
    return { ok: true, terminada: true, mentions, texto: `${lineas.join("\n")}\n${vidaDe(pelea, p)}\n${vidaDe(pelea, q)}\n${terminarPelea(pelea, ganador, "🔔 Se acabaron los turnos.")}` };
  }
  pelea.turno = 1 - pelea.turno;
  armarTurno(pelea);
  return { ok: true, terminada: false, mentions, texto: `${lineas.join("\n")}\n${textoTurno(pelea)}` };
}

export function textoPelea(chat, usuario) {
  const pelea = globalThis.peleas.get(clave(chat, usuario));
  return pelea ? `🥊 *Pelea en curso* — ${pelea.cantidad * 2} UruCoins en juego\n${textoTurno(pelea)}` : null;
}
