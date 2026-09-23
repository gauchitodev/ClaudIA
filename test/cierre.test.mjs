import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { EventEmitter } from "node:events";
import { prepararBase, fijarSaldo, mazoDe } from "./helpers.mjs";

// The casino's games live in memory and charge up front: a restart in the middle used to swallow the stakes.
// lib/cierre.js refunds whatever is in play on the way out.

let F, Cierre, Casino, Carrera, BJ, Mines, D, Timba;
before(async () => {
  ({ F } = await prepararBase("cierre"));
  Cierre = await import("../lib/cierre.js");
  Casino = await import("../lib/casino.js");
  Carrera = await import("../lib/carrera.js");
  BJ = await import("../lib/blackjack.js");
  Mines = await import("../lib/mines.js");
  D = await import("../lib/duelos.js");
  Timba = await import("../lib/timba.js");
});
const C = "cierre@g.us";
const saldo = (u) => F.getSaldoCoins(C, u);
const nada = () => {};

test("cierre: devuelve lo que está en juego en cada juego, una sola vez", () => {
  const gente = ["ruleta", "carrera", "bj", "bjseguro", "mines", "retador", "retado", "pelea1", "pelea2"];
  for (const u of gente) fijarSaldo(F, C, u, 100);

  assert.ok(Casino.apostarRuleta(C, "ruleta", 20, "rojo", nada).ok);
  assert.ok(Carrera.apostarCarrera(C, "carrera", 30, "1", nada).ok);
  // A split hand: 40 + 40 at stake.
  assert.equal(BJ.repartir(C, "bj", 40, nada, mazoDe("8♠", "8♥", "9♣", "7♦", "2♠", "3♥")).terminada, false);
  assert.equal(BJ.dividir(C, "bj").terminada, false);
  // Insurance bought against an ace: the house peeked right then, no blackjack, so it's already lost.
  BJ.repartir(C, "bjseguro", 20, nada, mazoDe("5♠", "6♥", "A♦", "9♣"));
  assert.match(BJ.seguro(C, "bjseguro").mensaje, /el seguro \(10\) se pierde/);
  assert.ok(Mines.iniciar(C, "mines", 25, "3", nada).ok);
  assert.ok(D.desafiar(C, "retador", "retado", 15, "dado", null).ok);
  D.desafiar(C, "pelea1", "pelea2", 10, "pelea", null);
  assert.ok(D.aceptar(C, "pelea2", nada).ok);

  const r = Cierre.devolverLoQueEstaEnJuego();
  assert.deepEqual(r, { apuestas: 8, monedas: 210 });
  for (const u of gente.filter((u) => u !== "bjseguro")) assert.equal(saldo(u), 100, `${u} recupera todo`);
  assert.equal(saldo("bjseguro"), 90, "la mano vuelve, el seguro ya se había perdido");
  for (const mapa of ["mesasRuleta", "carreras", "manosBlackjack", "partidasMines", "duelos", "peleas"]) assert.equal(globalThis[mapa].size, 0, `${mapa} quedó vacío`);

  assert.deepEqual(Cierre.devolverLoQueEstaEnJuego(), { apuestas: 0, monedas: 0 }, "una segunda vez no devuelve de nuevo");
  assert.equal(saldo("ruleta"), 100);

  // .mitimba takes the refunds as plays that never happened.
  for (const motivo of ["casino_ruleta_devolucion", "casino_carrera_devolucion", "casino_blackjack_devolucion", "casino_mines_devolucion", "duelo_devolucion"]) {
    assert.equal(Timba.clasificar(motivo)?.anulaJugada, true, motivo);
  }
});

test("cierre: al apagar con Ctrl+C devuelve y sale; con un error, devuelve igual", () => {
  const proceso = new EventEmitter();
  const codigos = [];
  proceso.exit = (codigo) => {
    codigos.push(codigo);
    proceso.emit("exit", codigo);
  };
  const logs = [];
  const logReal = console.log;
  console.log = (...a) => logs.push(a.join(" "));
  try {
    Cierre.instalarDevolucionAlCerrar(proceso);
    fijarSaldo(F, C, "ctrlc", 100);
    Casino.apostarRuleta(C, "ctrlc", 50, "negro", nada);
    proceso.emit("SIGINT");
    assert.deepEqual(codigos, [130], "sale como si lo hubiera matado la señal: start-process.js reinicia igual que antes");
    assert.equal(saldo("ctrlc"), 100);
    assert.match(logs.join("\n"), /devolví 1 apuesta en juego \(50 UruCoins\)/);

    // An uncaught error doesn't go through the signals: Node emits "exit" by itself.
    Casino.apostarRuleta(C, "ctrlc", 30, "rojo", nada);
    proceso.emit("exit", 1);
    assert.equal(saldo("ctrlc"), 100);
  } finally {
    console.log = logReal;
  }
});

test("consistencia: main.js engancha la devolución al apagarse", () => {
  const main = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
  assert.match(main, /^instalarDevolucionAlCerrar\(\);$/m, "sin esto, reiniciar el bot vuelve a llevarse lo apostado");
});
