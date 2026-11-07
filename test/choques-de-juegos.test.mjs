import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso } from "./helpers.mjs";
import txt from "../lib/strings.js";

// One message, one game. The games played with plain messages (the tic-tac-toe, the 4 en línea, the hangman) take
// their moves before any other game sees them and mark them (m.respuestaDeJuego, hooksEnOrden in load-functions.js),
// and a message quoting a game's message is that game's (lib/mensajes-de-juego.js). An "a" was a hangman guess and a
// trivia answer at once, a "7" a column and an answer, a digit a move and "una letra" for the hangman; Claudia chatted
// back to the tic-tac-toe's moves, which counted from any chat; and an open trivia took "a ver claudia" for an answer.

const G = "120363000000000091@g.us";
const OTRO = "120363000000000092@g.us";
const [ANA, BETO, CARLA, DANI] = ["300000000000081@lid", "300000000000082@lid", "300000000000083@lid", "300000000000084@lid"];
const TRIVIA = { pregunta: "¿Capital de Japón?", opciones: ["Osaka", "Kioto", "Tokio", "Nara"], correcta: "c" };
const NUMERICA = { pregunta: "¿Cuántos días tiene una semana?", opciones: ["7", "11", "9", "13"], correcta: "a" };

let L, Tr, C4, J, Trivia, Ahorcado, CuatroEnLinea, TttHook, Ttt, hooks, client;
before(async () => {
  await prepararBase("choques-de-juegos");
  L = await import("../load-functions.js");
  Tr = await import("../lib/trivia.js");
  C4 = await import("../lib/cuatro-en-linea.js");
  J = await import("../lib/mensajes-de-juego.js");
  const plugin = async (archivo) => (await import(`../plugins/${archivo}.js`)).default;
  [Trivia, Ahorcado, CuatroEnLinea, TttHook, Ttt] = await Promise.all(["_trivia", "fun-ahorcado", "fun-4enlinea", "_fun-ttt", "fun-ttt"].map(plugin));
  // The trivia loaded first: the order doesn't depend on that.
  hooks = L.hooksEnOrden({ "_trivia.js": Trivia, "fun-ahorcado.js": Ahorcado, "fun-4enlinea.js": CuatroEnLinea, "_fun-ttt.js": TttHook });
});
beforeEach(() => {
  client = clienteFalso();
  client.parseMention = (texto) => [...String(texto).matchAll(/@(\d{5,})/g)].map(([, n]) => `${n}@lid`);
  for (const sala of C4.salas.values()) clearTimeout(sala.timeout);
  C4.salas.clear();
  for (const chat of [G, OTRO]) Tr.cerrarRonda(chat);
});

// A message as the hooks get it, with the reactions it receives.
function mensaje(sender, text, { chat = G, quoted = null } = {}) {
  const m = { chat, sender, isGroup: chat.endsWith("@g.us"), message: { conversation: text }, text, quoted, reacciones: [] };
  m.react = async (emoji) => m.reacciones.push(emoji);
  return m;
}
// Through every hook, in their order, as handle-message runs them.
async function pasar(m) {
  for (const hook of hooks) await hook.before(m, { client, chat: { games: 1 } });
  return m;
}
const textos = () => globalThis.enviados.map((e) => e.msg?.text ?? "");
const intento = (chat, quien) => Boolean(Tr.rondaDe(chat)?.intentos.has(quien));

test("hooksEnOrden: los juegos de mensajes sueltos van antes que el resto, aunque se carguen después", () => {
  const p = (nombre, marca = {}) => ({ nombre, before() {}, ...marca });
  const orden = L.hooksEnOrden({ trivia: p("trivia"), claudia: p("claudia", { alFinal: true }), ttt: p("ttt", { jugadas: true }), memoria: p("memoria", { trasModeracion: true }), antilink: p("antilink", { moderacion: true }), ahorcado: p("ahorcado", { jugadas: true }) });
  assert.deepEqual(orden.map((h) => h.nombre), ["antilink", "memoria", "ttt", "ahorcado", "trivia", "claudia"]);
  assert.deepEqual(hooks.map((h) => (h === Trivia ? "trivia" : "jugadas")), ["jugadas", "jugadas", "jugadas", "trivia"]);
});

test("ahorcado y trivia: la letra suelta es del ahorcado; citando la trivia, de la trivia", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => t.mock.timers.reset());
  await Ahorcado.run(mensaje(ANA, ".ahorcado"), { client, chat: { games: 1 } });
  Tr.abrirRonda(G, { tipo: "trivia", pregunta: TRIVIA, mensajeId: "TRIVIA-1", segundos: 30, client });

  const suelta = await pasar(mensaje(ANA, "a"));
  assert.equal(suelta.respuestaDeJuego, true, "es del ahorcado, y Claudia no la charla");
  assert.match(textos().at(-1), /Letras usadas: a$/);
  assert.equal(intento(G, ANA), false, "la trivia no le gastó el intento");
  assert.deepEqual(suelta.reacciones, [], "ni reaccionó");

  const citada = await pasar(mensaje(ANA, "c", { quoted: { id: "TRIVIA-1" } }));
  assert.deepEqual(citada.reacciones, ["✅"], "citando la trivia, contesta la trivia");
  assert.doesNotMatch(textos().join("\n"), /Letras usadas: a, c/, "y no es una letra del ahorcado");
  t.mock.timers.tick(5 * 60 * 1000); // the hangman runs out
});

test("4 en línea y una trivia con números: el «7» es una jugada, también fuera de turno; citando la trivia, una respuesta", async () => {
  await CuatroEnLinea.run(mensaje(ANA, ".4enlinea"), { client, text: "", chat: { games: 1 } });
  await CuatroEnLinea.run(mensaje(BETO, ".4enlinea"), { client, text: "", chat: { games: 1 } });
  Tr.abrirRonda(G, { tipo: "trivia", pregunta: NUMERICA, mensajeId: "TRIVIA-2", segundos: 30, client });

  const jugada = await pasar(mensaje(ANA, "7"));
  assert.equal(jugada.respuestaDeJuego, true);
  assert.equal(C4.salas.get(G).tablero[5][6], 1, "jugó la columna 7");
  assert.equal(intento(G, ANA), false, "y no contestó la trivia");

  const fueraDeTurno = await pasar(mensaje(ANA, "7"));
  assert.equal(fueraDeTurno.respuestaDeJuego, true, "fuera de turno sigue siendo del tablero");
  assert.equal(C4.salas.get(G).tablero[4][6], 0, "pero no se juega");
  assert.equal(intento(G, ANA), false, "ni es una respuesta");

  const citada = await pasar(mensaje(BETO, "7", { quoted: { id: "TRIVIA-2" } }));
  assert.deepEqual(citada.reacciones, ["✅"], "citando la trivia, es una respuesta");
  assert.equal(C4.salas.get(G).tablero[4][6], 0, "y no una jugada");
  assert.equal(C4.salas.get(G).turno, 2, "a Beto le sigue tocando");
});

test("ahorcado y un tablero: el dígito es la jugada, sin el aviso de la letra", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => t.mock.timers.reset());
  await Ahorcado.run(mensaje(ANA, ".ahorcado"), { client, chat: { games: 1 } });
  await CuatroEnLinea.run(mensaje(ANA, ".4enlinea"), { client, text: "", chat: { games: 1 } });
  await CuatroEnLinea.run(mensaje(BETO, ".4enlinea"), { client, text: "", chat: { games: 1 } });
  const antes = globalThis.enviados.length;
  await pasar(mensaje(ANA, "4"));
  assert.equal(C4.salas.get(G).tablero[5][3], 1, "jugó el 4 en línea");
  assert.ok(!textos().slice(antes).includes(txt.ahorcadoLetra), "y el ahorcado no le pidió una letra");
  t.mock.timers.tick(5 * 60 * 1000);
});

test("ta-te-ti: sus tableros y sus jugadas son del juego, y solo en el chat de la sala", async () => {
  await Ttt.run(mensaje(CARLA, ".ttt"), { client, text: "", chat: { games: 1 } });
  await Ttt.run(mensaje(DANI, ".ttt"), { client, text: "", chat: { games: 1 } });
  const tablero = `MSG${globalThis.enviados.length}`;
  assert.equal(J.juegoDelMensaje(tablero), "ttt", "el tablero es un mensaje de juego: responderle no le habla a Claudia");
  const sala = Object.values(client.game)[0];
  const quienJuega = sala.game.currentTurn;
  const otro = quienJuega === CARLA ? DANI : CARLA;

  // In another group or in private, a number from a player is nobody's move, and the room stays where it is.
  for (const chat of [OTRO, "59899000084@s.whatsapp.net"]) {
    const m = await pasar(mensaje(quienJuega, "5", { chat }));
    assert.equal(m.respuestaDeJuego, undefined, chat);
  }
  assert.deepEqual([sala.x, sala.o, sala.game.board], [G, G, 0]);

  const jugada = await pasar(mensaje(quienJuega, "5", { quoted: { id: tablero } }));
  assert.equal(jugada.respuestaDeJuego, true, "una jugada es del juego: Claudia no la charla");
  assert.notEqual(sala.game.board, 0, "y se jugó");
  assert.equal(J.juegoDelMensaje(`MSG${globalThis.enviados.length}`), "ttt", "el tablero nuevo también es del juego");
  const fueraDeTurno = await pasar(mensaje(quienJuega, "1"));
  assert.equal(fueraDeTurno.respuestaDeJuego, true, "fuera de turno, del juego igual");
  assert.equal(sala.game.currentTurn, otro, "pero no se jugó");

  // A number quoting the trivia is the trivia's, not a move.
  Tr.abrirRonda(G, { tipo: "trivia", pregunta: NUMERICA, mensajeId: "TRIVIA-4", segundos: 30, client });
  const tableroAntes = sala.game.board;
  const citada = await pasar(mensaje(otro, "9", { quoted: { id: "TRIVIA-4" } }));
  assert.deepEqual(citada.reacciones, ["❌"], "es una respuesta (equivocada)");
  assert.deepEqual([sala.game.board, sala.game.currentTurn], [tableroAntes, otro], "y no una jugada");
  delete client.game[sala.id];
});

test("trivia: con una ronda abierta, «A ver claudia, ¿qué opinás?» es charla; «c, claudia» es una respuesta", async () => {
  Tr.abrirRonda(G, { tipo: "trivia", pregunta: TRIVIA, mensajeId: "TRIVIA-3", segundos: 30, client });
  const charla = await pasar(mensaje(ANA, "A ver claudia, ¿qué opinás?"));
  assert.equal(charla.respuestaDeJuego, undefined, "no queda marcada: Claudia la contesta");
  assert.equal(intento(G, ANA), false, "y no le gastó el intento");
  const respuesta = await pasar(mensaje(ANA, "c, claudia"));
  assert.deepEqual(respuesta.reacciones, ["✅"]);
});
