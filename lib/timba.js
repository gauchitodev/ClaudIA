// The gambling catalogue: which urucoins_log reason belongs to which game, and on which side (money staked vs money
// coming back). It is the single source for .timba (the group ranking) and .mitimba (your own breakdown).
//
// Why it lives here and not inline in the plugins: the same knowledge used to be written in plugins/coins-timba.js as
// two hand-kept lists, with a comment asking whoever adds a game to remember to update them. Forget, and that game
// silently vanishes from the accounts — nothing breaks, the numbers are just quietly wrong. test/motivos.test.mjs now
// checks that every reason the code emits is classified here.

import { movimientosPorUsuarioYMotivo } from "../database-functions.js";
import { nombreDe } from "./menciones.js";

// "apuesta" is what leaves the wallet, "cobro" what comes back (prizes, refunds, shield payouts).
// "apuestaExtra" still counts as money staked but not as a new play: doubling a blackjack hand is the same hand.
// "noJugadas" are refunds that undo a play entirely (a duel nobody accepted, a voided market), so they don't count.
export const JUEGOS = [
  { clave: "ruleta", nombre: "Ruleta", emoji: "🎰", apuesta: ["casino_ruleta"], cobro: ["casino_ruleta_premio", "casino_ruleta_devolucion", "escudo_ruleta"], noJugadas: ["casino_ruleta_devolucion"] },
  { clave: "tragamonedas", nombre: "Tragamonedas", emoji: "🎰", apuesta: ["casino_tragamonedas"], cobro: ["casino_tragamonedas_premio", "escudo_tragamonedas"] },
  {
    clave: "blackjack",
    nombre: "Blackjack",
    emoji: "🃏",
    unidad: "mano",
    apuesta: ["casino_blackjack"],
    apuestaExtra: ["casino_blackjack_doblar", "casino_blackjack_dividir", "casino_blackjack_seguro"],
    cobro: ["casino_blackjack_premio", "casino_blackjack_empate", "casino_blackjack_rendicion", "casino_blackjack_seguro_premio", "casino_blackjack_devolucion", "escudo_blackjack"],
    noJugadas: ["casino_blackjack_devolucion"],
  },
  { clave: "mines", nombre: "Mines", emoji: "💣", apuesta: ["casino_mines"], cobro: ["casino_mines_premio", "casino_mines_devolucion", "escudo_mines"], noJugadas: ["casino_mines_devolucion"] },
  { clave: "carrera", nombre: "Carrera", emoji: "🐎", apuesta: ["casino_carrera"], cobro: ["casino_carrera_premio", "casino_carrera_devolucion", "escudo_carrera"], noJugadas: ["casino_carrera_devolucion"] },
  { clave: "duelos", nombre: "Duelos", emoji: "⚔️", apuesta: ["duelo_apuesta"], cobro: ["duelo_premio", "duelo_devolucion", "escudo_duelo"], noJugadas: ["duelo_devolucion"] },
  { clave: "loteria", nombre: "Lotería", emoji: "🎟️", apuesta: ["loteria_boletos"], cobro: ["loteria_premio", "loteria_devolucion"], noJugadas: ["loteria_devolucion"] },
  {
    clave: "mercados",
    nombre: "Mercados",
    emoji: "📈",
    apuestaPrefijo: ["mercado_apuesta_"],
    cobro: ["escudo_mercado"],
    cobroPrefijo: ["mercado_premio_", "mercado_devolucion_"],
    noJugadas: ["mercado_devolucion_"],
  },
  { clave: "juegos", nombre: "Apuestas en juegos", emoji: "🎯", apuestaPrefijo: ["apuesta_"], cobro: ["apuesta_ganada", "apuesta_devolucion", "escudo_apuesta"], noJugadas: ["apuesta_devolucion"] },
];

// Shield payouts recorded before the refund started naming its game. They count towards the overall balance but can't
// be attributed to a game, so they stay out of the per-game breakdown.
export const COBROS_SIN_JUEGO = ["escudo_devolucion"];

// Everything else the economy records: passive income, the shop, gifts, owner adjustments. Not gambling, but listed on
// purpose so the consistency test can tell "not a bet" apart from "somebody forgot to classify this".
export const FUERA_DE_TIMBA = {
  exactos: [
    "reaccion_recibida",
    "reaccion_emitida",
    "racha_dia",
    "ganador_mes",
    "juego_ganado",
    "cambio_laburo",
    "sueldo_laburo",
    "trivia_relampago",
    "pregunta_dia",
    "rango_ascenso",
    "adopcion",
    "adopcion_devolucion",
    "saltar_cooldown",
    "regalo_enviado",
    "regalo_recibido",
    "ajuste_owner",
  ],
  prefijos: ["hashtag_", "top_semana_", "compra_", "test_"],
};

// Exact reasons are matched before prefixes: otherwise "apuesta_ganada" (a payout) would fall into the "apuesta_"
// prefix that covers bets placed on games.
export function clasificar(motivo) {
  if (!motivo) return null;
  for (const juego of JUEGOS) {
    if (juego.apuesta?.includes(motivo)) return { juego, tipo: "apuesta", cuentaJugada: true };
    if (juego.apuestaExtra?.includes(motivo)) return { juego, tipo: "apuesta", cuentaJugada: false };
    if (juego.cobro?.includes(motivo)) return { juego, tipo: "cobro", anulaJugada: juego.noJugadas?.includes(motivo) ?? false };
  }
  for (const juego of JUEGOS) {
    if (juego.apuestaPrefijo?.some((p) => motivo.startsWith(p))) return { juego, tipo: "apuesta", cuentaJugada: true };
    const cobro = juego.cobroPrefijo?.find((p) => motivo.startsWith(p));
    if (cobro) return { juego, tipo: "cobro", anulaJugada: juego.noJugadas?.includes(cobro) ?? false };
  }
  return null;
}

// Does the economy know this reason at all? Used by the consistency test.
export function esMotivoConocido(motivo) {
  if (clasificar(motivo)) return true;
  if (COBROS_SIN_JUEGO.includes(motivo)) return true;
  if (FUERA_DE_TIMBA.exactos.includes(motivo)) return true;
  return FUERA_DE_TIMBA.prefijos.some((p) => motivo.startsWith(p));
}

// ---------- aggregation ----------

// Turns the rows of movimientosPorUsuarioYMotivo into a per-game summary plus the totals.
// "jugadas" counts real plays: the extra bets of a blackjack hand don't add one, and refunds that undo a play
// (a duel nobody took, a voided market) take one away.
export function resumenPorJuego(filas) {
  const porJuego = new Map();
  let cobradoSinJuego = 0;

  for (const fila of filas) {
    const c = clasificar(fila.motivo);
    if (!c) {
      // Shield payouts from before the refund named its game: they count for the balance, not for any game.
      if (COBROS_SIN_JUEGO.includes(fila.motivo)) cobradoSinJuego += fila.entradas;
      continue;
    }
    if (!porJuego.has(c.juego.clave)) porJuego.set(c.juego.clave, { juego: c.juego, apostado: 0, cobrado: 0, jugadas: 0 });
    const r = porJuego.get(c.juego.clave);
    if (c.tipo === "apuesta") {
      r.apostado += fila.salidas;
      if (c.cuentaJugada) r.jugadas += fila.n;
    } else {
      r.cobrado += fila.entradas;
      if (c.anulaJugada) r.jugadas -= fila.n;
    }
  }

  // A game with no plays and nothing won or lost never happened: a duel nobody accepted, a voided market. It is left
  // out of the breakdown AND out of the totals, so the lines always add up to the total shown.
  const juegos = [...porJuego.values()]
    .map((r) => ({ ...r, jugadas: Math.max(0, r.jugadas), neto: r.cobrado - r.apostado }))
    .filter((r) => r.jugadas > 0 || r.neto !== 0)
    .sort((a, b) => b.apostado - a.apostado);

  const apostado = juegos.reduce((t, r) => t + r.apostado, 0);
  const cobrado = juegos.reduce((t, r) => t + r.cobrado, 0) + cobradoSinJuego;
  return { juegos, apostado, cobrado, jugadas: juegos.reduce((t, r) => t + r.jugadas, 0), neto: cobrado - apostado };
}

const signo = (n) => (n > 0 ? `🟢 +${n}` : n < 0 ? `🔴 ${n}` : "⚪ 0");
const jugadasTexto = (r) => `${r.jugadas} ${r.juego.unidad === "mano" ? (r.jugadas === 1 ? "mano" : "manos") : r.jugadas === 1 ? "jugada" : "jugadas"}`;

// .mitimba: one person's breakdown in this group. Returns { texto, mentions }.
export function textoTimbaPersonal(chat, lid, { desde = 0, esPropio = true, soloMes = false } = {}) {
  const r = resumenPorJuego(movimientosPorUsuarioYMotivo(chat, { usuario: lid, desde }));
  const quien = esPropio ? "Tu timba" : `La timba de ${nombreDe(lid)}`;
  const periodo = soloMes ? " este mes" : "";

  if (!r.juegos.length) {
    return { texto: esPropio ? `🎰 No apostaste nada${periodo} en este grupo. Sano.` : `🎰 ${nombreDe(lid)} no apostó nada${periodo} en este grupo.`, mentions: [] };
  }

  const lineas = r.juegos.map((j) => `${j.juego.emoji} *${j.juego.nombre}* — ${j.apostado} apostados en ${jugadasTexto(j)} · ${signo(j.neto)}`);
  return {
    texto: `🎰 *${quien}${periodo ? " este mes" : " en este grupo"}*\n\n${lineas.join("\n")}\n\n*Total:* ${r.apostado} apostados · balance ${signo(r.neto)}`,
    mentions: [],
  };
}

// Local start of the current month, for the "mes" variant of both commands.
export function inicioDeMes(ahora = Date.now()) {
  const d = new Date(ahora);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// .timba: the group ranking, sorted by how much was staked.
export function topTimba(chat, { desde = 0, n = 5 } = {}) {
  const porUsuario = new Map();
  for (const fila of movimientosPorUsuarioYMotivo(chat, { desde })) {
    if (!porUsuario.has(fila.usuario)) porUsuario.set(fila.usuario, []);
    porUsuario.get(fila.usuario).push(fila);
  }
  return [...porUsuario.entries()]
    .map(([usuario, filas]) => ({ usuario, ...resumenPorJuego(filas) }))
    .filter((r) => r.apostado > 0)
    .sort((a, b) => b.apostado - a.apostado)
    .slice(0, n);
}
