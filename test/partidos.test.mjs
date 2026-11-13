import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, fijarSaldo, clienteFalso } from "./helpers.mjs";
import { claveDia } from "../lib/actividad.js";

// The markets on football matches (lib/partidos.js) and the source they're read from (lib/espn.js): which matches are
// kept, which groups get markets, what the bot opens on its own (Peñarol's and Nacional's), what an admin opens from
// .partidos, and how each one is resolved when the match ends: the result at 90 minutes, or who goes through. ESPN is
// swapped for answers of the shape it gives (checked against real ones on 2026-11-11), made here: no real data.

let F, E, P, M;
const MIN = 60 * 1000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
let respuestas; // url -> what "ESPN" answers
let pedidos; // the urls asked for

const PENAROL = ["2683", "Peñarol"];
const NACIONAL = ["2684", "Nacional"];
const ALBION = ["21403", "Albion"];
const DEFENSOR = ["1007", "Defensor"];
const DANUBIO = ["4817", "Danubio"];
const URUGUAY = ["212", "Uruguay"];
const ARGENTINA = ["202", "Argentina"];
const FLAMENGO = ["819", "Flamengo"];
const PALMEIRAS = ["2029", "Palmeiras"];
const NACIONAL_PY = ["4740", "Nacional"];
const FINALES = new Set(["STATUS_FULL_TIME", "STATUS_FINAL_AET", "STATUS_FINAL_PEN"]);

before(async () => {
  ({ F } = await prepararBase("partidos"));
  E = await import("../lib/espn.js");
  P = await import("../lib/partidos.js");
  M = await import("../lib/mercados.js");
  E._dep.pedir = async (url) => {
    pedidos.push(url);
    return respuestas.has(url) ? structuredClone(respuestas.get(url)) : null;
  };
});
beforeEach(() => {
  respuestas = new Map();
  pedidos = [];
  globalThis.enviados = [];
  P.reiniciarPartidos();
  // Every test with its own matches and groups: the earlier ones' can't get markets, nor wait for a result.
  globalThis.db.prepare(`DELETE FROM partidos`).run();
  globalThis.db.prepare(`UPDATE chats SET casino = 0`).run();
  globalThis.db.prepare(`UPDATE mercados SET estado = 'anulado' WHERE estado IN ('abierto', 'cerrado')`).run();
});

// An event as ESPN's scoreboard gives it.
function evento({ id, local, visitante, inicio, nombre = "STATUS_SCHEDULED", state, completed, goles, penales, ganador, fase = "torneo-clausura", leg, serie, descripcion = "" }) {
  const estado = state ?? (nombre === "STATUS_SCHEDULED" ? "pre" : "post");
  const lado = ([tid, n], homeAway, i) => ({
    homeAway,
    team: { id: tid, shortDisplayName: n, displayName: `${n} Fútbol Club` },
    score: goles ? String(goles[i]) : "0",
    ...(penales && { shootoutScore: penales[i] }),
    winner: ganador === homeAway,
  });
  const c = { competitors: [lado(local, "home", 0), lado(visitante, "away", 1)], status: { type: { name: nombre, state: estado, completed: completed ?? FINALES.has(nombre), description: descripcion } } };
  if (leg) c.leg = { value: leg, displayValue: `${leg} Leg` };
  if (serie) c.series = { title: "Semifinals", totalCompetitions: 2, completed: serie.completa, competitors: [{ id: local[0], winner: serie.pasa === "home" }, { id: visitante[0], winner: serie.pasa === "away" }] };
  return { id: String(id), date: new Date(inicio).toISOString(), season: { slug: fase }, competitions: [c] };
}
const url = (codigo, dia) => `${E.ESPN.BASE}/${codigo}/scoreboard?lang=es${dia ? `&dates=${dia}` : ""}`;
// What ESPN answers for a competition: on its current day (with its calendar) and, when given, on a day.
function cartelera(codigo, eventos, { dia = null, calendario = [] } = {}) {
  respuestas.set(url(codigo, dia), { leagues: [{ calendar: calendario }], events: eventos });
}
// A group where the markets run: someone wrote today, and the switches are as a new group's.
let grupos = 0;
function grupo(ajustes = {}) {
  const chat = `partidos-${++grupos}@g.us`;
  F.initDataDB({ chat, sender: "111@lid", senderJid: "", pushName: "Ana" });
  F.updateChat(chat, { casino: 1, games: 1, monedas: 1, ...ajustes });
  F.sumarMensajeDiario(chat, "111@lid", claveDia());
  for (const u of ["a", "b", "c"]) fijarSaldo(F, chat, u, 500);
  return chat;
}
// A match kept as the source gives it; returns its row.
function partido(datos) {
  const p = E.leerEvento(evento(datos), datos.competencia || "uru.1");
  return F.getPartido(F.guardarPartido(p));
}
const aca = (chat) => globalThis.enviados.filter((e) => e.chat === chat).map((e) => e.msg.text);

// ---------- the source ----------

test("ESPN: un partido terminado, con su resultado; uno por jugar, sin él", () => {
  const ahora = Date.now();
  const p = E.leerEvento(evento({ id: 7, local: NACIONAL, visitante: ALBION, inicio: ahora, nombre: "STATUS_FULL_TIME", goles: [2, 1], ganador: "home" }), "uru.1");
  assert.deepEqual(p, {
    clave: "espn:7",
    evento: "7",
    competencia: "uru.1",
    fase: "torneo-clausura",
    vuelta: 0,
    local: "Nacional",
    visitante: "Albion",
    localId: "2684",
    visitanteId: "21403",
    inicio: ahora,
    estado: "terminado",
    detalle: "STATUS_FULL_TIME",
    resultado: { definicion: "90", goles: [2, 1], penales: null, ganador: "local", serie: null },
  });
  const futuro = E.leerEvento(evento({ id: 8, local: PENAROL, visitante: DEFENSOR, inicio: ahora + DIA }), "uru.1");
  assert.deepEqual([futuro.estado, futuro.resultado], ["programado", null]);
  // Without a short name, the long one.
  const largo = evento({ id: 9, local: PENAROL, visitante: DEFENSOR, inicio: ahora });
  delete largo.competitions[0].competitors[1].team.shortDisplayName;
  assert.equal(E.leerEvento(largo, "uru.1").visitante, "Defensor Fútbol Club");
});

test("ESPN: los estados", () => {
  const de = (type) => E.estadoDe(type);
  assert.equal(de({ name: "STATUS_SCHEDULED", state: "pre" }), "programado");
  assert.equal(de({ name: "STATUS_FIRST_HALF", state: "in" }), "jugando");
  for (const n of ["STATUS_FULL_TIME", "STATUS_FINAL_AET", "STATUS_FINAL_PEN"]) assert.equal(de({ name: n, state: "post", completed: true }), "terminado", n);
  assert.equal(de({ name: "STATUS_FULL_TIME", state: "post", completed: false }), "otro", "terminado sin terminar no se paga");
  assert.equal(de({ name: "STATUS_POSTPONED", state: "post" }), "postergado");
  assert.equal(de({ name: "STATUS_X", state: "post", description: "Canceled" }), "postergado");
  assert.equal(de({ name: "STATUS_X", state: "pre", detail: "Cancelled" }), "postergado");
  // Asked in Spanish, the text comes in Spanish.
  for (const texto of ["Pospuesto", "Postergado", "Aplazado", "Cancelado"]) assert.equal(de({ name: "STATUS_X", state: "post", description: texto }), "postergado", texto);
  assert.equal(de({ name: "STATUS_X", state: "post", description: "Suspendido" }), "otro", "uno suspendido lo decide un admin");
  assert.equal(de({ name: "STATUS_ABANDONED", state: "post" }), "otro");
  assert.equal(de({ name: "STATUS_FORFEIT", state: "post", completed: true }), "otro", "uno dado por ganado lo decide un admin");
  assert.equal(de(undefined), "otro");
});

test("ESPN: alargue, penales, la ida y la vuelta, y lo que no sirve", () => {
  const ahora = Date.now();
  const final = E.leerEvento(evento({ id: 1, local: ARGENTINA, visitante: URUGUAY, inicio: ahora, nombre: "STATUS_FINAL_AET", goles: [1, 0], ganador: "home", fase: "final" }), "conmebol.america");
  assert.deepEqual([final.vuelta, final.fase, final.resultado.definicion, final.resultado.ganador], [0, "final", "alargue", "local"]);
  const vuelta = E.leerEvento(evento({ id: 2, local: FLAMENGO, visitante: PALMEIRAS, inicio: ahora, nombre: "STATUS_FINAL_PEN", goles: [0, 0], penales: [2, 3], ganador: "away", fase: "semifinals", leg: 2, serie: { completa: true, pasa: "away" } }), "conmebol.libertadores");
  assert.deepEqual([vuelta.vuelta, vuelta.resultado.penales, vuelta.resultado.serie], [2, [2, 3], { completa: true, pasa: "visitante" }]);
  // The match is one thing and the tie another: home won the second leg and away went through.
  const global = E.leerEvento(evento({ id: 5, local: FLAMENGO, visitante: PALMEIRAS, inicio: ahora, nombre: "STATUS_FULL_TIME", goles: [1, 0], ganador: "home", fase: "semifinals", leg: 2, serie: { completa: true, pasa: "away" } }), "conmebol.libertadores");
  assert.deepEqual([global.resultado.ganador, global.resultado.serie], ["local", { completa: true, pasa: "visitante" }]);
  const ida = E.leerEvento(evento({ id: 6, local: PALMEIRAS, visitante: FLAMENGO, inicio: ahora, nombre: "STATUS_FULL_TIME", goles: [2, 0], ganador: "home", fase: "semifinals", leg: 1, serie: { completa: false } }), "conmebol.libertadores");
  assert.deepEqual([ida.vuelta, ida.resultado.serie], [1, { completa: false, pasa: null }], "en la ida la serie sigue");
  const sinPierna = evento({ id: 3, local: FLAMENGO, visitante: PALMEIRAS, inicio: ahora, fase: "semifinals", serie: { completa: false } });
  assert.equal(E.leerEvento(sinPierna, "conmebol.libertadores").vuelta, -1, "una serie sin decir qué partido es");
  const roto = (cambio) => {
    const e = evento({ id: 4, local: PENAROL, visitante: NACIONAL, inicio: ahora });
    cambio(e);
    return E.leerEvento(e, "uru.1");
  };
  assert.equal(roto((e) => delete e.id), null);
  assert.equal(roto((e) => e.competitions[0].competitors.pop()), null);
  assert.equal(roto((e) => (e.date = "mañana")), null);
  assert.equal(roto((e) => delete e.competitions[0].competitors[0].team.id), null);
  assert.equal(E.leerEvento({}, "uru.1"), null);
});

test("ESPN: el día de un partido es el de Nueva York", () => {
  assert.equal(E.diaEspn(Date.parse("2024-07-15T01:15Z")), "20240714");
  assert.equal(E.diaEspn(Date.parse("2026-11-14T23:30Z")), "20261114");
  assert.equal(E.diaEspn(Date.parse("2026-11-15T03:30Z")), "20261114");
  assert.equal(E.diaEspn(Date.parse("2026-11-15T05:30Z")), "20261115");
});

test("ESPN: de un rango de días pide el de hoy y solo los días que su calendario dice", async () => {
  const ahora = Date.now();
  const dia = (n) => E.diaEspn(ahora + n * DIA);
  const iso = (n) => `${dia(n).slice(0, 4)}-${dia(n).slice(4, 6)}-${dia(n).slice(6)}T08:00Z`;
  const hoy = evento({ id: 1, local: NACIONAL, visitante: ALBION, inicio: ahora + HORA });
  cartelera("uru.1", [hoy], { calendario: [iso(-30), iso(1), iso(3), iso(30)] });
  cartelera("uru.1", [evento({ id: 2, local: PENAROL, visitante: DEFENSOR, inicio: ahora + DIA })], { dia: dia(1) });
  cartelera("uru.1", [evento({ id: 3, local: DANUBIO, visitante: ALBION, inicio: ahora + 3 * DIA }), hoy], { dia: dia(3) });
  const r = await E.partidosEntre("uru.1", ahora, ahora + 7 * DIA);
  assert.deepEqual(pedidos, [url("uru.1"), url("uru.1", dia(1)), url("uru.1", dia(3))]);
  assert.deepEqual(r.partidos.map((p) => p.clave).sort(), ["espn:1", "espn:2", "espn:3"], "cada partido una vez");
  assert.equal(r.pedidos, 3);

  // A calendar by phases: the days inside them.
  pedidos = [];
  cartelera("conmebol.libertadores", [], { calendario: [{ entries: [{ startDate: new Date(ahora - 60 * DIA).toISOString(), endDate: new Date(ahora - 30 * DIA).toISOString() }, { startDate: new Date(ahora + 2 * DIA).toISOString(), endDate: new Date(ahora + 3 * DIA).toISOString() }] }] });
  await E.partidosEntre("conmebol.libertadores", ahora, ahora + 7 * DIA);
  assert.deepEqual(pedidos.slice(1), [url("conmebol.libertadores", dia(2)), url("conmebol.libertadores", dia(3))]);
  // Without a calendar, every day; and without an answer to the first, nothing more.
  pedidos = [];
  cartelera("fifa.friendly", []);
  assert.equal((await E.partidosEntre("fifa.friendly", ahora, ahora + 2 * DIA)).pedidos, 1 + new Set([0, 1, 2].map(dia)).size);
  pedidos = [];
  assert.equal(await E.partidosEntre("fifa.world", ahora, ahora + 7 * DIA), null);
  assert.deepEqual(pedidos, [url("fifa.world")]);
  // An answer without its list of events is no answer.
  respuestas.set(url("conmebol.america"), { leagues: [] });
  assert.equal(await E.partidosDelDia("conmebol.america"), null);
});

test("ESPN: los goles a los 90 salen de los dos primeros tiempos del resumen", async () => {
  const resumen = (lineas) => ({ header: { competitions: [{ competitors: [{ homeAway: "home", linescores: lineas[0] }, { homeAway: "away", linescores: lineas[1] }] }] } });
  const partidoDe = { clave: "espn:703953", competencia: "conmebol.america" };
  const u = `${E.ESPN.BASE}/conmebol.america/summary?lang=es&event=703953`;
  respuestas.set(u, resumen([[{ displayValue: "0" }, { displayValue: "1" }, { displayValue: "0" }, { displayValue: "1" }], [{ value: 1 }, { value: 0 }, { value: 0 }, { value: 0 }]]));
  assert.deepEqual(await E.golesA90(partidoDe), [1, 1]);
  respuestas.set(u, resumen([[{ displayValue: "0" }], [{ displayValue: "0" }]]));
  assert.equal(await E.golesA90(partidoDe), null, "con un solo tiempo no se sabe");
  respuestas.set(u, resumen([[{ displayValue: "0" }, { displayValue: "x" }], [{ value: 1 }, { value: 0 }]]));
  assert.equal(await E.golesA90(partidoDe), null);
  respuestas.delete(u);
  assert.equal(await E.golesA90(partidoDe), null);
  pedidos = [];
  assert.equal(await E.golesA90({ clave: "otra:1", competencia: "uru.1" }), null);
  assert.deepEqual(pedidos, [], "una clave que no es de ESPN no se le pregunta");
});

// ---------- the matches kept ----------

test("se guardan los partidos de cada competencia, de la selección solo los de Uruguay, y los viejos se van", async () => {
  const ahora = Date.now();
  cartelera("uru.1", [evento({ id: 1, local: NACIONAL, visitante: ALBION, inicio: ahora + HORA })], { calendario: [] });
  cartelera("fifa.friendly", [evento({ id: 2, local: ARGENTINA, visitante: URUGUAY, inicio: ahora + DIA, fase: "2026-international-friendly" }), evento({ id: 3, local: ARGENTINA, visitante: FLAMENGO, inicio: ahora + DIA })], { calendario: [] });
  const viejo = partido({ id: 99, local: PENAROL, visitante: ALBION, inicio: ahora - 40 * DIA });
  const conMercado = partido({ id: 98, local: PENAROL, visitante: DEFENSOR, inicio: ahora - 40 * DIA });
  M.abrirMercado(grupo(), "admin", "x", ["a", "b"], ahora + DIA, { partido: conMercado.id, tipo: "90" });
  const n = await P.actualizarPartidos(ahora);
  assert.ok(n >= 7, `un pedido por competencia por lo menos (${n})`);
  const claves = globalThis.db.prepare(`SELECT clave FROM partidos ORDER BY clave`).all().map((r) => r.clave);
  assert.deepEqual(claves, ["espn:1", "espn:2", "espn:98"], "el amistoso sin Uruguay no queda, el viejo sin mercado tampoco");
  assert.equal(F.getPartido(viejo.id), null);
});

test("quién pasa se define en la vuelta o en un partido único de eliminatoria", () => {
  const como = (vuelta, fase) => P.seDefineAhi({ vuelta, fase });
  assert.equal(como(2, "semifinals"), true);
  assert.equal(como(1, "semifinals"), false);
  assert.equal(como(-1, "semifinals"), false);
  for (const fase of ["final", "quarterfinals", "round-of-16", "knockout-round-playoffs"]) assert.equal(como(0, fase), true, fase);
  for (const fase of ["group-stage", "torneo-clausura", "2026-international-friendly", "", "groups-final-round"]) assert.equal(como(0, fase), false, fase);
});

test("el desenlace: el resultado a los 90 y quién pasa", () => {
  const terminado = (resultado, extra = {}) => ({ estado: "terminado", local: "Nacional", visitante: "Albion", vuelta: 0, resultado, ...extra });
  assert.deepEqual(P.desenlace(terminado({ definicion: "90", goles: [2, 1] }), "90"), { ganadora: 0, como: "Terminó Nacional 2-1 Albion." });
  assert.equal(P.desenlace(terminado({ definicion: "90", goles: [1, 1] }), "90").ganadora, 1);
  assert.equal(P.desenlace(terminado({ definicion: "90", goles: [0, 3] }), "90").ganadora, 2);
  assert.equal(P.desenlace(terminado({ definicion: "90", goles: null }), "90"), null);
  // Extra time or penalties: from the summary, or a draw when it was played once.
  assert.deepEqual(P.desenlace(terminado({ definicion: "alargue", goles: [2, 1], a90: [1, 1] }), "90"), { ganadora: 1, como: "A los 90 iba Nacional 1-1 Albion." });
  assert.deepEqual(P.desenlace(terminado({ definicion: "penales", goles: [0, 0] }), "90"), { ganadora: 1, como: "A los 90 terminó empatado." });
  assert.deepEqual(P.desenlace(terminado({ definicion: "alargue", goles: [1, 0], a90: null }), "90"), { ganadora: 1, como: "A los 90 terminó empatado." });
  assert.equal(P.desenlace(terminado({ definicion: "penales", goles: [0, 1] }, { vuelta: 2 }), "90"), null, "en la vuelta, sin el resumen no se sabe");
  assert.equal(P.desenlace(terminado({ definicion: "penales", goles: [0, 1], a90: [0, 1] }, { vuelta: 2 }), "90").ganadora, 2);
  // Who goes through.
  assert.deepEqual(P.desenlace(terminado({ definicion: "penales", goles: [0, 0], penales: [4, 2], ganador: "local" }), "pasa"), { ganadora: 0, como: "Pasa Nacional por penales (4-2)." });
  assert.deepEqual(P.desenlace(terminado({ definicion: "alargue", goles: [1, 2], ganador: "visitante" }), "pasa"), { ganadora: 1, como: "Pasa Albion en el alargue." });
  assert.deepEqual(P.desenlace(terminado({ definicion: "90", goles: [0, 1], ganador: "visitante", serie: { completa: true, pasa: "local" } }, { vuelta: 2 }), "pasa"), { ganadora: 0, como: "Pasa Nacional." }, "la serie, no el partido");
  assert.equal(P.desenlace(terminado({ definicion: "90", goles: [0, 1], ganador: "visitante", serie: { completa: false, pasa: "local" } }), "pasa"), null, "una serie que sigue no dice quién pasa");
  assert.equal(P.desenlace(terminado({ definicion: "90", goles: [1, 1], ganador: null }), "pasa"), null);
  // Not over, or nothing known.
  assert.equal(P.desenlace({ ...terminado({ definicion: "90", goles: [2, 1] }), estado: "otro" }, "90"), null);
  assert.equal(P.desenlace(terminado(null), "90"), null);
  assert.equal(P.desenlace(terminado({ definicion: "90", goles: [2, 1] }), "otro"), null);
  assert.equal(P.desenlace(null, "90"), null);
});

// ---------- which groups ----------

test("los mercados andan donde andan .evento y .jugar, y donde se escribió hace poco", () => {
  const ahora = Date.now();
  const anda = (ajustes) => P.andanLosMercados(F.getChat(grupo(ajustes)), ahora);
  assert.equal(anda({}), true);
  assert.equal(anda({ games: 0 }), false);
  assert.equal(anda({ casino: 0 }), false);
  assert.equal(anda({ monedas: 0 }), false);
  assert.equal(anda({ isBanned: 1 }), false);
  assert.equal(anda({ adminMode: 1 }), false);
  assert.equal(anda({ juegosApagados: '["mercados"]' }), false);
  assert.equal(anda({ juegosApagados: '["ruleta"]' }), true);
  const hora = new Date(ahora).getHours();
  const fuera = `${String((hora + 2) % 24).padStart(2, "0")}:00-${String((hora + 3) % 24).padStart(2, "0")}:00`;
  assert.equal(anda({ horarioJuegos: fuera }), true, "fuera del horario de juegos también: el horario no frena los mercados");
  // Nobody wrote in two weeks: the bot may not be there anymore.
  const callado = "partidos-callado@g.us";
  F.initDataDB({ chat: callado, sender: "111@lid", senderJid: "", pushName: "Ana" });
  F.updateChat(callado, { casino: 1 });
  F.sumarMensajeDiario(callado, "111@lid", claveDia(new Date(ahora - 20 * DIA)));
  assert.equal(P.andanLosMercados(F.getChat(callado), ahora), false);
  const privado = "59899000111@s.whatsapp.net";
  F.sumarMensajeDiario(privado, "111@lid", claveDia());
  assert.equal(P.andanLosMercados({ ...F.getChat(grupo()), remoteJid: privado }, ahora), false, "un privado no, aunque escriba");
  assert.equal(P.andanLosMercados(null, ahora), false);
});

// ---------- .partidos ----------

test(".partidos: el Uruguayo, los de copa de los uruguayos y la selección; y por competencia, todos los suyos", () => {
  const ahora = Date.now();
  const chat = grupo();
  partido({ id: 1, local: NACIONAL, visitante: ALBION, inicio: ahora + DIA });
  partido({ id: 2, local: DANUBIO, visitante: DEFENSOR, inicio: ahora + 2 * DIA });
  partido({ id: 3, local: PENAROL, visitante: FLAMENGO, inicio: ahora + 3 * DIA, fase: "round-of-16", leg: 1, competencia: "conmebol.libertadores" });
  partido({ id: 4, local: FLAMENGO, visitante: PALMEIRAS, inicio: ahora + 3 * DIA, competencia: "conmebol.libertadores" });
  partido({ id: 5, local: ARGENTINA, visitante: URUGUAY, inicio: ahora + 4 * DIA, competencia: "fifa.friendly", fase: "2026-international-friendly" });
  partido({ id: 6, local: PENAROL, visitante: DEFENSOR, inicio: ahora - HORA, nombre: "STATUS_FIRST_HALF", state: "in" });
  partido({ id: 7, local: PENAROL, visitante: ALBION, inicio: ahora + 9 * DIA });
  partido({ id: 8, local: PENAROL, visitante: DANUBIO, inicio: ahora + 5 * DIA, nombre: "STATUS_POSTPONED" });
  const texto = P.textoPartidos(chat, "", { ahora });
  const lineas = texto.split("\n").filter((l) => l.startsWith("#"));
  assert.deepEqual(lineas.map((l) => l.split(" · ")[2]), ["Nacional vs Albion", "Danubio vs Defensor", "Peñarol vs Flamengo", "Argentina vs Uruguay"], "sin el que ya empezó, el postergado, el de más de una semana ni el de copa sin uruguayos");
  assert.match(lineas[0], /^#\d+ · mañana \d\d:\d\d · Nacional vs Albion · Uruguayo$/);
  assert.match(lineas[3], / · Amistoso$/);
  assert.match(texto, /^⚽ \*Próximos partidos\*\n/);
  assert.match(texto, /\.evento partido N \(el resultado a los 90 minutos\) o \.evento partido N pasa/);
  assert.match(texto, /Los de Peñarol y Nacional los abro yo un día antes\.$/);
  assert.match(P.textoPartidos(chat, "", { ahora, fila: { mercadosAuto: 0 } }), /Acá no abro solos los de Peñarol y Nacional \(\.mercadosauto on\)\.$/);
  // By competition.
  const de = (palabra) =>
    P.textoPartidos(chat, palabra, { ahora })
      .split("\n")
      .filter((l) => l.startsWith("#"))
      .map((l) => l.split(" · ")[2]);
  assert.deepEqual(de("libertadores"), ["Peñarol vs Flamengo", "Flamengo vs Palmeiras"]);
  assert.deepEqual(de("Selección"), ["Argentina vs Uruguay"]);
  assert.deepEqual(de("uruguayo hoy"), ["Nacional vs Albion", "Danubio vs Defensor"]);
  assert.match(P.textoPartidos(chat, "libertadores", { ahora }), /^⚽ \*Próximos partidos de la Libertadores\*/);
  assert.equal(P.textoPartidos(chat, "sudamericana", { ahora }), "⚽ No tengo partidos de la Sudamericana en los próximos 7 días.");
  assert.equal(P.textoPartidos(chat, "premier", { ahora }), "No conozco esa competencia. Probá con .partidos uruguayo, libertadores, sudamericana o seleccion.");
  // A match with its market open in this group says so.
  const nacional = globalThis.db.prepare(`SELECT id FROM partidos WHERE clave = 'espn:1'`).get().id;
  const r = P.abrirDesdeLista(chat, "admin", nacional, "", ahora);
  assert.match(P.textoPartidos(chat, "", { ahora }).split("\n")[1], new RegExp(` 📊 #${r.id}$`));
  assert.doesNotMatch(P.textoPartidos(grupo(), "", { ahora }), /📊/, "en otro grupo no");
});

test(".partidos: con muchos, los primeros y cuántos más", () => {
  const ahora = Date.now();
  for (let i = 0; i < P.PARTIDOS.MAX_LINEAS + 3; i++) partido({ id: 100 + i, local: DANUBIO, visitante: DEFENSOR, inicio: ahora + HORA + i * MIN });
  const texto = P.textoPartidos(grupo(), "", { ahora });
  assert.equal(texto.split("\n").filter((l) => l.startsWith("#")).length, P.PARTIDOS.MAX_LINEAS);
  assert.match(texto, /\n… y 3 más: \.partidos uruguayo, libertadores, sudamericana o seleccion los separa\.\n/);
  assert.equal(P.textoPartidos(grupo(), "", { ahora: ahora + 30 * DIA }), "⚽ No tengo partidos en los próximos 7 días.");
});

// ---------- an admin's .evento partido N ----------

test(".evento partido N: el resultado a los 90, o quién pasa si se define ahí", () => {
  const ahora = Date.now();
  const chat = grupo();
  const liga = partido({ id: 1, local: NACIONAL, visitante: ALBION, inicio: ahora + DIA });
  const r = P.abrirDesdeLista(chat, "admin", liga.id, "", ahora);
  assert.ok(r.ok);
  const m = F.getMercado(r.id);
  assert.deepEqual([m.titulo, m.opciones, m.partido, m.tipo, m.cierra_en, m.chat], ["Nacional vs Albion (a los 90')", ["Nacional", "Empate", "Albion"], liga.id, "90", liga.inicio, chat]);
  assert.match(r.mensaje, new RegExp(`^⚽ Partido #${liga.id}: Nacional vs Albion · Uruguayo · .+\\n\\n📊 \\*Mercado #${r.id}: Nacional vs Albion \\(a los 90'\\)\\*\\n`));
  assert.match(r.mensaje, new RegExp(`\\nApostá con \\.jugar ${r.id} <opción> <cantidad>\\n\\nLas apuestas cierran cuando empieza el partido, y el resultado lo cargo yo cuando termine\\.$`));
  assert.equal(P.abrirDesdeLista(chat, "admin", liga.id, "90", ahora).error, `Ya hay un mercado de ese partido: el #${r.id}.`);
  assert.equal(P.abrirDesdeLista(chat, "admin", liga.id, "pasa", ahora).error, `En el #${liga.id} no se pasa de fase: abrí el de los 90 minutos con .evento partido ${liga.id}.`);
  assert.equal(P.abrirDesdeLista(chat, "admin", liga.id, "goles", ahora).error, `Uso: .evento partido ${liga.id} (el resultado a los 90 minutos) o .evento partido ${liga.id} pasa (quién pasa de fase).`);
  assert.ok(P.abrirDesdeLista(grupo(), "admin", liga.id, "", ahora).ok, "en otro grupo, el suyo");
  // Voided, it can be opened again.
  M.resolver(chat, "admin", r.id, "anulado");
  assert.ok(P.abrirDesdeLista(chat, "admin", liga.id, "", ahora).ok);

  const ida = partido({ id: 2, local: PENAROL, visitante: FLAMENGO, inicio: ahora + DIA, fase: "round-of-16", leg: 1, competencia: "conmebol.libertadores" });
  assert.equal(P.abrirDesdeLista(chat, "admin", ida.id, "pasa", ahora).error, `El #${ida.id} es la ida: la serie se define en la vuelta. Abrí el de quién pasa en ese partido.`);
  const vuelta = partido({ id: 3, local: FLAMENGO, visitante: PENAROL, inicio: ahora + 8 * DIA, fase: "round-of-16", leg: 2, competencia: "conmebol.libertadores" });
  const pasa = P.abrirDesdeLista(chat, "admin", vuelta.id, "Pasa", ahora);
  assert.deepEqual([F.getMercado(pasa.id).titulo, F.getMercado(pasa.id).opciones, F.getMercado(pasa.id).tipo], ["¿Quién pasa? Flamengo vs Peñarol", ["Flamengo", "Peñarol"], "pasa"]);
  // Two sides with the same name are told apart.
  const homonimos = partido({ id: 4, local: NACIONAL, visitante: NACIONAL_PY, inicio: ahora + DIA, competencia: "conmebol.libertadores" });
  assert.deepEqual(F.getMercado(P.abrirDesdeLista(chat, "admin", homonimos.id, "", ahora).id).opciones, ["Nacional (L)", "Empate", "Nacional (V)"]);
  // What can't be bet on anymore, or isn't there.
  const empezado = partido({ id: 5, local: DANUBIO, visitante: DEFENSOR, inicio: ahora + 30 * 1000 });
  assert.equal(P.abrirDesdeLista(chat, "admin", empezado.id, "", ahora).error, `El partido #${empezado.id} ya empezó o no se va a jugar: no se abren apuestas.`);
  const postergado = partido({ id: 6, local: DANUBIO, visitante: ALBION, inicio: ahora + DIA, nombre: "STATUS_POSTPONED" });
  assert.match(P.abrirDesdeLista(chat, "admin", postergado.id, "", ahora).error, /no se va a jugar/);
  for (const n of [999999, NaN, 0, -1]) assert.equal(P.abrirDesdeLista(chat, "admin", n, "", ahora).error, "No hay ningún partido con ese número. Mirá los próximos con .partidos");
});

test("un mercado de partido se cierra a la hora del partido y lo avisa: el resultado lo carga el bot", () => {
  const ahora = Date.now();
  const chat = grupo();
  const p = partido({ id: 1, local: NACIONAL, visitante: ALBION, inicio: ahora + DIA });
  const { id } = P.abrirDesdeLista(chat, "admin", p.id, "", ahora);
  assert.equal(M.cerrarMercadoPorTiempo(id), null, "antes de su hora no se cierra: se movió");
  F.actualizarMercado(id, { cierra_en: ahora - MIN });
  assert.match(M.cerrarMercadoPorTiempo(id).texto, new RegExp(`Cerraron las apuestas\\. Cuando termine el partido cargo el resultado yo \\(si no lo tengo, un admin con \\.resolver ${id} <opción>\\)\\.$`));
  const comun = M.crearMercadoDesdeTexto(chat, "admin", "Llueve | Sí | No | en 1h");
  F.actualizarMercado(comun.id, { cierra_en: ahora - MIN });
  assert.match(M.cerrarMercadoPorTiempo(comun.id).texto, /un admin lo carga con \.resolver/);
});

// ---------- what the bot opens on its own ----------

test("los partidos de Peñarol y Nacional abren su mercado solos un día antes, en los grupos donde andan los mercados", async () => {
  const ahora = Date.now();
  const [uno, otro, sinAuto, sinCasino] = [grupo(), grupo(), grupo({ mercadosAuto: 0 }), grupo({ casino: 0 })];
  const nacional = partido({ id: 1, local: NACIONAL, visitante: ALBION, inicio: ahora + 20 * HORA });
  partido({ id: 2, local: DANUBIO, visitante: DEFENSOR, inicio: ahora + 20 * HORA });
  partido({ id: 3, local: PENAROL, visitante: ALBION, inicio: ahora + 30 * HORA });
  partido({ id: 4, local: PENAROL, visitante: DEFENSOR, inicio: ahora + 20 * MIN });
  partido({ id: 5, local: PENAROL, visitante: DANUBIO, inicio: ahora + 20 * HORA, nombre: "STATUS_POSTPONED" });
  const client = clienteFalso();
  assert.equal(await P.abrirMercadosSolos(ahora, client), 2, "uno por grupo: Nacional, en los dos grupos que corresponde");
  for (const chat of [uno, otro]) {
    const [texto] = aca(chat);
    const [m] = F.mercadosDelPartido(chat, nacional.id, "90");
    assert.match(texto, new RegExp(`^⚽ Juega Nacional: Nacional vs Albion · Uruguayo · .+\\n\\n📊 \\*Mercado #${m.id}: Nacional vs Albion \\(a los 90'\\)\\*\\n`));
    assert.equal(F.mercadosDelPartido(chat, nacional.id, "pasa").length, 0);
  }
  assert.deepEqual([aca(sinAuto), aca(sinCasino)], [[], []]);
  // Not twice.
  assert.equal(await P.abrirMercadosSolos(ahora + HORA, client), 0);
  // The next day's turns up once it's within a day.
  assert.equal(await P.abrirMercadosSolos(ahora + 10 * HORA, client), 2);
});

// .horariojuegos doesn't stop the markets (handle-message.js), but what the bot says on its own keeps to it: with the
// hours closed, the pass still asks for the matches, which .partidos shows at any hour, and the market waits for them
// to open. Before, a group whose hours were closed had no markets at all, and the matches weren't asked for.
test("con horario de juegos, el mercado de Peñarol o Nacional se abre cuando abre el horario, y la cartelera se pide igual", async () => {
  const ahora = Date.now();
  const desde = (new Date(ahora).getHours() + 2) % 24;
  const chat = grupo({ horarioJuegos: `${String(desde).padStart(2, "0")}:00-${String((desde + 1) % 24).padStart(2, "0")}:00` });
  cartelera("uru.1", [evento({ id: 1, local: NACIONAL, visitante: ALBION, inicio: ahora + 20 * HORA })], { calendario: [] });
  const client = clienteFalso();
  assert.equal(await P.chequearPartidos(ahora, client), true);
  assert.ok(pedidos.length >= 7, "la cartelera, aunque el horario esté cerrado");
  const nacional = globalThis.db.prepare(`SELECT id FROM partidos WHERE clave = 'espn:1'`).get().id;
  assert.deepEqual([F.mercadosDelPartido(chat, nacional, "90").length, aca(chat)], [0, []], "con el horario cerrado, todavía no");
  await P.chequearPartidos(ahora + 2 * HORA, client);
  assert.equal(F.mercadosDelPartido(chat, nacional, "90").length, 1, "cuando abre el horario");
  assert.match(aca(chat)[0], /^⚽ Juega Nacional: Nacional vs Albion/);
});

test("el clásico, y una vuelta de copa con los dos mercados en un solo mensaje", async () => {
  const ahora = Date.now();
  const chat = grupo();
  partido({ id: 1, local: PENAROL, visitante: NACIONAL, inicio: ahora + 5 * HORA });
  const vuelta = partido({ id: 2, local: NACIONAL, visitante: FLAMENGO, inicio: ahora + 6 * HORA, fase: "quarterfinals", leg: 2, competencia: "conmebol.libertadores" });
  const ida = partido({ id: 3, local: PENAROL, visitante: PALMEIRAS, inicio: ahora + 7 * HORA, fase: "quarterfinals", leg: 1, competencia: "conmebol.libertadores" });
  const client = clienteFalso();
  assert.equal(await P.abrirMercadosSolos(ahora, client), 4);
  const [clasico, copa, laIda] = aca(chat);
  assert.match(clasico, /^⚽ ¡Clásico! Peñarol vs Nacional · Uruguayo · /);
  assert.match(copa, /^⚽ Juega Nacional: Nacional vs Flamengo · Libertadores · /);
  const [m90] = F.mercadosDelPartido(chat, vuelta.id, "90");
  const [mPasa] = F.mercadosDelPartido(chat, vuelta.id, "pasa");
  assert.match(copa, new RegExp(`Mercado #${m90.id}: Nacional vs Flamengo \\(a los 90'\\)[\\s\\S]*Mercado #${mPasa.id}: ¿Quién pasa\\? Nacional vs Flamengo`));
  assert.equal(F.mercadosDelPartido(chat, ida.id, "pasa").length, 0, "en la ida, solo el de los 90");
  assert.match(laIda, /^⚽ Juega Peñarol: Peñarol vs Palmeiras/);
  // One an admin voided isn't opened again.
  M.resolver(chat, "admin", m90.id, "anulado");
  assert.equal(await P.abrirMercadosSolos(ahora + MIN, client), 0);
});

test("si no puede avisar en un grupo, los mercados de ahí quedan anulados y no se vuelven a abrir", async () => {
  const ahora = Date.now();
  const [ida, vuelta] = [grupo(), grupo()];
  const p = partido({ id: 1, local: NACIONAL, visitante: ALBION, inicio: ahora + 5 * HORA });
  const client = clienteFalso();
  const enviar = client.sendMessage;
  const errorReal = console.error;
  console.error = () => {};
  try {
    client.sendMessage = async (chat, msg) => {
      if (chat === ida) throw new Error("not-authorized");
      return enviar(chat, msg);
    };
    assert.equal(await P.abrirMercadosSolos(ahora, client), 1);
  } finally {
    console.error = errorReal;
  }
  const [m] = F.mercadosDelPartido(ida, p.id, "90");
  assert.equal(m.estado, "anulado");
  assert.equal(F.mercadosDelPartido(vuelta, p.id, "90")[0].estado, "abierto");
  assert.equal(await P.abrirMercadosSolos(ahora + MIN, clienteFalso()), 0);
});

// ---------- following them ----------

// A match on its way, with its market open and bets on it; returns what's needed to follow it.
function enJuego({ local = NACIONAL, visitante = ALBION, inicio = Date.now() - 2 * HORA, competencia = "uru.1", fase, leg, tipo = "90", id = 1 } = {}) {
  const chat = grupo();
  const p = partido({ id, local, visitante, inicio, competencia, fase, leg });
  const mercado = M.abrirMercado(chat, "admin", tipo === "pasa" ? "¿Quién pasa?" : "Partido", tipo === "pasa" ? [local[1], visitante[1]] : [local[1], "Empate", visitante[1]], inicio, { partido: p.id, tipo });
  return { chat, p, mercado };
}
const finDe = (datos) => cartelera(datos.competencia || "uru.1", [evento(datos)], { dia: E.diaEspn(datos.inicio) });

test("al terminar un partido, el mercado de los 90 se resuelve solo y paga", async () => {
  const ahora = Date.now();
  const inicio = ahora - 2 * HORA;
  const { chat, p, mercado } = enJuego({ inicio });
  // The bets went in before kickoff; the market closed then.
  globalThis.db.prepare(`UPDATE mercados SET cierra_en = ? WHERE id = ?`).run(Date.now() + HORA, mercado);
  assert.ok(M.jugar(chat, "a", mercado, "Nacional", 40).ok && M.jugar(chat, "b", mercado, "Albion", 60).ok);
  globalThis.db.prepare(`UPDATE mercados SET cierra_en = ?, estado = 'cerrado' WHERE id = ?`).run(inicio, mercado);
  finDe({ id: 1, local: NACIONAL, visitante: ALBION, inicio, nombre: "STATUS_FULL_TIME", goles: [2, 1], ganador: "home" });
  const client = clienteFalso();
  assert.equal(await P.seguirPartidos(ahora, client), 1);
  assert.equal(F.getMercado(mercado).estado, "resuelto");
  assert.equal(F.getMercado(mercado).ganadora, 0);
  const [texto] = aca(chat);
  assert.equal(texto.split("\n").slice(0, 4).join("\n"), `📊 *Mercado #${mercado} resuelto: Partido*\nTerminó Nacional 2-1 Albion.\nGanó: *Nacional* · Pozo: 100 UruCoins\n🏆 @a apostó 40 y cobra *100*`);
  assert.equal(F.getSaldoCoins(chat, "a"), 460 + 100);
  assert.equal(F.getSaldoCoins(chat, "b"), 440);
  assert.equal(F.getPartido(p.id).estado, "terminado");
  // Nothing left to follow: no more requests.
  pedidos = [];
  assert.equal(await P.seguirPartidos(ahora + HORA, client), 0);
  assert.deepEqual(pedidos, []);
});

test("se pregunta desde los 105 minutos, cada 15, una vez por competencia y día", async () => {
  const ahora = Date.now();
  const inicio = ahora - 100 * MIN;
  const uno = enJuego({ inicio, id: 1 });
  enJuego({ inicio, id: 2, local: PENAROL, visitante: DEFENSOR });
  const client = clienteFalso();
  assert.equal(await P.seguirPartidos(ahora, client), 0, "a los 100 minutos todavía no");
  assert.equal(await P.seguirPartidos(ahora + 5 * MIN, client), 1, "a los 105, un pedido para los dos");
  assert.deepEqual(pedidos, [url("uru.1", E.diaEspn(inicio))]);
  assert.equal(await P.seguirPartidos(ahora + 15 * MIN, client), 0, "a los 10 minutos del anterior, no");
  assert.equal(await P.seguirPartidos(ahora + 20 * MIN, client), 1, "a los 15, de nuevo");
  // Past a day without a result, no more requests: the admins are told, once.
  pedidos = [];
  assert.equal(await P.seguirPartidos(inicio + P.PARTIDOS.SIN_RESULTADO_MS + MIN, client), 0);
  const textos = aca(uno.chat);
  assert.equal(textos.length, 1);
  assert.equal(textos[0], `📊 No tengo el resultado del mercado #${uno.mercado} (Partido). Un admin que no haya apostado lo carga con .resolver ${uno.mercado} <opción> (Nacional, Empate, Albion), o .resolver ${uno.mercado} anulado para devolver todo.`);
  await P.seguirPartidos(inicio + P.PARTIDOS.SIN_RESULTADO_MS + HORA, client);
  assert.equal(aca(uno.chat).length, 1, "una sola vez");
  assert.equal(F.getMercado(uno.mercado).estado, "abierto", "lo resuelve un admin");
});

test("un partido con alargue: los 90 salen del resumen, pedido una vez; y quién pasa, del ganador", async () => {
  const ahora = Date.now();
  const inicio = ahora - 3 * HORA;
  const noventa = enJuego({ inicio, local: ARGENTINA, visitante: URUGUAY, competencia: "conmebol.america", fase: "final" });
  const pasa = enJuego({ inicio, local: ARGENTINA, visitante: URUGUAY, competencia: "conmebol.america", fase: "final", tipo: "pasa" });
  finDe({ id: 1, local: ARGENTINA, visitante: URUGUAY, inicio, nombre: "STATUS_FINAL_AET", goles: [2, 1], ganador: "home", competencia: "conmebol.america", fase: "final" });
  respuestas.set(`${E.ESPN.BASE}/conmebol.america/summary?lang=es&event=1`, { header: { competitions: [{ competitors: [{ homeAway: "home", linescores: [{ value: 1 }, { value: 0 }, { value: 1 }] }, { homeAway: "away", linescores: [{ value: 0 }, { value: 1 }, { value: 0 }] }] }] } });
  const client = clienteFalso();
  assert.equal(await P.seguirPartidos(ahora, client), 2, "el día y el resumen");
  assert.match(aca(noventa.chat)[0], /\nA los 90 iba Argentina 1-1 Uruguay\.\nGanó: \*Empate\*/);
  assert.match(aca(pasa.chat)[0], /\nPasa Argentina en el alargue\.\nGanó: \*Argentina\*/);
  // Without what the summary says, a final played once was a draw at 90.
  const otra = enJuego({ inicio, id: 2, local: ARGENTINA, visitante: URUGUAY, competencia: "conmebol.america", fase: "final" });
  finDe({ id: 2, local: ARGENTINA, visitante: URUGUAY, inicio, nombre: "STATUS_FINAL_PEN", goles: [0, 0], penales: [3, 4], ganador: "away", competencia: "conmebol.america", fase: "final" });
  pedidos = [];
  await P.seguirPartidos(ahora + 20 * MIN, client);
  assert.deepEqual(pedidos.filter((u) => u.includes("summary")), [`${E.ESPN.BASE}/conmebol.america/summary?lang=es&event=2`]);
  assert.match(aca(otra.chat)[0], /\nA los 90 terminó empatado\.\nGanó: \*Empate\*/);
  pedidos = [];
  await P.seguirPartidos(ahora + 40 * MIN, client);
  assert.deepEqual(pedidos, [], "el resumen no se vuelve a pedir");
});

test("en la vuelta de una serie: quién pasa es de la serie, y los 90 sin resumen quedan para un admin", async () => {
  const ahora = Date.now();
  const inicio = ahora - 3 * HORA;
  const datos = { local: FLAMENGO, visitante: PENAROL, inicio, competencia: "conmebol.libertadores", fase: "semifinals", leg: 2 };
  const pasa = enJuego({ ...datos, tipo: "pasa" });
  const noventa = enJuego(datos);
  finDe({ id: 1, ...datos, nombre: "STATUS_FINAL_PEN", goles: [1, 0], penales: [2, 3], ganador: "away", serie: { completa: true, pasa: "away" } });
  const client = clienteFalso();
  await P.seguirPartidos(ahora, client);
  assert.match(aca(pasa.chat)[0], /\nPasa Peñarol por penales \(2-3\)\.\nGanó: \*Peñarol\*/);
  assert.deepEqual(aca(noventa.chat), [], "no se sabe cómo iba a los 90");
  assert.equal(F.getMercado(noventa.mercado).estado, "abierto");
  assert.deepEqual(F.getPartido(noventa.p.id).resultado.a90, null, "se preguntó, y no estaba");
  pedidos = [];
  await P.seguirPartidos(ahora + 20 * MIN, client);
  assert.deepEqual(pedidos.filter((u) => u.includes("summary")), [], "y no se vuelve a preguntar");
});

test("el resumen se pide solo si hay un mercado de los 90 esperando", async () => {
  const ahora = Date.now();
  const inicio = ahora - 3 * HORA;
  const datos = { local: ARGENTINA, visitante: URUGUAY, inicio, competencia: "conmebol.america", fase: "final" };
  const { chat } = enJuego({ ...datos, tipo: "pasa" });
  finDe({ id: 1, ...datos, nombre: "STATUS_FINAL_PEN", goles: [0, 0], penales: [2, 4], ganador: "away" });
  await P.seguirPartidos(ahora, clienteFalso());
  assert.deepEqual(pedidos.filter((u) => u.includes("summary")), []);
  assert.match(aca(chat)[0], /\nPasa Uruguay por penales \(2-4\)\.\n/);
});

test("un partido postergado anula sus mercados y devuelve lo apostado, y el bot puede abrir el de la fecha nueva", async () => {
  const ahora = Date.now();
  const inicio = ahora + 3 * HORA;
  const { chat, p, mercado } = enJuego({ inicio, local: PENAROL, visitante: ALBION });
  M.jugar(chat, "a", mercado, "Peñarol", 50);
  partido({ id: 1, local: PENAROL, visitante: ALBION, inicio, nombre: "STATUS_POSTPONED" });
  const client = clienteFalso();
  await P.seguirPartidos(ahora, client);
  assert.equal(F.getMercado(mercado).estado, "anulado");
  assert.equal(F.getMercado(mercado).partido, null, "suelto de su partido");
  assert.match(aca(chat)[0], new RegExp(`^📊 \\*Mercado #${mercado} anulado: Partido\\*\\nEl partido se postergó o se suspendió\\. Se devolvieron 50 UruCoins a 1 persona\\.$`));
  assert.equal(F.getSaldoCoins(chat, "a"), 500);
  // Played later, it gets its market again.
  partido({ id: 1, local: PENAROL, visitante: ALBION, inicio: ahora + 5 * HORA });
  assert.equal(await P.abrirMercadosSolos(ahora, client), 1);
  assert.equal(F.mercadosDelPartido(chat, p.id, "90").filter((m) => m.estado === "abierto").length, 1);
});

test("si el partido cambia de hora: hasta dos horas, cierra a la nueva; más, se anula y se suelta", async () => {
  const ahora = Date.now();
  const inicio = ahora + 10 * HORA;
  const poco = enJuego({ inicio, id: 1 });
  const mucho = enJuego({ inicio, id: 2, local: PENAROL, visitante: DEFENSOR });
  // One already closed stays as it is: nobody bets on it anymore.
  const cerrado = enJuego({ inicio, id: 3, local: DANUBIO, visitante: ALBION });
  F.actualizarMercado(cerrado.mercado, { estado: "cerrado" });
  partido({ id: 3, local: DANUBIO, visitante: ALBION, inicio: inicio + 3 * DIA });
  partido({ id: 1, local: NACIONAL, visitante: ALBION, inicio: inicio + 90 * MIN });
  partido({ id: 2, local: PENAROL, visitante: DEFENSOR, inicio: inicio + 3 * DIA });
  const client = clienteFalso();
  await P.seguirPartidos(ahora, client);
  assert.equal(F.getMercado(poco.mercado).cierra_en, inicio + 90 * MIN);
  assert.match(aca(poco.chat)[0], new RegExp(`^📊 El partido del mercado #${poco.mercado} cambió de hora: las apuestas cierran `));
  assert.deepEqual([F.getMercado(mucho.mercado).estado, F.getMercado(mucho.mercado).partido], ["anulado", null]);
  assert.match(aca(mucho.chat)[0], /\nCambió la fecha del partido\. Se devolvieron 0 UruCoins a 0 personas\.$/);
  assert.deepEqual([aca(cerrado.chat), F.getMercado(cerrado.mercado).estado, F.getMercado(cerrado.mercado).cierra_en], [[], "cerrado", inicio]);
  // The new closing is scheduled, beside the old one, which won't close it (a closing before its time doesn't).
  assert.equal(globalThis.db.prepare(`SELECT COUNT(*) AS n FROM pendientes WHERE tipo = 'cerrar_mercado' AND datos = ?`).get(JSON.stringify({ id: poco.mercado })).n, 2);
  assert.equal(M.cerrarMercadoPorTiempo(poco.mercado), null);
  await P.seguirPartidos(ahora + MIN, client);
  assert.equal(aca(poco.chat).length, 1, "a la misma hora no se vuelve a avisar");
});

test("lo que ya resolvió un admin no se toca", async () => {
  const ahora = Date.now();
  const inicio = ahora - 3 * HORA;
  const { chat, mercado } = enJuego({ inicio });
  globalThis.db.prepare(`UPDATE mercados SET cierra_en = ? WHERE id = ?`).run(ahora - HORA, mercado);
  assert.ok(M.resolver(chat, "admin", mercado, "Albion").ok);
  finDe({ id: 1, local: NACIONAL, visitante: ALBION, inicio, nombre: "STATUS_FULL_TIME", goles: [2, 1], ganador: "home" });
  assert.equal(await P.seguirPartidos(ahora, clienteFalso()), 0);
  assert.deepEqual([F.getMercado(mercado).estado, F.getMercado(mercado).ganadora], ["resuelto", 2]);
  assert.equal(M.resolverPorPartido(mercado, 0, "x"), null);
  assert.equal(M.anularPorPartido(mercado, "x"), null);
  assert.equal(M.resolverPorPartido(99999, 0, "x"), null);
});

test("la resolución del bot solo toma una opción que el mercado tiene", () => {
  const { mercado } = enJuego();
  assert.equal(M.resolverPorPartido(mercado, 5, "x"), null);
  assert.equal(M.resolverPorPartido(mercado, 1.5, "x"), null);
  assert.equal(F.getMercado(mercado).estado, "abierto");
});

// ---------- the pass of every 5 minutes ----------

test("la pasada: sin grupos con mercados ni nada que esperar no le pregunta nada a ESPN; con grupos, la cartelera cada 6 horas", async () => {
  const ahora = Date.now();
  const client = clienteFalso();
  assert.equal(await P.chequearPartidos(ahora, client), false);
  assert.deepEqual(pedidos, []);
  const chat = grupo();
  cartelera("uru.1", [evento({ id: 1, local: NACIONAL, visitante: ALBION, inicio: ahora + 3 * HORA })], { calendario: [] });
  assert.equal(await P.chequearPartidos(ahora, client), true);
  assert.ok(pedidos.length >= 7, "cada competencia");
  assert.equal(F.mercadosDelPartido(chat, globalThis.db.prepare(`SELECT id FROM partidos WHERE clave = 'espn:1'`).get().id, "90").length, 1, "y abre el de Nacional");
  pedidos = [];
  await P.chequearPartidos(ahora + 5 * HORA, client);
  assert.deepEqual(pedidos.filter((u) => !u.includes("dates=")), [], "antes de las 6 horas no pide la cartelera de nuevo");
  await P.chequearPartidos(ahora + 6 * HORA, client);
  assert.ok(pedidos.filter((u) => !u.includes("dates=")).length >= 7);
  // A market that waits keeps being followed without groups.
  F.updateChat(chat, { casino: 0 });
  pedidos = [];
  P.reiniciarPartidos();
  assert.equal(await P.chequearPartidos(ahora + 7 * HORA, client), true);
  assert.deepEqual(pedidos, [url("uru.1", E.diaEspn(ahora + 3 * HORA))], "solo el día del partido");
});

test("la pasada: de a una", async () => {
  const ahora = Date.now();
  grupo();
  let soltar;
  const frenada = new Promise((resolve) => (soltar = resolve));
  const pedirReal = E._dep.pedir;
  E._dep.pedir = async (u) => {
    await frenada;
    return pedirReal(u);
  };
  try {
    const primera = P.chequearPartidos(ahora, clienteFalso());
    assert.equal(await P.chequearPartidos(ahora, clienteFalso()), false);
    soltar();
    assert.equal(await primera, true);
  } finally {
    E._dep.pedir = pedirReal;
  }
});

// ---------- the commands ----------

test("los comandos: .partidos, .evento partido N pasa y .mercadosauto", async () => {
  const ahora = Date.now();
  const chat = grupo();
  const vuelta = partido({ id: 1, local: NACIONAL, visitante: FLAMENGO, inicio: ahora + DIA, fase: "semifinals", leg: 2, competencia: "conmebol.libertadores" });
  partido({ id: 2, local: NACIONAL, visitante: ALBION, inicio: ahora + 2 * DIA });
  const Jugadores = (await import("../plugins/coins-mercado.js")).default;
  const Admin = (await import("../plugins/coins-mercado-admin.js")).default;
  const Config = (await import("../plugins/config-on-off.js")).default;
  const client = clienteFalso();
  const m = { chat, sender: "111@lid", isGroup: true, key: { id: "K" } };
  await Jugadores.run(m, { client, args: ["libertadores"], command: "partidos", chat: F.getChat(chat) });
  assert.match(globalThis.enviados.at(-1).msg.text, /^⚽ \*Próximos partidos de la Libertadores\*\n#\d+ · .+ · Nacional vs Flamengo · Libertadores$/m);
  await Admin.run(m, { client, args: ["partido", String(vuelta.id), "pasa"], text: `partido ${vuelta.id} pasa`, command: "evento", chat: F.getChat(chat), isOwner: false });
  assert.match(globalThis.enviados.at(-1).msg.text, /^⚽ Partido #\d+: Nacional vs Flamengo · Libertadores/);
  assert.equal(F.mercadosDelPartido(chat, vuelta.id, "pasa").length, 1);
  await Admin.run(m, { client, args: ["Partido", "999999"], text: "Partido 999999", command: "evento", chat: F.getChat(chat), isOwner: false });
  assert.equal(globalThis.enviados.at(-1).msg.text, "❌ No hay ningún partido con ese número. Mirá los próximos con .partidos");
  // The usual .evento still is.
  await Admin.run(m, { client, args: "Llueve | Sí | No | en 1h".split(" "), text: "Llueve | Sí | No | en 1h", command: "evento", chat: F.getChat(chat), isOwner: false });
  assert.match(globalThis.enviados.at(-1).msg.text, /^📊 \*Mercado #\d+: Llueve\*/);
  // .mercadosauto off: the group gets none on its own.
  assert.ok(Config.cmd.includes("mercadosauto"));
  await Config.run(m, { client, command: "mercadosauto", args: ["off"], isAdmin: true, isOwner: false, chat: F.getChat(chat), botSettings: {} });
  assert.equal(F.getChat(chat).mercadosAuto, 0);
  assert.equal(await P.abrirMercadosSolos(ahora + DIA + HORA, client), 0);
});
