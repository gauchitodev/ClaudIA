// Where the bot reads football matches and their results (lib/partidos.js): ESPN's public JSON, the one its own site
// uses. It takes no key and costs nothing; it's also not an official API, with no published terms, limits or
// guarantee, so it may change without notice. What's ESPN's is in this module alone: a paid source with the same
// shape (API-Football, for one) would take its place without touching the markets.
// Checked on 2026-11-11 against its answers for the Uruguayan league (uru.1), the Libertadores, the 2024 Copa América
// and the friendlies: the shapes read here are those. Asked in Spanish (lang=es): the teams come as they're called
// here ("República Dominicana", not "Dominican Rep"), and the states' and the phases' names stay ESPN's own, the same
// in any language.
export const ESPN = {
  BASE: "https://site.api.espn.com/apis/site/v2/sports/soccer",
  TIMEOUT_MS: 15000,
};

// By ESPN's ids. The clubs whose matches get their markets opened by the bot: Peñarol and Nacional of Montevideo (a
// name alone won't do: the Libertadores has more than one Nacional). And Uruguay's national team.
export const EQUIPOS_QUE_ABREN = ["2683", "2684"];
export const SELECCION = "212";

// The competitions followed, by ESPN's code. soloSeleccion: only Uruguay's matches are kept from it.
export const COMPETENCIAS = [
  { codigo: "uru.1", nombre: "Uruguayo", grupo: "uruguayo" },
  { codigo: "conmebol.libertadores", nombre: "Libertadores", grupo: "libertadores" },
  { codigo: "conmebol.sudamericana", nombre: "Sudamericana", grupo: "sudamericana" },
  { codigo: "fifa.worldq.conmebol", nombre: "Eliminatorias", grupo: "seleccion", soloSeleccion: true },
  { codigo: "conmebol.america", nombre: "Copa América", grupo: "seleccion", soloSeleccion: true },
  { codigo: "fifa.world", nombre: "Mundial", grupo: "seleccion", soloSeleccion: true },
  { codigo: "fifa.friendly", nombre: "Amistoso", grupo: "seleccion", soloSeleccion: true },
];

// A JSON from ESPN, or null when it doesn't answer, answers an error or doesn't parse. Nothing of the bot's goes in it:
// the competition and the day are all it asks for.
async function pedirJson(url) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ESPN.TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: control.signal });
    if (!res.ok) {
      console.error(`[partidos] ESPN respondió ${res.status} a ${url}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error(`[partidos] ESPN no respondió (${url}): ${e.message}`);
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

// Swappable from the tests.
export const _dep = { pedir: pedirJson };

// ESPN's day for a moment: the date in New York (YYYYMMDD), which is how its scoreboard files the matches. A match at
// 01:15 UTC on the 15th is the 14th's there.
export function diaEspn(ms) {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const valor = (tipo) => partes.find((p) => p.type === tipo)?.value || "";
  return `${valor("year")}${valor("month")}${valor("day")}`;
}

const FINALES = new Set(["STATUS_FULL_TIME", "STATUS_FINAL_AET", "STATUS_FINAL_PEN"]);
// How it ended: in the 90 minutes, after extra time, or on penalties.
const DEFINICION = { STATUS_FULL_TIME: "90", STATUS_FINAL_AET: "alargue", STATUS_FINAL_PEN: "penales" };

// What lib/partidos.js understands of a match's state. "postergado" is postponed or cancelled: what ESPN calls them
// wasn't seen in a real answer, so it's read off the name and its text. "otro" is whatever ended without an
// accepted result (abandoned, suspended, awarded): an admin's call.
export function estadoDe(tipo = {}) {
  const nombre = String(tipo.name || "");
  if (FINALES.has(nombre) && tipo.completed) return "terminado";
  if (/postpon|pospuest|posterg|aplaz|cancel/i.test(`${nombre} ${tipo.description || ""} ${tipo.detail || ""}`)) return "postergado";
  if (tipo.state === "pre") return "programado";
  if (tipo.state === "in") return "jugando";
  return "otro";
}

const numero = (v) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && Number.isFinite(n) ? n : null;
};
const nombreDe = (equipo) => String(equipo?.shortDisplayName || equipo?.displayName || equipo?.name || "").trim();

// One of ESPN's events as a match, or null if it lacks something a market needs (its id, its two sides, its start).
// The result goes only once it ended: the goals, the penalties if there were any, who won the match, and the series
// when it's a two-legged tie (whether it's over and who went through).
export function leerEvento(e, codigo) {
  const c = e?.competitions?.[0];
  const lados = c?.competitors || [];
  const local = lados.find((x) => x.homeAway === "home");
  const visitante = lados.find((x) => x.homeAway === "away");
  const inicio = Date.parse(e?.date);
  if (!e?.id || !local?.team?.id || !visitante?.team?.id || !Number.isFinite(inicio)) return null;
  const tipo = c.status?.type || e.status?.type || {};
  const estado = estadoDe(tipo);
  const serie = c.series?.competitors?.length === 2 && Number(c.series.totalCompetitions) > 1 ? c.series : null;
  const lado = (id) => (String(id) === String(local.team.id) ? "local" : String(id) === String(visitante.team.id) ? "visitante" : null);
  let resultado = null;
  if (estado === "terminado") {
    const goles = [numero(local.score), numero(visitante.score)];
    const penales = [numero(local.shootoutScore), numero(visitante.shootoutScore)];
    resultado = {
      definicion: DEFINICION[tipo.name],
      goles: goles.includes(null) ? null : goles,
      penales: penales.includes(null) ? null : penales,
      ganador: local.winner === true ? "local" : visitante.winner === true ? "visitante" : null,
      serie: serie ? { completa: serie.completed === true, pasa: lado(serie.competitors.find((x) => x.winner === true)?.id) } : null,
    };
  }
  return {
    clave: `espn:${e.id}`,
    evento: String(e.id),
    competencia: codigo,
    fase: String(e.season?.slug || ""),
    // In a two-legged tie, 1 or 2; -1 when ESPN says it's one but not which leg; 0 for a single match.
    vuelta: Number(c.leg?.value) || (serie ? -1 : 0),
    local: nombreDe(local.team),
    visitante: nombreDe(visitante.team),
    localId: String(local.team.id),
    visitanteId: String(visitante.team.id),
    inicio,
    estado,
    detalle: String(tipo.name || ""),
    resultado,
  };
}

// The days that may have matches between two moments, as ESPN days: the ones its calendar lists, when it lists days;
// the ones inside its phases' dates, when it lists phases; all of them, when there's no calendar.
function diasConPartidos(calendario, desde, hasta) {
  const todos = [];
  for (let t = desde; t <= hasta; t += 864e5) todos.push(diaEspn(t));
  const unicos = [...new Set(todos)];
  if (!Array.isArray(calendario) || !calendario.length) return unicos;
  if (calendario.every((x) => typeof x === "string")) {
    const listados = new Set(calendario.map((x) => x.slice(0, 10).replace(/-/g, "")));
    return unicos.filter((d) => listados.has(d));
  }
  const fases = calendario.flatMap((x) => (Array.isArray(x?.entries) && x.entries.length ? x.entries : [x]));
  const rangos = fases.map((f) => [Date.parse(f?.startDate), Date.parse(f?.endDate)]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (!rangos.length) return unicos;
  const dentro = new Set();
  for (const [a, b] of rangos) for (let t = Math.max(a, desde); t <= Math.min(b, hasta); t += 864e5) dentro.add(diaEspn(t));
  // A phase that ends late in a day still covers it.
  for (const [, b] of rangos) if (b >= desde && b <= hasta) dentro.add(diaEspn(b));
  return unicos.filter((d) => dentro.has(d));
}

// A competition's matches on an ESPN day, or on the day ESPN calls current without one: { partidos, calendario } or
// null when ESPN didn't answer. A range of days ("20261107-20261110") answers 400 for football: one day per request.
export async function partidosDelDia(codigo, dia = null) {
  const j = await _dep.pedir(`${ESPN.BASE}/${codigo}/scoreboard?lang=es${dia ? `&dates=${dia}` : ""}`);
  if (!j || !Array.isArray(j.events)) return null;
  return { partidos: j.events.map((e) => leerEvento(e, codigo)).filter(Boolean), calendario: j.leagues?.[0]?.calendar || null };
}

// A competition's matches from one moment to another: the current day's and each day between the two its calendar
// says may have some. { partidos, pedidos } (how many requests it took), or null when ESPN didn't answer the first.
export async function partidosEntre(codigo, desde, hasta) {
  const actual = await partidosDelDia(codigo);
  if (!actual) return null;
  const porClave = new Map(actual.partidos.map((p) => [p.clave, p]));
  let pedidos = 1;
  for (const dia of diasConPartidos(actual.calendario, desde, hasta)) {
    const r = await partidosDelDia(codigo, dia);
    pedidos++;
    for (const p of r?.partidos || []) porClave.set(p.clave, p);
  }
  return { partidos: [...porClave.values()], pedidos };
}

// The goals at 90 minutes of a match that went to extra time or penalties, from its summary: the first two periods of
// each side. partido: as lib/partidos.js keeps it (its competencia and its clave, "espn:<id>"). [local, visitante], or
// null when the summary doesn't tell.
export async function golesA90(partido) {
  const evento = String(partido?.clave || "").replace(/^espn:/, "");
  if (!/^\d+$/.test(evento)) return null;
  const j = await _dep.pedir(`${ESPN.BASE}/${partido.competencia}/summary?lang=es&event=${evento}`);
  const lados = j?.header?.competitions?.[0]?.competitors || [];
  const deLado = (homeAway) => {
    const periodos = lados.find((x) => x.homeAway === homeAway)?.linescores;
    if (!Array.isArray(periodos) || periodos.length < 2) return null;
    const dos = periodos.slice(0, 2).map((x) => numero(x?.value ?? x?.displayValue));
    return dos.includes(null) ? null : dos[0] + dos[1];
  };
  const goles = [deLado("home"), deLado("away")];
  return goles.includes(null) ? null : goles;
}
