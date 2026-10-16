import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, clienteFalso } from "./helpers.mjs";
import strings from "../lib/strings.js";

// The hangman is played alone and, with its word list at hand (it's in the code), won almost every time: at 10 coins a
// game it was an open tap. It pays PREMIOS_POR_DIA games a day and then goes on without a prize, and so does every
// other game, with a cap of its own (lib/urucoins.js).

let F, U, Ahorcado, Ordenar;
before(async () => {
  ({ F } = await prepararBase("ahorcado"));
  globalThis.txt = strings;
  U = await import("../lib/urucoins.js");
  Ahorcado = (await import("../plugins/fun-ahorcado.js")).default;
  Ordenar = (await import("../plugins/fun-ordenar-palabra.js")).default;
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

test("premios de juegos: cada juego tiene su tope por persona (20, el ahorcado 5), y cuenta el día de hoy", () => {
  const C = "premios@g.us";
  // Yesterday's prizes don't count.
  const ayer = Date.now() - 24 * 3600e3;
  for (let i = 0; i < 5; i++) globalThis.db.prepare(`INSERT INTO urucoins_log (chat, usuario, cantidad, motivo, fecha) VALUES (?, ?, ?, ?, ?)`).run(C, "b@lid", 10, "juego_ganado_ahorcado", ayer);
  for (let i = 0; i < 5; i++) assert.match(U.juegoTerminado(C, "b@lid", { nombre: "ahorcado" }), /\+10 UruCoins/, `partida ${i + 1} de hoy`);
  assert.match(U.juegoTerminado(C, "b@lid", { nombre: "ahorcado" }), /sin premio/);
  // The group games had no cap, and whoever opens one can answer it with no wait between rounds.
  for (const juego of ["trivia", "banderas", "acertijo", "ordenar"]) assert.equal(U.PREMIOS_POR_DIA[juego].partidas, 20, juego);
  for (let i = 0; i < 20; i++) assert.match(U.juegoTerminado(C, "b@lid", { nombre: "acertijo" }), /\+10 UruCoins/, `acertijo ${i + 1}`);
  assert.equal(U.juegoTerminado(C, "b@lid", { nombre: "acertijo" }), "\n\n🪙 Ya cobraste los 20 premios de acertijos de hoy: esta va sin premio. Mañana, de nuevo.");
  assert.match(U.juegoTerminado(C, "b@lid", { nombre: "trivia" }), /\+10 UruCoins/, "el tope es de cada juego");
  assert.match(U.juegoTerminado(C, "d@lid", { nombre: "acertijo" }), /\+10 UruCoins/, "y de cada persona");
  assert.equal(F.getSaldoCoins(C, "b@lid"), 10 * (5 + 20 + 1));
  // The way it was called before games had names still pays, uncapped.
  assert.match(U.juegoTerminado(C, "c@lid", "c@lid"), /\+10 UruCoins/);
});

test("premios de juegos: .ordenar jugado a solas cobra 20 veces y sigue sin premio", async () => {
  const C = "solo@g.us";
  const client = clienteFalso();
  const m = (text, quoted = null) => ({ chat: C, sender: "e@lid", text, isGroup: true, quoted, react: async () => {} });
  const randomReal = Math.random;
  Math.random = () => 0; // always the list's first word: "sol"
  const finales = [];
  try {
    for (let ronda = 0; ronda < 22; ronda++) {
      await Ordenar.run(m(".ordenar"), { client });
      const pregunta = `MSG${globalThis.enviados.length}`; // clienteFalso's id for what it just sent
      await Ordenar.before(m("sol", { id: pregunta }), { client });
      finales.push(globalThis.enviados.at(-1).msg.text);
    }
  } finally {
    Math.random = randomReal;
  }
  assert.match(finales[19], /RESPUESTA CORRECTA![\s\S]*\+10 UruCoins por ganar/);
  assert.match(finales[20], /RESPUESTA CORRECTA![\s\S]*Ya cobraste los 20 premios de ordenar palabras de hoy: esta va sin premio/);
  assert.match(finales[21], /sin premio/);
  assert.equal(F.getSaldoCoins(C, "e@lid"), 200);
});

test("premios de juegos: cada juego que paga tiene su tope, y su motivo está clasificado", async () => {
  const fs = await import("node:fs");
  const { esMotivoConocido } = await import("../lib/timba.js");
  const carpeta = new URL("../plugins/", import.meta.url);
  const nombres = new Set();
  for (const archivo of fs.readdirSync(carpeta)) {
    const fuente = fs.readFileSync(new URL(archivo, carpeta), "utf8");
    for (const [, nombre] of fuente.matchAll(/juegoTerminado\([^)]*nombre:\s*"([^"]+)"/g)) nombres.add(nombre);
  }
  assert.ok(nombres.size >= 5, `se encontraron muy pocos juegos (${[...nombres].join(", ")}): el escaneo no está andando`);
  for (const nombre of nombres) assert.ok(U.PREMIOS_POR_DIA[nombre], `${nombre} paga sin tope`);
  for (const { motivo } of Object.values(U.PREMIOS_POR_DIA)) assert.ok(esMotivoConocido(motivo), `${motivo} no está en lib/timba.js`);
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
