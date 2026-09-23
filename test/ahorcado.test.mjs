import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, clienteFalso } from "./helpers.mjs";
import strings from "../lib/strings.js";

// The hangman is played alone and, with its word list at hand (it's in the code), won almost every time: at 10 coins a
// game it was an open tap. It pays PREMIOS_POR_DIA games a day and then goes on without a prize.

let F, U, Ahorcado;
before(async () => {
  ({ F } = await prepararBase("ahorcado"));
  globalThis.txt = strings;
  U = await import("../lib/urucoins.js");
  Ahorcado = (await import("../plugins/fun-ahorcado.js")).default;
});

test("ahorcado: paga hasta 5 partidas por día, y después se juega sin premio", async () => {
  const client = clienteFalso();
  const m = (text) => ({ chat: G, sender: "a@lid", text, isGroup: true, react: async () => {} });
  const randomReal = Math.random;
  Math.random = () => 0; // always the list's first word: "solido"
  const finales = [];
  try {
    for (let partida = 0; partida < 6; partida++) {
      await Ahorcado.run(m(".ahorcado"), { client, chat: {} });
      for (const letra of "solid") await Ahorcado.before(m(letra), { client });
      finales.push(globalThis.enviados.at(-1).msg.text);
    }
  } finally {
    Math.random = randomReal;
  }
  assert.match(finales[4], /\+10 UruCoins por ganar/);
  assert.match(finales[5], /Ya cobraste los 5 premios de ahorcado de hoy: esta va sin premio/);
  assert.equal(F.getSaldoCoins(G, "a@lid"), 50);
});

test("premios de juegos: el tope es solo del ahorcado, y cuenta el día de hoy", () => {
  const C = "premios@g.us";
  // Yesterday's prizes don't count.
  const ayer = Date.now() - 24 * 3600e3;
  for (let i = 0; i < 5; i++) globalThis.db.prepare(`INSERT INTO urucoins_log (chat, usuario, cantidad, motivo, fecha) VALUES (?, ?, ?, ?, ?)`).run(C, "b@lid", 10, "juego_ganado_ahorcado", ayer);
  for (let i = 0; i < 5; i++) assert.match(U.juegoTerminado(C, "b@lid", { nombre: "ahorcado" }), /\+10 UruCoins/, `partida ${i + 1} de hoy`);
  assert.match(U.juegoTerminado(C, "b@lid", { nombre: "ahorcado" }), /sin premio/);
  // The group games are competitive (whoever gets it first): no cap there.
  for (let i = 0; i < 8; i++) assert.match(U.juegoTerminado(C, "b@lid", { nombre: "trivia" }), /\+10 UruCoins/);
  assert.equal(F.getSaldoCoins(C, "b@lid"), 130);
  // The way it was called before games had names still pays, uncapped.
  assert.match(U.juegoTerminado(C, "c@lid", "c@lid"), /\+10 UruCoins/);
});

test("ahorcado: su tablero es un mensaje de juego, y responderle no le habla a Claudia", async () => {
  const { esMensajeDeJuego } = await import("../lib/mensajes-de-juego.js");
  const client = clienteFalso();
  const m = (text) => ({ chat: "tablero@g.us", sender: "t@lid", text, isGroup: true, react: async () => {} });
  const randomReal = Math.random;
  Math.random = () => 0; // "solido", so the game can be finished and leaves no 3-minute timer behind
  try {
    await Ahorcado.run(m(".ahorcado"), { client, chat: {} });
    await Ahorcado.before(m("s"), { client });
    await new Promise((resolve) => setImmediate(resolve)); // the boards are marked once they're out
    // The fake client numbers what it sends: MSG1 is the first board, MSG2 the one after the letter.
    assert.ok(esMensajeDeJuego("MSG1") && esMensajeDeJuego("MSG2"), "los dos tableros quedaron marcados");
  } finally {
    for (const letra of "olid") await Ahorcado.before(m(letra), { client });
    Math.random = randomReal;
  }
});
