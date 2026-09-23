import { test, before, mock } from "node:test";
import assert from "node:assert/strict";
import { prepararBase } from "./helpers.mjs";
import strings from "../lib/strings.js";

// The short "reply to the question" games (.acertijo, .banderas, .ordenar). They used to check the chat, wait for the
// question to go out and only then store the game; with the question waiting its turn in the queue, a second command in
// the meantime started another game on top, and the first game's timer ended the second one.

let J;
before(async () => {
  await prepararBase("juego-rapido");
  globalThis.txt = strings;
  J = await import("../lib/juego-rapido.js");
});

// A client whose first message stays in the queue until the test lets it go: the window where the race happened.
function clienteConCola() {
  const salidas = [];
  let soltar;
  const compuerta = new Promise((resolve) => (soltar = resolve));
  const client = {
    sendText: async (chat, texto) => {
      salidas.push(texto);
      if (salidas.length === 1) await compuerta;
      return { key: { id: `Q${salidas.length}` } };
    },
  };
  return { client, salidas, soltar };
}

test("juego rápido: el chat se ocupa antes de mandar la pregunta", async () => {
  const juegos = {};
  let soltar;
  const compuerta = new Promise((resolve) => (soltar = resolve));
  const abriendo = J.abrirJuego(juegos, "c1@g.us", { juego: { respuesta: "sol" }, enviar: () => compuerta.then(() => ({ key: { id: "PREGUNTA" } })), alVencer: () => {} });

  // While the question waits, the chat is already taken, and the game can't be answered yet: it has no message.
  assert.equal(juegos["c1@g.us"].mensajeId, undefined, "sin mensaje todavía: el hook de respuestas lo ignora");
  assert.equal(await J.abrirJuego(juegos, "c1@g.us", { juego: {}, enviar: () => assert.fail("no debería mandar"), alVencer: () => {} }), false, "un segundo pedido encuentra el chat ocupado");

  soltar();
  assert.equal(await abriendo, true);
  assert.equal(juegos["c1@g.us"].mensajeId, "PREGUNTA");
  clearTimeout(juegos["c1@g.us"].timeout);
});

test("juego rápido: si la pregunta no sale, el chat queda libre", async () => {
  const juegos = {};
  await assert.rejects(() => J.abrirJuego(juegos, "c2@g.us", { juego: {}, enviar: async () => { throw new Error("sin conexión"); }, alVencer: () => {} }), /sin conexión/);
  assert.equal(juegos["c2@g.us"], undefined, "no queda un juego fantasma bloqueando el chat");
});

test("juego rápido: el reloj de un juego no termina otro", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const juegos = {};
    const vencidos = [];
    await J.abrirJuego(juegos, "c3@g.us", { juego: { nombre: "viejo" }, enviar: async () => ({ key: { id: "V" } }), alVencer: () => vencidos.push("viejo"), ms: 1000 });
    // Something else takes the chat (what used to happen in the race).
    const nuevo = { nombre: "nuevo" };
    juegos["c3@g.us"] = nuevo;
    mock.timers.tick(1000);
    assert.deepEqual(vencidos, [], "el reloj viejo no anuncia nada");
    assert.equal(juegos["c3@g.us"], nuevo, "ni borra el juego que está en curso");
  } finally {
    mock.timers.reset();
  }
});

for (const [archivo, cmd, tiempo] of [
  ["fun-acertijos.js", "acertijo", /¡TIEMPO!/],
  ["fun-banderas.js", "banderas", /Tiempo agotado/],
  ["fun-ordenar-palabra.js", "ordenar", /¡TIEMPO!/],
]) {
  test(`.${cmd}: dos pedidos seguidos abren un solo juego, y a los 30 s se cierra el suyo`, async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const P = (await import(`../plugins/${archivo}`)).default;
      const { client, salidas, soltar } = clienteConCola();
      const m = { chat: `${cmd}@g.us`, sender: "a@lid", text: "", isGroup: true };

      const primero = P.run(m, { client });
      await P.run(m, { client }); // the second command, while the first question is still in the queue
      soltar();
      await primero;
      assert.equal(salidas.length, 2, "una sola pregunta");
      assert.equal(salidas[1], strings.gameAlready, "el segundo se entera de que ya hay un juego");

      mock.timers.tick(30_000);
      assert.equal(salidas.length, 3);
      assert.match(salidas[2], tiempo, "al vencer, se anuncia el final de ese mismo juego");
      assert.equal(await P.run(m, { client }).then(() => salidas.length), 4, "y el chat quedó libre para otro");
    } finally {
      mock.timers.reset();
    }
  });
}
