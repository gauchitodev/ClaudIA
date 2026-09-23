import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, fijarSaldo } from "./helpers.mjs";
import { semanaDe } from "../lib/hashtags.js";

let F, L, M, T;
before(async () => {
  ({ F } = await prepararBase("apuestas"));
  L = await import("../lib/loteria.js");
  M = await import("../lib/mercados.js");
  T = await import("../lib/tiempo.js");
});
const saldo = (u) => F.getSaldoCoins(G, u);
const cargar = (u, n) => fijarSaldo(F, G, u, n);

test("tiempo: parseo de momentos y textos", () => {
  const H = 3600e3;
  const ahora = new Date(2026, 8, 2, 10, 0).getTime();
  const f = (t) => new Date(T.parsearMomento(t, ahora));
  assert.equal(f("20:30").getHours(), 20);
  assert.equal(f("08:00").getDate(), 3, "ya pasó -> mañana");
  assert.equal(f("mañana 09:15").getDate(), 3);
  assert.equal(f("18/09 20:30").getMonth(), 8);
  assert.equal(f("01/01 00:00").getFullYear(), 2027);
  assert.equal(T.parsearMomento("en 90m", ahora), ahora + 1.5 * H);
  for (const t of ["25:00", "20:60", "31/02 10:00", "ayer", ""]) assert.equal(T.parsearMomento(t, ahora), null, t);
  assert.equal(T.textoFecha(ahora + 2 * H, ahora), "hoy 12:00");
  assert.equal(T.duracion(2 * 86400e3 + 3 * H), "2 d 3 h");
});

test("lotería: boletos, tope, sorteo ponderado y devolución", () => {
  const semana = semanaDe(Date.now());
  cargar("a", 100);
  cargar("b", 100);
  assert.ok(L.comprarBoletos(G, "a", 3).ok && saldo("a") === 70);
  assert.ok(!L.comprarBoletos(G, "a", 3).ok);
  assert.ok(L.comprarBoletos(G, "b", 1).ok);
  assert.match(L.textoEstadoLoteria(G, "a"), /Pozo: \*40 UruCoins\*/);
  L._rng.randomInt = () => 0; // the first ticket belongs to "a"
  const s = L.sortearLoteria(G, semana);
  assert.deepEqual(s.mentions, ["a"]);
  assert.match(s.texto, /Ganó @a con 3 boletos \(75 % de chance\)/);
  db.prepare(`DELETE FROM loteria_boletos`).run();
  cargar("c", 50);
  L.comprarBoletos(G, "c", 2);
  assert.match(L.sortearLoteria(G, semana).texto, /devolví sus 20/);
  assert.equal(saldo("c"), 50);
  db.prepare(`DELETE FROM loteria_boletos`).run();
  assert.equal(L.sortearLoteria(G, semana), null);
});

test("mercados: crear, jugar, resolver a pozo, anular y vencer", () => {
  for (const u of ["a", "b", "c", "d"]) cargar(u, 200);
  assert.ok(!M.crearMercadoDesdeTexto(G, "admin", "T | A | en 2h").ok);
  assert.ok(!M.crearMercadoDesdeTexto(G, "admin", "T | A | a | en 2h").ok);
  assert.ok(!M.crearMercadoDesdeTexto(G, "admin", "T | A | B | ayer").ok);
  const c = M.crearMercadoDesdeTexto(G, "admin", "Peñarol vs Nacional | Peñarol | Empate | Nacional | en 2h");
  assert.ok(c.ok && /Mercado #1/.test(c.mensaje));
  assert.equal(F.contarPendientesPorTipo().length, 2, "cierre y anulación agendados");
  assert.ok(M.jugar(G, "a", 1, "Peñarol", 60).ok && M.jugar(G, "b", 1, "3", 40).ok && M.jugar(G, "c", 1, "peñ", 20).ok && M.jugar(G, "a", 1, "1", 40).ok);
  assert.match(M.jugar(G, "a", 1, "Nacional", 10).error, /cambiar de bando/);
  assert.match(M.jugar(G, "a", 1, "Peñarol", 5).error, /Máximo 100/);
  assert.match(M.textoMercado(F.getMercado(1)), /1\. Peñarol — 120 UruCoins · paga x1\.33/);
  assert.match(M.resolver(G, "admin", 1, "Peñarol").error, /siguen abiertas/);
  assert.match(M.resolver(G, "a", 1, "anulado").error, /no podés resolverlo vos/);
  F.actualizarMercado(1, { cierra_en: Date.now() - 1000 });
  assert.ok(!M.jugar(G, "d", 1, "Peñarol", 10).ok);
  assert.match(M.cerrarMercadoPorTiempo(1).texto, /Cerraron las apuestas/);
  const res = M.resolver(G, "admin", 1, "Peñarol");
  assert.equal(saldo("a"), 100 + 133);
  assert.equal(saldo("c"), 180 + 26);
  assert.equal(saldo("b"), 160);
  assert.match(res.texto, /1 apuesta perdida \(40 UruCoins\)/);
  assert.match(M.resolver(G, "admin", 1, "Nacional").error, /ya está resuelto/);
  const c2 = M.crearMercadoDesdeTexto(G, "admin", "Llueve | Sí | No | Nieva | en 1h");
  M.jugar(G, "a", c2.id, "Sí", 30);
  M.jugar(G, "b", c2.id, "No", 30);
  const antesA = saldo("a");
  F.actualizarMercado(c2.id, { cierra_en: Date.now() - 1000 });
  assert.match(M.resolver(G, "a", c2.id, "Nieva", { esOwner: true }).texto, /Nadie le había jugado/);
  assert.equal(saldo("a"), antesA + 30);
  const c3 = M.crearMercadoDesdeTexto(G, "admin", "Clásico | Peñarol | Nacional | en 1h");
  M.jugar(G, "c", c3.id, "Peñarol", 25);
  const antesC = saldo("c");
  assert.match(M.anularMercadoVencido(c3.id).texto, /ningún admin cargó/);
  assert.equal(saldo("c"), antesC + 25);
  assert.match(M.textoListaMercados(G), /No hay mercados abiertos/);
});

// ---------- bets on games (.apostar) ----------
// Every group game used to share one entry per chat: with two at once (a riddle and a flags quiz, say), the second
// one wiped the first one's bets, and whichever ended first settled the other's.

test("apuestas en juegos: dos juegos grupales a la vez no se pisan las apuestas", async () => {
  const U = await import("../lib/urucoins.js");
  const C = "dos-juegos@g.us";
  for (const u of ["c", "d"]) fijarSaldo(F, C, u, 100);
  U.juegoIniciado(C, "acertijo");
  assert.ok(U.apostar(C, "c", 50).ok, "con un solo juego no hace falta decir cuál");
  U.juegoIniciado(C, "banderas");
  assert.match(U.apostar(C, "d", 30).error, /Hay varios juegos activos \(acertijo, banderas\)/);
  assert.equal(F.getSaldoCoins(C, "d"), 100, "la apuesta ambigua no cobra");
  assert.ok(U.apostar(C, "d", 30, "Bandera").ok, "nombrando el juego, sí");

  assert.match(U.juegoTerminado(C, "c", { nombre: "acertijo" }), /cobraste 100/);
  assert.equal(F.getSaldoCoins(C, "c"), 160, "su apuesta sigue ahí: 50 que puso, 100 que cobra y 10 de premio");
  assert.match(U.juegoTerminado(C, null, { nombre: "banderas" }), /1 apuesta perdida \(30 UruCoins\)/, "cada juego liquida las suyas");
  assert.equal(F.getSaldoCoins(C, "d"), 70);
});

test("apuestas en juegos: sin nombre cierra el único activo, y con varios no adivina", async () => {
  const U = await import("../lib/urucoins.js");
  const C = "sin-nombre@g.us";
  fijarSaldo(F, C, "e", 100);
  // The way it was called before games had names (and a merge could bring back): still works with one game on.
  U.juegoIniciado(C, "trivia");
  U.apostar(C, "e", 20);
  assert.match(U.juegoTerminado(C, "e"), /cobraste 40/);

  U.juegoIniciado(C, "acertijo");
  U.juegoIniciado(C, "banderas");
  const errores = [];
  const errorReal = console.error;
  console.error = (...a) => errores.push(a.join(" "));
  try {
    U.juegoTerminado(C, null);
  } finally {
    console.error = errorReal;
  }
  assert.match(errores.join("\n"), /sin nombre, con 2 juegos activos/);
  assert.match(U.apostar(C, "e", 5).error, /Hay varios juegos activos/, "no cerró ninguno a ciegas");
  U.juegoTerminado(C, null, { nombre: "acertijo" });
  U.juegoTerminado(C, null, { nombre: "banderas" });

  // An individual game and a group one: the person says which.
  U.juegoIniciado(C, "ahorcado", "e");
  U.juegoIniciado(C, "trivia");
  assert.match(U.apostar(C, "e", 10).error, /ahorcado, trivia|trivia, ahorcado/);
  assert.ok(U.apostar(C, "e", 10, "ahorcado").ok);
  assert.match(U.apostar(C, "otra@lid", 10, "ahorcado").error, /No hay ningún juego de ahorcado/, "el ahorcado de otro no es suyo");
  U.juegoTerminado(C, null, { nombre: "trivia" });
  U.juegoTerminado(C, null, { jugador: "e", nombre: "ahorcado" });
});

test("consistencia: cada juego se cierra con el mismo nombre con el que se abrió", async () => {
  // A plugin closing without its name (or with another one) falls back to guessing, which fails with two games on.
  const fs = await import("node:fs");
  const carpeta = new URL("../plugins/", import.meta.url);
  const revisados = [];
  for (const archivo of fs.readdirSync(carpeta).filter((f) => f.endsWith(".js"))) {
    const fuente = fs.readFileSync(new URL(archivo, carpeta), "utf8");
    const abre = fuente.match(/juegoIniciado\([^,]+,\s*"([a-z]+)"/);
    if (!abre) continue;
    const cierres = [...fuente.matchAll(/juegoTerminado\([^)]*\)/g)].map((c) => c[0]);
    assert.ok(cierres.length > 0, `${archivo} abre un juego y nunca lo cierra`);
    for (const cierre of cierres) assert.match(cierre, new RegExp(`nombre: "${abre[1]}"`), `${archivo}: ${cierre}`);
    revisados.push(archivo);
  }
  assert.ok(revisados.length >= 5, `se revisaron muy pocos juegos (${revisados.join(", ")}): el escaneo no está andando`);
});
