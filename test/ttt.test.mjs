import { test } from "node:test";
import assert from "node:assert/strict";
import TicTacToe from "../lib/ttt.js";

test("ta-te-ti: turnos, validaciones, ganador y tablero", () => {
  const g = new TicTacToe("ana", "beto");
  assert.equal(g.currentTurn, "ana");
  assert.equal(g.enemyTurn, "beto");
  assert.equal(g.oTurn, false);
  assert.deepEqual(g.render(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(g.turn(1, 0), -2, "no le toca a O");
  assert.equal(g.turn(0, 9), -1, "posición inválida");
  assert.equal(g.turn(0, 0), 1); // X en la 1
  assert.equal(g.oTurn, true);
  assert.equal(g.currentTurn, "beto");
  assert.equal(g.turn(1, 0), 0, "ocupada");
  assert.equal(g.turn(1, 1, 1), 1); // O en el centro, por coordenadas
  assert.deepEqual(g.render(), ["X", 2, 3, 4, "O", 6, 7, 8, 9]);
  assert.equal(g.winner, false);
  g.turn(0, 1); // X en la 2
  g.turn(1, 6); // O en la 7
  assert.equal(g.turn(0, 2), 1); // X en la 3: fila completa
  assert.equal(g.winner, "ana");
  assert.equal(g.turns, 5);
  assert.deepEqual(g.render(), ["X", "X", "X", 4, "O", 6, "O", 8, 9]);
  // al rendirse, el plugin fija el turno desde afuera para que currentTurn apunte al que sigue
  g.oTurn = 1;
  assert.equal(g.oTurn, true);
  assert.equal(g.currentTurn, "beto");
  // los campos internos ya no son accesibles
  assert.equal(g._x, undefined);
  assert.equal(g._currentTurn, undefined);
});

test("ta-te-ti: tablero lleno y empate", () => {
  const g = new TicTacToe();
  // X O X / X O O / O X X → sin ganador, tablero lleno (511)
  for (const [jugador, pos] of [[0, 0], [1, 1], [0, 2], [1, 4], [0, 3], [1, 5], [0, 7], [1, 6], [0, 8]]) assert.equal(g.turn(jugador, pos), 1, `jugada ${pos}`);
  assert.equal(g.board, 511);
  assert.equal(g.winner, false);
  assert.equal(g.turn(1, 0), -3, "terminó");
  assert.deepEqual(TicTacToe.render(0b000000111, 0b000111000), ["X", "X", "X", "O", "O", "O", 7, 8, 9]);
  assert.equal(TicTacToe.toBinary(1, 2), 0b010000000);
  assert.throws(() => TicTacToe.toBinary(3, 0), /invalid position/);
});
