// The last call before a market's bets close. The bot opens Peñarol's and Nacional's markets a day before the match,
// and an admin's can stay open for days; in between nothing reminded anyone, and the next thing the group heard was
// that the bets had closed, so whoever missed the opening notice didn't know there was something to bet on. About three
// hours before the closing the market is shown again, with its pot and what each option pays by then: once, one card
// per market so a reply chooses it unambiguously, without tagging anyone. Like the markets the bot opens, it keeps to the games'
// hours (.horariojuegos), and it never goes out at night. A market opened less than two hours before has its opening
// notice still in sight, and gets none.
import { mercadosPorCerrar, actualizarMercado, getChat, getPartido } from "../database-functions.js";
import { andanLosMercados, nombreDeCompetencia } from "./partidos.js";
import { enviarTarjetaMercado } from "./mercados.js";
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

function encabezadoUltimoLlamado(mercado, ahora) {
  const p = mercado.partido ? getPartido(mercado.partido) : null;
  const de = p ? `: ${p.local} vs ${p.visitante} · ${nombreDeCompetencia(p.competencia)} · ${textoFecha(p.inicio, ahora)}` : ".";
  return `⏰ Quedan ${duracion(mercado.cierra_en - ahora)} para apostar${de}`;
}

// The pass of every 5 minutes (lib/tareas-programadas.js): the markets whose bets close in three hours or less, and
// in more than half an hour, get their last call where the markets run and the games' hours are open. Marked before it
// goes out, so two passes can't both send it; a failed send is tried again on the next passes, a few times
// (lib/avisos-programados.js). Returns how many went out.
export async function chequearUltimosLlamados(ahora = Date.now(), client = conexion.client) {
  if (!esHoraDespierta(ahora)) return 0;
  let enviados = 0;
  for (const m of mercadosPorCerrar(ahora + ULTIMO_LLAMADO.MIN_ANTES_MS, ahora + ULTIMO_LLAMADO.ANTES_MS)) {
    if (ahora - m.creado < ULTIMO_LLAMADO.MIN_ABIERTO_MS) continue;
    const fila = getChat(m.chat);
    if (!andanLosMercados(fila, ahora) || !juegosAbiertos(fila, new Date(ahora))) continue;
    actualizarMercado(m.id, { recordado: 1 });
    try {
      await enviarTarjetaMercado(client, m, { encabezado: encabezadoUltimoLlamado(m, ahora) });
      enviados++;
    } catch (e) {
      console.error(`[último llamado] no pude avisar en ${m.chat}: ${e.message}`);
      if (volverAIntentar(`${m.chat}|mercado ${m.id}|ultimo-llamado`)) actualizarMercado(m.id, { recordado: 0 });
    }
  }
  return enviados;
}
