import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, fijarSaldo, clienteFalso } from "./helpers.mjs";
import { semanaDe, semanasAnteriores, semanaEnTexto } from "../lib/hashtags.js";

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

test("lotería: una semana sin un solo mensaje no deja sin sortear la anterior", async () => {
  // The draw waits for the group's first message of the next week, and only the previous week used to be closed: with a
  // quiet week in between (or the bot down), the one before it was never drawn nor refunded.
  const Cierres = (await import("../plugins/_cierres-periodicos.js")).default;
  const C = "cierres@g.us";
  const miercoles = new Date(2026, 9, 21, 12, 0).getTime(); // this week started on Monday the 19th
  const [quieta, conBoletos, yaCerrada] = semanasAnteriores(miercoles, 3); // the weeks of the 12th, the 5th and 28/9
  assert.equal(semanaEnTexto(quieta, miercoles), "la semana pasada");
  F.marcarPeriodoCerrado(C, "loteria", yaCerrada); // closed by the group's first message in the week of the 5th
  F.agregarBoletosLoteria(C, conBoletos, "a", 3);
  F.agregarBoletosLoteria(C, conBoletos, "b", 1);
  L._rng.randomInt = () => 0; // the first ticket belongs to "a"
  const antes = F.getSaldoCoins(C, "a");
  const client = clienteFalso();
  const reloj = Date.now;
  Date.now = () => miercoles; // the first message after the quiet week
  try {
    await Cierres.before({ chat: C, isGroup: true }, { client });
  } finally {
    Date.now = reloj;
  }
  const textos = globalThis.enviados.map((e) => e.msg.text);
  assert.ok(textos.some((t) => /^🎟️ \*LOTERÍA DE LA SEMANA DEL 5\/10\*/.test(t) && /Ganó @a/.test(t)), `no se sorteó: ${JSON.stringify(textos)}`);
  assert.equal(F.getSaldoCoins(C, "a") - antes, 40);
  assert.ok(F.periodoCerrado(C, "loteria", conBoletos) && F.periodoCerrado(C, "loteria", quieta));
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

test("mercados: una opción que es solo un número no se confunde con el número de opción", () => {
  // "Goles | 0 | 1 | 2" and then ".resolver N 2" paid whoever bet on "1": the 2 was read as the second option.
  assert.match(M.crearMercadoDesdeTexto(G, "admin", "Goles de Suárez | 0 | 1 | 2 | en 2h").error, /no pueden ser solo un número/);
  const conPalabras = M.crearMercadoDesdeTexto(G, "admin", "Goles de Suárez | 0 goles | 1 gol | 2 goles | en 2h");
  assert.ok(conPalabras.ok);
  cargar("e", 100);
  assert.match(M.jugar(G, "e", conPalabras.id, "2 goles", 10).mensaje, /\*2 goles\*/);
  // A market opened before that was rejected: a number that can mean two different options is refused.
  const viejo = F.crearMercado(G, "Goles", ["0", "1", "2"], Date.now() + 3600e3, "admin");
  cargar("f", 100);
  assert.match(M.jugar(G, "f", viejo, "2", 10).error, /puede ser la opción número 2 o la que se llama así/);
  assert.equal(saldo("f"), 100, "no cobra la apuesta rechazada");
  assert.match(M.jugar(G, "f", viejo, "0", 10).mensaje, /\*0\*/, "no hay opción número 0: es la que se llama 0");
  F.actualizarMercado(viejo, { cierra_en: Date.now() - 1000 });
  assert.match(M.resolver(G, "admin", viejo, "1").error, /no tiene vuelta/);
  assert.equal(F.getMercado(viejo).estado, "abierto", "no lo resolvió");
  assert.match(M.resolver(G, "admin", viejo, "anulado").texto, /anulado/);
  assert.equal(saldo("f"), 100, "anulado, se devuelve todo");
});

// ---------- no bets on games ----------

test("apuestas: en los juegos no se apuesta, solo en el casino", async () => {
  // .apostar let people bet on a game after seeing the question (or with one hangman letter to go) and double their
  // whole balance; it was removed on 2026-09-23. A merge that brings back an old copy would bring that back.
  const U = await import("../lib/urucoins.js");
  assert.equal(U.apostar, undefined);
  assert.equal(U.juegoIniciado, undefined);
  const fs = await import("node:fs");
  const carpeta = new URL("../plugins/", import.meta.url);
  const usan = fs
    .readdirSync(carpeta)
    .filter((f) => f.endsWith(".js"))
    .filter((f) => /plugin\.cmd = \[[^\]]*"apostar"|\bjuegoIniciado\b|\bapostar\(/.test(fs.readFileSync(new URL(f, carpeta), "utf8")));
  assert.deepEqual(usan, [], "ningún plugin declara .apostar ni abre apuestas sobre un juego");
});
