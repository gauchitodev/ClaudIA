// The last call before a market's bets close. The bot opens Peñarol's and Nacional's markets a day before the match,
// and an admin's can stay open for days; in between nothing reminded anyone, and the next thing the group heard was
// that the bets had closed, so whoever missed the opening notice didn't know there was something to bet on. About three
// hours before the closing the market is shown again, with its pot and what each option pays by then: once, a match's
// markets in one message, without tagging anyone. Like the markets the bot opens on its own, it keeps to the games'
// hours (.horariojuegos), and it never goes out at night. A market opened less than two hours before has its opening
// notice still in sight, and gets none.
import { mercadosPorCerrar, actualizarMercado, getChat, getPartido } from "../database-functions.js";
import { andanLosMercados, nombreDeCompetencia } from "./partidos.js";
import { textoMercado } from "./mercados.js";
import { juegosAbiertos } from "./horario-juegos.js";
import { esHoraDespierta } from "./tacto.js";
import { volverAIntentar } from "./avisos-programados.js";
import { textoFecha, duracion } from "./tiempo.js";
import { conexion } from "./conexion.js";

const MIN = 60 * 1000;
export const ULTIMO_LLAMADO = {
  ANTES_MS: 3 * 60 * MIN, // how long before the bets close
  MIN_ANTES_MS: 30 * MIN, // and not with less than this left: nobody would get to bet (as with the bot's own markets)
  MIN_ABIERTO_MS: 2 * 60 * MIN, // a market opened more recently than this has its opening notice still in sight
};

// The last call of a group's markets that close together: a match's, or one on its own.
export function textoUltimoLlamado(mercados, ahora = Date.now()) {
  const [primero] = mercados;
  const p = primero.partido ? getPartido(primero.partido) : null;
  const de = p ? `: ${p.local} vs ${p.visitante} · ${nombreDeCompetencia(p.competencia)} · ${textoFecha(p.inicio, ahora)}` : ".";
  const cuerpo = mercados.map((m) => `${textoMercado(m)}\nApostá con .jugar ${m.id} <opción> <cantidad>`).join("\n\n");
  return `⏰ Quedan ${duracion(primero.cierra_en - ahora)} para apostar${de}\n\n${cuerpo}`;
}

// The pass of every 5 minutes (lib/tareas-programadas.js): the markets whose bets close in three hours or less, and
// in more than half an hour, get their last call where the markets run and the games' hours are open. Marked before it
// goes out, so two passes can't both send it; a failed send is tried again on the next passes, a few times
// (lib/avisos-programados.js). Returns how many went out.
export async function chequearUltimosLlamados(ahora = Date.now(), client = conexion.client) {
  if (!esHoraDespierta(ahora)) return 0;
  const tandas = new Map(); // "group|partido N" or "group|mercado N" -> its markets
  for (const m of mercadosPorCerrar(ahora + ULTIMO_LLAMADO.MIN_ANTES_MS, ahora + ULTIMO_LLAMADO.ANTES_MS)) {
    if (ahora - m.creado < ULTIMO_LLAMADO.MIN_ABIERTO_MS) continue;
    const clave = `${m.chat}|${m.partido ? `partido ${m.partido}` : `mercado ${m.id}`}`;
    tandas.set(clave, [...(tandas.get(clave) || []), m]);
  }
  let enviados = 0;
  for (const [clave, mercados] of tandas) {
    const { chat } = mercados[0];
    const fila = getChat(chat);
    if (!andanLosMercados(fila, ahora) || !juegosAbiertos(fila, new Date(ahora))) continue;
    for (const m of mercados) actualizarMercado(m.id, { recordado: 1 });
    try {
      await client.sendMessage(chat, { text: textoUltimoLlamado(mercados, ahora) });
      enviados++;
    } catch (e) {
      console.error(`[último llamado] no pude avisar en ${chat}: ${e.message}`);
      if (volverAIntentar(`${clave}|ultimo-llamado`)) for (const m of mercados) actualizarMercado(m.id, { recordado: 0 });
    }
  }
  return enviados;
}
