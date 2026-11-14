// The markets on football matches (.partidos, .evento partido N). The bot follows the Uruguayan league, the
// Libertadores, the Sudamericana and Uruguay's national team through a results source (lib/espn.js); it opens on its
// own the markets of Peñarol's and Nacional's matches a day before, in the groups where the markets run, and an admin
// opens any other from .partidos. When the match ends the bot resolves them: the result at 90 minutes, or who goes
// through. What it can't tell (a match abandoned, a source that doesn't answer) it leaves to an admin's .resolver, and
// says so.
import { guardarPartido, actualizarPartido, getPartido, partidosEntre, equiposDe, borrarPartidosViejos, gruposParaMercados, mercadosDelPartido, mercadosConPartidoPendientes, getMercado, actualizarMercado, crearPendiente, totalMensajesEntre } from "../database-functions.js";
import * as fuente from "./espn.js";
import { abrirMercado, resolverPorPartido, anularPorPartido, textoMercado } from "./mercados.js";
import { textoFecha, DIA_MS } from "./tiempo.js";
import { estaApagado } from "./juegos-apagados.js";
import { juegosAbiertos } from "./horario-juegos.js";
import { ultimosDias } from "./actividad.js";
import { limpiarPalabra } from "./comandos.js";
import { conexion, lidDelBot } from "./conexion.js";
import { COINS } from "./urucoins.js";

const MIN = 60 * 1000;
export const PARTIDOS = {
  DIAS_ADELANTE: 7, // what .partidos shows, and what the source is asked for
  REFRESCO_MS: 6 * 60 * MIN, // how often the matches ahead are asked for again
  ESPERA_FIN_MS: 105 * MIN, // from kickoff, when it's worth asking whether a match ended
  CONSULTA_CADA_MS: 15 * MIN, // and from then on, how often
  SIN_RESULTADO_MS: 24 * 60 * MIN, // from kickoff, when the admins are told the bot has no result
  ABRIR_ANTES_MS: 24 * 60 * MIN, // how long before kickoff the bot opens Peñarol's and Nacional's markets
  MIN_ANTES_MS: 30 * MIN, // and not with less than this left: nobody would get to bet
  CAMBIO_TOLERADO_MS: 2 * 60 * MIN, // a kickoff moved this much or less moves the closing; more, the market is void
  ACTIVIDAD_DIAS: 14, // a group that wrote nothing in this many days gets no markets: the bot may not be in it
  GUARDAR_DIAS: 30, // matches older than this are dropped, unless a market still waits for one
  MAX_LINEAS: 25, // .partidos
};

const COMPETENCIAS = new Map(fuente.COMPETENCIAS.map((c) => [c.codigo, c]));
export const nombreDeCompetencia = (codigo) => COMPETENCIAS.get(codigo)?.nombre || codigo;

// In memory: when the matches ahead were last asked for, and when each competition's day was last asked about (a
// restart starts over, which only means asking once more).
let ultimaActualizacion = 0;
let enCurso = false;
const consultados = new Map(); // "competition|day" -> when
export function reiniciarPartidos() {
  ultimaActualizacion = 0;
  enCurso = false;
  consultados.clear();
}

// ---------- which groups ----------

// Whether the markets run in a group: the switches .evento and .jugar go through (games, casino, coins, the markets
// switched off one by one, .banchat, .modoadmin), and someone wrote there in the last two weeks: the bot keeps the row
// of every group it was ever in, and one it left would get markets nobody sees. Not the games' hours, which don't stop
// the markets (handle-message.js); what the bot opens on its own waits for them (abrirMercadosSolos).
export function andanLosMercados(fila, ahora = Date.now()) {
  if (!fila || !String(fila.remoteJid || "").endsWith("@g.us")) return false;
  if (!fila.games || fila.casino === 0 || fila.monedas === 0 || fila.isBanned || fila.adminMode) return false;
  if (estaApagado(fila, "mercados")) return false;
  return totalMensajesEntre(fila.remoteJid, ultimosDias(new Date(ahora), PARTIDOS.ACTIVIDAD_DIAS)) > 0;
}

// ---------- the matches ----------

// What the source gave, kept: of a national teams' competition, only Uruguay's matches.
function guardar(codigo, partidos, ahora) {
  const comp = COMPETENCIAS.get(codigo);
  let n = 0;
  for (const p of partidos) {
    if (comp?.soloSeleccion && p.localId !== fuente.SELECCION && p.visitanteId !== fuente.SELECCION) continue;
    guardarPartido(p, ahora);
    n++;
  }
  return n;
}

// The matches from yesterday to a week ahead, of every competition followed, asked for again and kept. Returns how
// many requests it took.
export async function actualizarPartidos(ahora = Date.now()) {
  let pedidos = 0;
  for (const comp of fuente.COMPETENCIAS) {
    const r = await fuente.partidosEntre(comp.codigo, ahora - DIA_MS, ahora + PARTIDOS.DIAS_ADELANTE * DIA_MS);
    pedidos += r?.pedidos || 1;
    if (r) guardar(comp.codigo, r.partidos, ahora);
  }
  borrarPartidosViejos(ahora - PARTIDOS.GUARDAR_DIAS * DIA_MS);
  return pedidos;
}

// Whether who goes through is settled in this match: the second leg of a tie, or a knockout played once (a final, a
// cup's rounds). Not in a first leg, nor where ESPN says it's a tie without saying which leg.
const ELIMINATORIA = /final|semi|quarter|round-of|play-?off|knockout|octavos|cuartos|repechaje/i;
export function seDefineAhi(p) {
  if (Number(p.vuelta) === 2) return true;
  if (Number(p.vuelta) !== 0) return false;
  return ELIMINATORIA.test(p.fase || "") && !/group|grupo/i.test(p.fase || "");
}

// ---------- the markets on a match ----------

const tituloDe = (p, tipo) => (tipo === "pasa" ? `¿Quién pasa? ${p.local} vs ${p.visitante}` : `${p.local} vs ${p.visitante} (a los 90')`).slice(0, 80);

// The options, the home side first: with "Empate" in between for the result at 90 minutes. Two sides with the same
// name (a Nacional against another Nacional) get told apart.
function opcionesDe(p, tipo) {
  let [a, b] = [p.local, p.visitante].map((n) => n.slice(0, 30));
  if (limpiarPalabra(a) === limpiarPalabra(b)) [a, b] = [`${a.slice(0, 26)} (L)`, `${b.slice(0, 26)} (V)`];
  return tipo === "pasa" ? [a, b] : [a, "Empate", b];
}

const abrirEn = (chat, usuario, p, tipo) => abrirMercado(chat, usuario, tituloDe(p, tipo), opcionesDe(p, tipo), p.inicio, { partido: p.id, tipo });

// The announcement of the markets just opened on a match, each with how to bet.
function textoAbiertos(p, ids, encabezado) {
  const cuerpo = ids.map((id) => `${textoMercado(getMercado(id))}\nApostá con .jugar ${id} <opción> <cantidad>`).join("\n\n");
  return `${encabezado} ${p.local} vs ${p.visitante} · ${nombreDeCompetencia(p.competencia)} · ${textoFecha(p.inicio)}\n\n${cuerpo}\n\nLas apuestas cierran cuando empieza el partido, y el resultado lo cargo yo cuando termine.`;
}

// .evento partido N [pasa]: an admin opens the market of a match from .partidos. Returns { ok, id, mensaje | error }.
export function abrirDesdeLista(chat, usuario, numero, palabra = "", ahora = Date.now()) {
  const p = Number.isInteger(numero) && numero > 0 ? getPartido(numero) : null;
  if (!p) return { ok: false, error: "No hay ningún partido con ese número. Mirá los próximos con .partidos" };
  if (p.estado !== "programado" || p.inicio <= ahora + MIN) return { ok: false, error: `El partido #${p.id} ya empezó o no se va a jugar: no se abren apuestas.` };
  const pal = limpiarPalabra(palabra);
  const tipo = !pal || pal === "90" ? "90" : pal === "pasa" ? "pasa" : null;
  if (!tipo) return { ok: false, error: `Uso: .evento partido ${p.id} (el resultado a los 90 minutos) o .evento partido ${p.id} pasa (quién pasa de fase).` };
  if (tipo === "pasa" && !seDefineAhi(p)) {
    return { ok: false, error: Number(p.vuelta) === 1 ? `El #${p.id} es la ida: la serie se define en la vuelta. Abrí el de quién pasa en ese partido.` : `En el #${p.id} no se pasa de fase: abrí el de los 90 minutos con .evento partido ${p.id}.` };
  }
  const previo = mercadosDelPartido(chat, p.id, tipo).find((m) => m.estado === "abierto" || m.estado === "cerrado");
  if (previo) return { ok: false, error: `Ya hay un mercado de ese partido: el #${previo.id}.` };
  const id = abrirEn(chat, usuario, p, tipo);
  return { ok: true, id, mensaje: textoAbiertos(p, [id], `⚽ Partido #${p.id}:`) };
}

// What .partidos asks for: a competition by one of its words, or "" for the usual list. undefined for a word that
// isn't one.
const FILTROS = { uruguayo: "uruguayo", uruguay: "uruguayo", liga: "uruguayo", libertadores: "libertadores", sudamericana: "sudamericana", seleccion: "seleccion", celeste: "seleccion" };

// .partidos [competition]: the matches of the next week with their number, to open their markets. The usual list has
// the Uruguayan league, the Uruguayan clubs' cup matches and the national team's; a competition's word lists all of its
// own (a Libertadores group stage is dozens a week).
export function textoPartidos(chat, palabra = "", { ahora = Date.now(), fila = null } = {}) {
  const pal = limpiarPalabra(String(palabra || "").split(/\s+/)[0] || "");
  const filtro = pal ? FILTROS[pal] : "";
  if (filtro === undefined) return "No conozco esa competencia. Probá con .partidos uruguayo, libertadores, sudamericana o seleccion.";
  const uruguayos = equiposDe("uru.1");
  const lista = partidosEntre(ahora, ahora + PARTIDOS.DIAS_ADELANTE * DIA_MS).filter((p) => {
    const comp = COMPETENCIAS.get(p.competencia);
    if (!comp || p.estado !== "programado") return false;
    if (filtro) return comp.grupo === filtro;
    if (comp.grupo === "libertadores" || comp.grupo === "sudamericana") return uruguayos.has(p.local_id) || uruguayos.has(p.visitante_id);
    return true;
  });
  const de = filtro ? ` de ${filtro === "seleccion" ? "la selección" : filtro === "uruguayo" ? "el Uruguayo" : `la ${nombreDeCompetencia(`conmebol.${filtro}`)}`}` : "";
  if (!lista.length) return `⚽ No tengo partidos${de} en los próximos ${PARTIDOS.DIAS_ADELANTE} días.`;
  const lineas = lista.slice(0, PARTIDOS.MAX_LINEAS).map((p) => {
    const abiertos = ["90", "pasa"].flatMap((t) => mercadosDelPartido(chat, p.id, t)).filter((m) => m.estado === "abierto" || m.estado === "cerrado");
    return `#${p.id} · ${textoFecha(p.inicio, ahora)} · ${p.local} vs ${p.visitante} · ${nombreDeCompetencia(p.competencia)}${abiertos.length ? ` 📊 ${abiertos.map((m) => `#${m.id}`).join(" ")}` : ""}`;
  });
  if (lista.length > PARTIDOS.MAX_LINEAS) lineas.push(`… y ${lista.length - PARTIDOS.MAX_LINEAS} más: .partidos uruguayo, libertadores, sudamericana o seleccion los separa.`);
  const solos = fila?.mercadosAuto === 0 ? "Acá no abro solos los de Peñarol y Nacional (.mercadosauto on)." : "Los de Peñarol y Nacional los abro yo un día antes.";
  return `⚽ *Próximos partidos${de}*\n${lineas.join("\n")}\n\nUn admin abre las apuestas con .evento partido N (el resultado a los 90 minutos) o .evento partido N pasa (quién pasa de fase, si se define en ese partido). ${solos}`;
}

// ---------- the bot on its own ----------

// Peñarol's and Nacional's matches of the next day get their markets in every group where the markets run and
// .mercadosauto is on: the result at 90 minutes, and who goes through when it's settled in that match. Once per group
// and match: one an admin voided stays void. A group with game hours (.horariojuegos) gets them, and their notice, the
// first time its hours are open in that day before the match: what the bot says on its own keeps to them, though the
// markets themselves don't stop outside them. Returns how many it opened.
export async function abrirMercadosSolos(ahora = Date.now(), client = conexion.client) {
  const candidatos = partidosEntre(ahora + PARTIDOS.MIN_ANTES_MS, ahora + PARTIDOS.ABRIR_ANTES_MS).filter(
    (p) => p.estado === "programado" && (fuente.EQUIPOS_QUE_ABREN.includes(p.local_id) || fuente.EQUIPOS_QUE_ABREN.includes(p.visitante_id)),
  );
  if (!candidatos.length) return 0;
  const grupos = gruposParaMercados().filter((f) => f.mercadosAuto !== 0 && andanLosMercados(f, ahora) && juegosAbiertos(f, new Date(ahora)));
  const quien = lidDelBot(client) || "claudia";
  let abiertos = 0;
  for (const p of candidatos) {
    const juegan = [[p.local_id, p.local], [p.visitante_id, p.visitante]].filter(([id]) => fuente.EQUIPOS_QUE_ABREN.includes(id)).map(([, nombre]) => nombre);
    const encabezado = juegan.length === 2 ? "⚽ ¡Clásico!" : `⚽ Juega ${juegan[0]}:`;
    for (const fila of grupos) {
      const chat = fila.remoteJid;
      const tipos = ["90", ...(seDefineAhi(p) ? ["pasa"] : [])].filter((t) => !mercadosDelPartido(chat, p.id, t).length);
      if (!tipos.length) continue;
      const ids = tipos.map((t) => abrirEn(chat, quien, p, t));
      try {
        await client.sendMessage(chat, { text: textoAbiertos(p, ids, encabezado) });
        abiertos += ids.length;
      } catch (e) {
        // Not in the group anymore, most likely: markets nobody saw are void, and stay so.
        for (const id of ids) actualizarMercado(id, { estado: "anulado" });
        console.error(`[partidos] no pude avisar los mercados de ${chat}: ${e.message}`);
      }
    }
  }
  return abiertos;
}

// The option that won a market on a match that ended, with a line on how: { ganadora, como }, or null when the bot
// can't tell. The result at 90 minutes is the score of a match that ended in them; of one that went to extra time or
// penalties, what its summary says of the first two periods, or a draw when it was played once (it went on because it
// was a draw). Who goes through is the series' when it's a tie, the match's winner otherwise.
export function desenlace(p, tipo) {
  const r = p?.resultado;
  if (p?.estado !== "terminado" || !r) return null;
  if (tipo === "pasa") {
    const pasa = r.serie ? (r.serie.completa ? r.serie.pasa : null) : r.ganador;
    if (pasa !== "local" && pasa !== "visitante") return null;
    const como = r.penales ? ` por penales (${r.penales[0]}-${r.penales[1]})` : r.definicion === "alargue" ? " en el alargue" : "";
    return { ganadora: pasa === "local" ? 0 : 1, como: `Pasa ${pasa === "local" ? p.local : p.visitante}${como}.` };
  }
  if (tipo !== "90") return null;
  const a90 = r.definicion === "90" ? r.goles : r.a90 || null;
  if (Array.isArray(a90)) {
    const [l, v] = a90;
    return { ganadora: l > v ? 0 : l < v ? 2 : 1, como: `${r.definicion === "90" ? "Terminó" : "A los 90 iba"} ${p.local} ${l}-${v} ${p.visitante}.` };
  }
  if (Number(p.vuelta) === 0 && (r.definicion === "alargue" || r.definicion === "penales")) return { ganadora: 1, como: "A los 90 terminó empatado." };
  return null;
}

const enviar = async (client, chat, r) => {
  if (!r) return;
  try {
    await client.sendMessage(chat, { text: r.texto, mentions: r.mentions || [] });
  } catch (e) {
    console.error(`[partidos] no pude avisar en ${chat}: ${e.message}`);
  }
};

// The markets that wait for a match: its result asked for once it should be over, every 15 minutes, and the summary
// of one that went to extra time; then resolved, voided (postponed, moved more than two hours) or, with nothing after
// a day, left to the admins with a notice. An open one whose match moved a little closes at its new time. Returns how
// many requests it took.
export async function seguirPartidos(ahora = Date.now(), client = conexion.client) {
  const pendientes = mercadosConPartidoPendientes();
  if (!pendientes.length) return 0;
  const ids = [...new Set(pendientes.map((m) => m.partido))];
  let pedidos = 0;

  // The days to ask about, each competition's once.
  const porConsultar = new Map();
  for (const p of ids.map(getPartido)) {
    if (!p || p.estado === "terminado" || p.estado === "postergado") continue;
    if (ahora < p.inicio + PARTIDOS.ESPERA_FIN_MS || ahora > p.inicio + PARTIDOS.SIN_RESULTADO_MS) continue;
    const dia = fuente.diaEspn(p.inicio);
    porConsultar.set(`${p.competencia}|${dia}`, [p.competencia, dia]);
  }
  for (const [clave, [codigo, dia]] of porConsultar) {
    if (ahora - (consultados.get(clave) || 0) < PARTIDOS.CONSULTA_CADA_MS) continue;
    consultados.set(clave, ahora);
    const r = await fuente.partidosDelDia(codigo, dia);
    pedidos++;
    if (r) guardar(codigo, r.partidos, ahora);
  }

  // A result at 90 minutes that the score doesn't give, from the summary: asked once (a90 null: asked, not there).
  for (const p of ids.map(getPartido)) {
    const r = p?.resultado;
    if (p?.estado !== "terminado" || !r || r.definicion === "90" || "a90" in r) continue;
    if (!pendientes.some((m) => m.partido === p.id && m.tipo === "90")) continue;
    const a90 = await fuente.golesA90(p);
    pedidos++;
    actualizarPartido(p.id, { resultado: { ...r, a90 } });
  }

  for (const m of pendientes) {
    const p = getPartido(m.partido);
    if (!p) continue;
    // The kickoff moved: a little, the bets close at the new time; more, the market goes, and the bot may open one for
    // the new date.
    if (m.estado === "abierto" && p.estado === "programado" && p.inicio !== m.cierra_en) {
      if (Math.abs(p.inicio - m.cierra_en) <= PARTIDOS.CAMBIO_TOLERADO_MS) {
        actualizarMercado(m.id, { cierra_en: p.inicio });
        crearPendiente(m.chat, m.creado_por, "cerrar_mercado", { id: m.id }, p.inicio);
        crearPendiente(m.chat, m.creado_por, "anular_mercado", { id: m.id }, p.inicio + COINS.MERCADO_DIAS_PARA_RESOLVER * DIA_MS);
        await enviar(client, m.chat, { texto: `📊 El partido del mercado #${m.id} cambió de hora: las apuestas cierran ${textoFecha(p.inicio, ahora)}.` });
      } else {
        await enviar(client, m.chat, anularPorPartido(m.id, "Cambió la fecha del partido.", { soltar: true }));
      }
      continue;
    }
    if (p.estado === "postergado") {
      await enviar(client, m.chat, anularPorPartido(m.id, "El partido se postergó o se suspendió.", { soltar: true }));
      continue;
    }
    const d = desenlace(p, m.tipo);
    if (d) {
      const r = resolverPorPartido(m.id, d.ganadora, d.como);
      if (r) await enviar(client, m.chat, r);
      continue;
    }
    if (!m.avisado && ahora >= p.inicio + PARTIDOS.SIN_RESULTADO_MS) {
      actualizarMercado(m.id, { avisado: 1 });
      const opciones = m.opciones.join(", ");
      await enviar(client, m.chat, { texto: `📊 No tengo el resultado del mercado #${m.id} (${m.titulo}). Un admin que no haya apostado lo carga con .resolver ${m.id} <opción> (${opciones}), o .resolver ${m.id} anulado para devolver todo.` });
    }
  }
  return pedidos;
}

// The pass of every 5 minutes (lib/tareas-programadas.js): the matches ahead asked for every 6 hours, the markets that
// wait for one followed, and Peñarol's and Nacional's opened. Nothing is asked of the source while no group can have
// markets and none waits for a result. One pass at a time.
export async function chequearPartidos(ahora = Date.now(), client = conexion.client) {
  if (enCurso) return false;
  enCurso = true;
  try {
    const hayGrupos = gruposParaMercados().some((f) => andanLosMercados(f, ahora));
    if (!hayGrupos && !mercadosConPartidoPendientes().length) return false;
    if (hayGrupos && ahora - ultimaActualizacion >= PARTIDOS.REFRESCO_MS) {
      ultimaActualizacion = ahora;
      await actualizarPartidos(ahora);
    }
    await seguirPartidos(ahora, client);
    if (hayGrupos) await abrirMercadosSolos(ahora, client);
    return true;
  } finally {
    enCurso = false;
  }
}
