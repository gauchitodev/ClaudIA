// Panel de la economía de UruCoins de un grupo: cuánto hay en circulación, qué entró y salió en un período
// agrupado por rubro, y los saldos más altos. Todo sale de urucoins_log, que registra cada movimiento.
import { totalEnCirculacion, movimientosPorMotivo, topCoins } from "../database-functions.js";
import { DIA_MS } from "./tiempo.js";

const RUBROS = [
  ["reaccion_", "Reacciones"],
  ["hashtag_", "Historias, quejas y recomendaciones"],
  ["top_semana_", "Premios semanales"],
  ["ganador_mes", "Premios del mes"],
  ["racha_dia", "Racha diaria"],
  ["pregunta_dia", "Pregunta del día"],
  ["trivia_relampago", "Trivia relámpago"],
  ["juego_ganado", "Juegos ganados"],
  ["apuesta_", "Apuestas en juegos"],
  ["escudo_", "Escudos"],
  ["casino_blackjack", "Blackjack"],
  ["casino_ruleta", "Ruleta"],
  ["casino_tragamonedas", "Tragamonedas"],
  ["casino_carrera", "Carrera de caballos"],
  ["loteria_", "Lotería"],
  ["mercado_", "Mercados de apuestas"],
  ["compra_", "Tienda"],
  ["saltar_cooldown", "Saltar espera de descargas"],
  ["regalo_", "Regalos entre personas"],
  ["duelo_", "Duelos"],
  ["rango_", "Ascensos de rango"],
  ["ajuste_", "Ajustes del owner"],
];
const rubroDe = (motivo) => RUBROS.find(([prefijo]) => motivo.startsWith(prefijo))?.[1] || "Otros";
const mencion = (lid) => `@${lid.split("@")[0]}`;

export function resumenEconomia(chat, dias = 7) {
  const desde = Date.now() - dias * DIA_MS;
  const { total, personas } = totalEnCirculacion(chat);
  const porRubro = new Map();
  for (const m of movimientosPorMotivo(chat, desde)) {
    const nombre = rubroDe(m.motivo);
    const r = porRubro.get(nombre) || { entradas: 0, salidas: 0, n: 0 };
    r.entradas += m.entradas;
    r.salidas += m.salidas;
    r.n += m.n;
    porRubro.set(nombre, r);
  }
  const rubros = [...porRubro.entries()].map(([nombre, r]) => ({ nombre, ...r, neto: r.entradas - r.salidas })).sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto));
  const entradas = rubros.reduce((s, r) => s + r.entradas, 0);
  const salidas = rubros.reduce((s, r) => s + r.salidas, 0);
  return { dias, total, personas, entradas, salidas, neto: entradas - salidas, rubros, ricos: topCoins(chat, 5) };
}

export function textoEconomia(chat, dias = 7) {
  const e = resumenEconomia(chat, dias);
  const lineas = [`🪙 *Economía del grupo* — últimos ${e.dias} días`, `En circulación: *${e.total} UruCoins* entre ${e.personas} ${e.personas === 1 ? "persona" : "personas"}`, `Entraron ${e.entradas} · salieron ${e.salidas} · neto ${e.neto >= 0 ? "+" : ""}${e.neto}`];
  if (e.rubros.length) {
    lineas.push("", "*Por rubro (entra / sale):*");
    for (const r of e.rubros) lineas.push(`• ${r.nombre}: +${r.entradas} / −${r.salidas} (${r.n} mov.)`);
  } else lineas.push("", "Sin movimientos en el período.");
  if (e.ricos.length) lineas.push("", "*Saldos más altos:*", ...e.ricos.map((r, i) => `${i + 1}. ${mencion(r.usuario)} — ${r.saldo}`));
  // lectura rápida para el admin: si entra mucho más de lo que sale, las monedas se inflan
  if (e.entradas > 0 && e.salidas > 0) {
    const ratio = e.entradas / e.salidas;
    lineas.push("", ratio > 2 ? "📈 Entra más del doble de lo que sale: se está inflando. Conviene mirar los topes en COINS." : ratio < 0.5 ? "📉 Sale más del doble de lo que entra: se está drenando." : "⚖️ Entradas y salidas parejas.");
  }
  return { texto: lineas.join("\n"), mentions: e.ricos.map((r) => r.usuario) };
}
