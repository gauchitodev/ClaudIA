import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { prepararBase, clienteFalso, fijarSaldo, mazoDe } from "./helpers.mjs";
import txt from "../lib/strings.js";
import { cargados } from "../lib/plugins-cargados.js";

// The 4 en línea (lib/cuatro-en-linea.js, plugins/fun-4enlinea.js and fun-4enlinea-del.js): the board, the turns, the
// commands, the bets, and how it lives next to the tic-tac-toe, which takes plain numbers as moves too. And .rendirse
// (plugins/fun-rendirse.js), which it shares with the blackjack.

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const G = "120363000000000071@g.us";
const G2 = "120363000000000072@g.us";
const ANA = "300000000000021@lid";
const BETO = "300000000000022@lid";
const CARLA = "300000000000023@lid";
const DANI = "300000000000024@lid";
const CHAT = { games: 1 };

let F, C4, Plugin, Del, Rendirse, Ttt, BJ, client;
before(async () => {
  ({ F } = await prepararBase("cuatro-en-linea"));
  C4 = await import("../lib/cuatro-en-linea.js");
  Plugin = (await import("../plugins/fun-4enlinea.js")).default;
  Del = (await import("../plugins/fun-4enlinea-del.js")).default;
  Rendirse = (await import("../plugins/fun-rendirse.js")).default;
  Ttt = (await import("../plugins/fun-ttt.js")).default;
  BJ = await import("../lib/blackjack.js");
});

// The tables with a bet keep a timer: one left over would keep the test process going.
function vaciarSalas() {
  for (const sala of C4.salas.values()) clearTimeout(sala.timeout);
  C4.salas.clear();
}
after(vaciarSalas);

let ids = 0;
beforeEach(() => {
  vaciarSalas();
  client = clienteFalso();
  // Each message with an id of its own in the whole file: the game marks are kept by id (lib/mensajes-de-juego.js).
  for (const metodo of ["sendMessage", "sendText"]) {
    const real = client[metodo];
    client[metodo] = async (...args) => {
      await real(...args);
      const id = `C4-${++ids}`;
      globalThis.enviados.at(-1).id = id;
      return { key: { id } };
    };
  }
  client.parseMention = (texto) => [...String(texto).matchAll(/@(\d{5,})/g)].map(([, n]) => `${n}@lid`);
});

const msg = (sender, text, chat = G) => ({ chat, sender, text, isGroup: true, react: async (emoji) => globalThis.enviados.push({ chat, msg: { react: emoji } }) });
// A command, as handle-message.js runs it once its checks pass, through the plugin that declares it.
const DUENO = { del4enlinea: () => Del, rendirse: () => Rendirse, rendirme: () => Rendirse };
const comando = (sender, command, { chat = G, isAdmin = false, text = "", datosChat = CHAT } = {}) =>
  (DUENO[command]?.() ?? Plugin).run(msg(sender, `.${command}${text ? ` ${text}` : ""}`, chat), { client, command, text, isAdmin, chat: datosChat });
const saldo = (quien, chat = G) => F.getSaldoCoins(chat, quien);
// A plain message, through the hook that takes the moves.
async function escribir(sender, text, { chat = G, datosChat = CHAT } = {}) {
  const m = msg(sender, text, chat);
  await Plugin.before(m, { client, chat: datosChat });
  return m;
}
const ultimo = () => globalThis.enviados.at(-1)?.msg;
// A board by its rows, top to bottom: "." empty, "1" red, "2" yellow.
const tablero = (...filas) => filas.map((f) => [...f].map((ch) => (ch === "." ? 0 : Number(ch))));
const ordenadas = (celdas) => celdas.map(([r, c]) => `${r},${c}`).sort();

test("4 en línea: gana el que junta cuatro seguidas, en columna, en fila o en las dos diagonales", () => {
  const t = C4.tableroVacio();
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(C4.soltar(t, 0, 1), { ok: true, celdas: [], ganador: 0, empate: false });
    C4.soltar(t, 1, 2);
  }
  let j = C4.soltar(t, 0, 1);
  assert.equal(j.ganador, 1);
  assert.deepEqual(ordenadas(j.celdas), ordenadas([[5, 0], [4, 0], [3, 0], [2, 0]]));

  // In a row, closed in the middle: the line runs both ways from the last disc.
  const fila = tablero(".......", ".......", ".......", ".......", ".......", "22.2...");
  j = C4.soltar(fila, 2, 2);
  assert.equal(j.ganador, 2);
  assert.deepEqual(ordenadas(j.celdas), ordenadas([[5, 0], [5, 1], [5, 2], [5, 3]]));

  // The two diagonals, on discs of the other color that hold them up.
  const sube = tablero(".......", ".......", ".......", "..12...", ".122...", "1222...");
  j = C4.soltar(sube, 3, 1);
  assert.equal(j.ganador, 1);
  assert.deepEqual(ordenadas(j.celdas), ordenadas([[2, 3], [3, 2], [4, 1], [5, 0]]));
  const baja = tablero(".......", ".......", ".......", "...12..", "...112.", "...1112");
  j = C4.soltar(baja, 3, 2);
  assert.equal(j.ganador, 2);
  assert.deepEqual(ordenadas(j.celdas), ordenadas([[2, 3], [3, 4], [4, 5], [5, 6]]));

  // Five in a row are a line too, all of them.
  const cinco = tablero(".......", ".......", ".......", ".......", ".......", "11.11..");
  assert.equal(C4.soltar(cinco, 2, 1).celdas.length, 5);
});

test("4 en línea: una columna llena o que no existe no cuenta, y el tablero lleno sin cuatro seguidas es empate", () => {
  const t = C4.tableroVacio();
  for (let i = 0; i < 6; i++) C4.soltar(t, 4, i % 2 ? 2 : 1);
  const antes = JSON.stringify(t);
  assert.deepEqual(C4.soltar(t, 4, 1), { ok: false, motivo: "columna-llena" });
  for (const columna of [-1, 7, 1.5, NaN, "3"]) assert.deepEqual(C4.soltar(t, columna, 1), { ok: false, motivo: "columna-invalida" }, String(columna));
  assert.equal(JSON.stringify(t), antes, "el tablero quedó como estaba");

  // Pairs of columns alternate, and each row is the one above flipped: full, with no line of four anywhere.
  const lleno = Array.from({ length: 6 }, (_, r) => Array.from({ length: 7 }, (_, c) => ((r + Math.floor(c / 2)) % 2 === 0 ? 1 : 2)));
  const ficha = lleno[0][6];
  lleno[0][6] = 0;
  assert.deepEqual(C4.soltar(lleno, 6, ficha), { ok: true, celdas: [], ganador: 0, empate: true });
  // The last disc fills it and makes four: that's a win, not a draw.
  const ultima = Array.from({ length: 6 }, (_, r) => Array.from({ length: 7 }, (_, c) => ((r + Math.floor(c / 2)) % 2 === 0 ? 1 : 2)));
  ultima[0] = [1, 1, 1, 0, 2, 2, 1];
  const j = C4.soltar(ultima, 3, 1);
  assert.deepEqual([j.ganador, j.empate, j.celdas.length], [1, false, 4]);
});

test("4 en línea: el tablero son emojis con los números de las columnas abajo, y las que ganaron van en cuadrados", () => {
  const t = C4.tableroVacio();
  C4.soltar(t, 0, 1);
  C4.soltar(t, 6, 2);
  const vacia = "🟩🟩🟩🟩🟩🟩🟩";
  assert.equal(C4.dibujar(t), [vacia, vacia, vacia, vacia, vacia, "🔴🟩🟩🟩🟩🟩🟡", "1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣"].join("\n"));
  assert.equal(C4.dibujar(t, [[5, 0], [5, 6]]).split("\n")[5], "🟥🟩🟩🟩🟩🟩🟨");
});

test(".4enlinea: el primero abre la mesa, el segundo se sienta y cada uno juega en su turno", async () => {
  await comando(ANA, "4enlinea");
  assert.match(ultimo().text, /^🔴 \*4 en línea\*\n@300000000000021 espera rival\./);
  assert.deepEqual(ultimo().mentions, [ANA]);
  await comando(ANA, "4enlinea");
  assert.equal(ultimo().text, "Ya estás esperando rival, esperá a que alguien se sume.");
  // Before the second sits down, a number is no move.
  assert.equal((await escribir(ANA, "4")).respuestaDeJuego, undefined);

  await comando(BETO, "4enlínea");
  assert.match(ultimo().text, /^🔴 @300000000000021 {2}vs {2}🟡 @300000000000022\n\n/);
  assert.match(ultimo().text, /Turno de @300000000000021 🔴\nEscribí un número del 1 al 7\. Para abandonar: \.rendirse$/);
  assert.deepEqual(ultimo().mentions, [ANA, BETO]);
  await comando(CARLA, "4enlinea");
  assert.match(ultimo().text, /^Ya hay una partida en este grupo: @300000000000021 vs @300000000000022\./);

  // Not playing, not a column, or another group: no word, and the number is a message like any other.
  const enviados = globalThis.enviados.length;
  for (const [quien, texto, chat] of [[CARLA, "4"], [ANA, "8"], [ANA, "0"], [ANA, "44"], [ANA, "4 dale"], [ANA, "4", G2]]) {
    assert.equal((await escribir(quien, texto, { chat })).respuestaDeJuego, undefined, `"${texto}" de ${quien}`);
  }
  // Not their turn: no word either, but a player's number is the board's, so no other game takes it (a trivia with
  // numbers for options) and Claudia doesn't chat back.
  assert.equal((await escribir(BETO, "4")).respuestaDeJuego, true, "fuera de turno");
  assert.equal(globalThis.enviados.length, enviados, "no contestó nada");
  assert.deepEqual(C4.salas.get(G).tablero, C4.tableroVacio());

  const m = await escribir(ANA, " 4 ");
  assert.equal(m.respuestaDeJuego, true, "una jugada es del juego, y Claudia no la charla");
  assert.equal(C4.salas.get(G).tablero[5][3], 1);
  assert.match(ultimo().text, /Turno de @300000000000022 🟡/);
  await escribir(BETO, "4");
  assert.equal(C4.salas.get(G).tablero[4][3], 2);
  assert.match(ultimo().text, /Turno de @300000000000021 🔴/);
});

test("4 en línea: gana el primero que junta cuatro, sin UruCoins, y la mesa queda libre", async () => {
  const saldo = F.getSaldoCoins(G, ANA);
  await comando(ANA, "4enlinea");
  await comando(BETO, "4enlinea");
  for (const [quien, columna] of [[ANA, 1], [BETO, 2], [ANA, 1], [BETO, 2], [ANA, 1], [BETO, 2], [ANA, 1]]) await escribir(quien, String(columna));
  const final = ultimo().text;
  assert.match(final, /\n\n🏆 ¡Ganó @300000000000021 🔴! 🎉$/);
  assert.equal(final.match(/🟥/g)?.length, 4, "las cuatro que ganaron, en cuadrados");
  // Between two who agree, a game is won in 7 moves, over and over: like the tic-tac-toe, it pays nothing.
  assert.doesNotMatch(final, /UruCoins/);
  assert.equal(F.getSaldoCoins(G, ANA), saldo);
  assert.equal(C4.salas.has(G), false);

  const enviados = globalThis.enviados.length;
  await escribir(BETO, "3");
  assert.equal(globalThis.enviados.length, enviados, "terminada, un número ya no es jugada");
  await comando(CARLA, "4enlinea");
  assert.match(ultimo().text, /@300000000000023 espera rival/);
});

test("4 en línea: una columna llena se avisa, y sigue el mismo turno", async () => {
  await comando(ANA, "4enlinea");
  await comando(BETO, "4enlinea");
  for (let i = 0; i < 6; i++) await escribir(i % 2 ? BETO : ANA, "1");
  const m = await escribir(ANA, "1");
  assert.equal(ultimo().text, "Esa columna está llena, probá con otra.");
  assert.equal(m.respuestaDeJuego, true);
  await escribir(ANA, "2");
  assert.equal(C4.salas.get(G).tablero[5][1], 1, "le seguía tocando a Ana");
});

test("4 en línea: .rendirse le da la partida al otro, y .del4enlinea la borra (los que juegan o un admin)", async () => {
  await comando(CARLA, "rendirse");
  assert.equal(ultimo().text, "No estás jugando al 4 en línea ni tenés una mano de blackjack.");
  await comando(ANA, "del4enlinea");
  assert.equal(ultimo().text, "No hay ninguna partida de 4 en línea en este grupo.");

  await comando(ANA, "4enlinea");
  await comando(ANA, "rendirse");
  assert.equal(ultimo().text, "Todavía no empezó: si querés dejar la mesa, usá .del4enlinea.");
  await comando(BETO, "4enlinea");
  await comando(BETO, "rendirme");
  assert.deepEqual(ultimo(), { text: "🏳️ @300000000000022 se rindió. ¡Ganó @300000000000021! 🎉", mentions: [BETO, ANA] });
  assert.equal(C4.salas.has(G), false);

  await comando(ANA, "4enlinea");
  await comando(CARLA, "del4enlinea");
  assert.equal(ultimo().text, "Solo los que juegan o un admin pueden cancelar la partida.");
  assert.ok(C4.salas.has(G));
  await comando(CARLA, "del4enlinea", { isAdmin: true });
  assert.equal(ultimo().text, "Partida de 4 en línea cancelada.");
  assert.equal(C4.salas.has(G), false);
  await comando(ANA, "4enlinea");
  await comando(BETO, "4enlinea");
  await comando(BETO, "del4enlinea");
  assert.equal(ultimo().text, "Partida de 4 en línea cancelada.");
  assert.equal(C4.salas.has(G), false);
});

test("4 en línea: con los juegos apagados no toma jugadas, y una mesa sin jugadas se borra a los 10 minutos", async () => {
  await comando(ANA, "4enlinea");
  await comando(BETO, "4enlinea");
  assert.equal((await escribir(ANA, "4", { datosChat: { games: 0 } })).respuestaDeJuego, undefined);
  assert.equal(C4.salas.get(G).tablero[5][3], 0);

  const sala = C4.salas.get(G);
  assert.equal(C4.salaVigente(G, sala.ultimo + C4.CUATRO_EN_LINEA.INACTIVIDAD_MS), sala, "a los 10 minutos justos sigue");
  // Each move starts the 10 minutes over: nine minutes without one, a move, and nine more, and the room is still there.
  sala.ultimo = Date.now() - 9 * 60 * 1000;
  await escribir(ANA, "4");
  assert.equal(C4.salaVigente(G, Date.now() + 9 * 60 * 1000), sala);
  sala.ultimo = Date.now() - C4.CUATRO_EN_LINEA.INACTIVIDAD_MS - 1;
  assert.equal((await escribir(ANA, "4")).respuestaDeJuego, undefined);
  assert.equal(C4.salas.has(G), false, "pasados, se borró al mirarla");
  await comando(CARLA, "4enlinea");
  assert.match(ultimo().text, /@300000000000023 espera rival/);
});

test("4 en línea y ta-te-ti: quien está en uno no abre el otro, porque los dos se juegan con números", async () => {
  const ttt = (sender, chat = G) => Ttt.run(msg(sender, ".ttt", chat), { client, text: "", chat: CHAT });
  await comando(ANA, "4enlinea");
  await ttt(ANA);
  assert.equal(ultimo().text, "Estás jugando al 4 en línea: terminá esa partida primero.");
  assert.deepEqual(Object.keys(client.game || {}), [], "esperando rival también cuenta");
  await comando(BETO, "4enlinea");
  // From another group too: the tic-tac-toe takes its numbers from any chat (plugins/_fun-ttt.js).
  await ttt(BETO, G2);
  assert.equal(ultimo().text, "Estás jugando al 4 en línea: terminá esa partida primero.");
  assert.deepEqual(Object.keys(client.game || {}), []);

  // And the other way round.
  await ttt(CARLA, G2);
  await ttt(DANI, G2);
  assert.equal(Object.values(client.game)[0].state, "PLAYING");
  await comando(CARLA, "4enlinea", { chat: G2 });
  assert.equal(ultimo().text, "Estás jugando al ta-te-ti: terminá esa partida primero.");
  assert.equal(C4.salas.has(G2), false);
});

test("4 en línea: sus tableros son mensajes de juego, y responderles no le habla a Claudia", async () => {
  const { esMensajeDeJuego, juegoRecienteEn } = await import("../lib/mensajes-de-juego.js");
  const G3 = "120363000000000073@g.us"; // a group of this test alone: the time of a chat's last game is kept by chat
  await comando(ANA, "4enlinea", { chat: G3 });
  assert.equal(juegoRecienteEn(G3), false);
  await comando(BETO, "4enlinea", { chat: G3 });
  await escribir(ANA, "4", { chat: G3 });
  const tableros = globalThis.enviados.filter((e) => e.msg?.text?.includes("1️⃣2️⃣3️⃣"));
  assert.equal(tableros.length, 2);
  for (const e of tableros) assert.ok(esMensajeDeJuego(e.id), e.msg.text);
  // And while a game goes on, Claudia's initiative stays out of the group (lib/tacto.js).
  assert.ok(juegoRecienteEn(G3));
});

test("4 en línea: guardar el plugin no pierde las partidas que se están jugando", async () => {
  const L = await import("../load-functions.js");
  cargados.plugins ??= {};
  await comando(ANA, "4enlinea");
  await comando(BETO, "4enlinea");
  // As watchPlugins loads it again when its file changes: a new module, with a query of its own.
  await L.recargarPlugin("fun-4enlinea.js", "change", `${RAIZ}/plugins/`);
  const recargado = cargados.plugins["fun-4enlinea"];
  assert.ok(recargado && recargado !== Plugin, "es otro módulo");
  const m = msg(ANA, "4");
  await recargado.before(m, { client, chat: CHAT });
  assert.equal(m.respuestaDeJuego, true);
  assert.equal(C4.salas.get(G).tablero[5][3], 1, "la partida siguió");
});

test("4 en línea: se escribe con tilde o sin ella, y sus comandos están en la sección juegos de .bladd", async () => {
  // one name, without the accent: the parser takes it out of ".4enlínea" (lib/comandos.js)
  assert.ok(Plugin.cmd.includes("4enlinea") && !Plugin.cmd.includes("4enlínea"));
  const { parsearComando } = await import("../lib/comandos.js");
  assert.equal(parsearComando(".4enlínea", ["."]).comando, "4enlinea");
  const { secciones } = await import("../lib/secciones.js");
  assert.deepEqual(
    [...Plugin.cmd, ...Del.cmd, ...Rendirse.cmd].filter((c) => !secciones.juegos.includes(c)),
    [],
  );
  // .rendirse is the blackjack's too: a .bladd +casino has to let it through as well.
  assert.deepEqual(
    Rendirse.cmd.filter((c) => !secciones.casino.includes(c)),
    [],
  );
});

// ---------- for UruCoins ----------

// Ana opens a table for the amount and Beto sits down writing it too: each one is charged on doing so.
async function partidaPorUruCoins(monto) {
  await comando(ANA, "4enlinea", { text: String(monto) });
  await comando(BETO, "4enlinea", { text: String(monto) });
}

test("4 en línea por UruCoins: quien abre paga, quien se sienta escribe el mismo monto y paga, y el que gana se lleva los dos", async () => {
  fijarSaldo(F, G, ANA, 500);
  fijarSaldo(F, G, BETO, 500);
  await comando(ANA, "4enlinea", { text: "100" });
  assert.match(ultimo().text, /^🔴 \*4 en línea\* por \*100 UruCoins\* cada uno\n@300000000000021 espera rival\.\n\nPara jugar contra esa persona escribí \.4enlinea 100 \(ponés 100, y el que gana se lleva 200\)\./);
  assert.equal(saldo(ANA), 400, "a quien abre se le cobra al abrir");

  // Without the amount, or with another one, nobody sits down: nobody bets without meaning to.
  for (const text of ["", "50"]) {
    await comando(BETO, "4enlinea", { text });
    assert.equal(ultimo().text, "❌ Esta mesa es por 100 UruCoins cada uno: para sentarte, escribí .4enlinea 100", `«${text}»`);
  }
  assert.deepEqual([saldo(BETO), C4.salas.get(G).estado], [500, "ESPERANDO"]);

  await comando(BETO, "4enlinea", { text: "100" });
  assert.equal(saldo(BETO), 400);
  assert.match(ultimo().text, /^🔴 @300000000000021 {2}vs {2}🟡 @300000000000022\n💰 200 UruCoins en juego\n\n/);
  for (const [quien, columna] of [[ANA, 1], [BETO, 2], [ANA, 1], [BETO, 2], [ANA, 1], [BETO, 2], [ANA, 1]]) await escribir(quien, String(columna));
  assert.match(ultimo().text, /\n\n🏆 ¡Ganó @300000000000021 🔴! 🎉\n💰 Se lleva 200 UruCoins\.$/);
  assert.deepEqual([saldo(ANA), saldo(BETO), C4.salas.has(G)], [600, 400, false]);
});

test("4 en línea por UruCoins: el empate devuelve lo de cada uno, rendirse es perder, y el escudo del que pierde devuelve", async () => {
  fijarSaldo(F, G, ANA, 500);
  fijarSaldo(F, G, BETO, 500);
  F.borrarItem(G, BETO, "escudo");
  await partidaPorUruCoins(100);
  // A board one disc from full, with no four anywhere, and Beto's disc to go: a draw.
  const sala = C4.salas.get(G);
  sala.tablero = Array.from({ length: 6 }, (_, r) => Array.from({ length: 7 }, (_, c) => ((r + Math.floor(c / 2)) % 2 === 0 ? 1 : 2)));
  sala.tablero[0][6] = 0;
  sala.turno = 2;
  await escribir(BETO, "7");
  assert.match(ultimo().text, /🤝 ¡Empate! El tablero se llenó\.\n💰 Cada uno recupera sus 100 UruCoins\.$/);
  assert.deepEqual([saldo(ANA), saldo(BETO)], [500, 500]);

  await partidaPorUruCoins(100);
  await comando(BETO, "rendirse");
  assert.deepEqual(ultimo(), { text: "🏳️ @300000000000022 se rindió. ¡Ganó @300000000000021! 🎉\n💰 Se lleva 200 UruCoins.", mentions: [BETO, ANA] });
  assert.deepEqual([saldo(ANA), saldo(BETO)], [600, 400]);

  // As in a duel: the shield of whoever loses gives back what it can, and the winner keeps the whole pot.
  F.agregarItem(G, BETO, "escudo", 1);
  await partidaPorUruCoins(100);
  await comando(BETO, "rendirse");
  assert.match(ultimo().text, /💰 Se lleva 200 UruCoins\.\n🛡️ @300000000000022 tenía escudo y recupera 25\.$/);
  assert.deepEqual([saldo(ANA), saldo(BETO)], [700, 325]);
});

test("4 en línea por UruCoins: el monto es un número entero, con mínimo y máximo, y a cada uno le tiene que alcanzar", async () => {
  fijarSaldo(F, G, ANA, 100);
  await comando(ANA, "4enlinea", { text: "mucho" });
  assert.equal(ultimo().text, "Para jugar por UruCoins: .4enlinea 100 (mínimo 5, máximo 100 o el 20 % de tu saldo, lo que sea mayor). Sin nada, se juega por diversión.");
  await comando(ANA, "4enlinea", { text: "4" });
  assert.equal(ultimo().text, "❌ La apuesta mínima es 5 UruCoins.");
  await comando(ANA, "4enlinea", { text: "101" });
  assert.equal(ultimo().text, "❌ Tu apuesta máxima en el 4 en línea es 100 UruCoins (100 o el 20 % de tu saldo, lo que sea mayor).");
  fijarSaldo(F, G, ANA, 60);
  await comando(ANA, "4enlinea", { text: "80" });
  assert.equal(ultimo().text, "❌ No te alcanza: tenés 60 UruCoins.");
  assert.deepEqual([saldo(ANA), C4.salas.has(G)], [60, false], "no abrió nada");

  // Whoever sits down has to be able to pay too.
  await comando(ANA, "4enlinea", { text: "50" });
  fijarSaldo(F, G, BETO, 30);
  await comando(BETO, "4enlinea", { text: "50" });
  assert.equal(ultimo().text, "❌ No te alcanza: tenés 30 UruCoins.");
  assert.deepEqual([saldo(BETO), C4.salas.get(G).estado], [30, "ESPERANDO"]);
  await comando(ANA, "del4enlinea");
  assert.equal(saldo(ANA), 60);
  // And at a free table an amount doesn't sit anybody down.
  await comando(ANA, "4enlinea");
  await comando(BETO, "4enlinea", { text: "50" });
  assert.equal(ultimo().text, "❌ Esta mesa es sin apuesta: para sentarte, escribí .4enlinea solo.");
});

test("4 en línea por UruCoins: a los 10 minutos sin rival se devuelve, y en juego pierde aquel a quien le tocaba", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => t.mock.timers.reset());
  const DIEZ = C4.CUATRO_EN_LINEA.INACTIVIDAD_MS;
  fijarSaldo(F, G, ANA, 500);
  fijarSaldo(F, G, BETO, 500);
  await comando(ANA, "4enlinea", { text: "100" });
  t.mock.timers.tick(DIEZ - 1);
  assert.equal(saldo(ANA), 400);
  t.mock.timers.tick(1);
  assert.deepEqual(ultimo(), { text: "⌛ Nadie se sentó a la mesa de 4 en línea de @300000000000021 en 10 minutos: recupera sus 100 UruCoins.", mentions: [ANA] });
  assert.deepEqual([saldo(ANA), C4.salas.has(G)], [500, false]);

  // Each move starts the 10 minutes over, and they run out on whoever has the turn: giving up isn't just stopping.
  await partidaPorUruCoins(100);
  // Looking at it doesn't drop it, as it does a free one: that would take the coins at stake along with it.
  const sala = C4.salas.get(G);
  const ultimaJugada = sala.ultimo;
  sala.ultimo -= DIEZ + 1;
  assert.deepEqual([C4.salaVigente(G), C4.juegaCuatroEnLinea(ANA)], [sala, true]);
  sala.ultimo = ultimaJugada;
  await escribir(ANA, "4");
  t.mock.timers.tick(DIEZ - 1000);
  await escribir(BETO, "4");
  t.mock.timers.tick(DIEZ - 1000);
  assert.ok(C4.salas.has(G), "nueve minutos y pico después de la última jugada, sigue");
  t.mock.timers.tick(1000);
  assert.deepEqual(ultimo(), { text: "⌛ @300000000000021 no jugó en 10 minutos: ¡ganó @300000000000022! 🎉\n💰 Se lleva 200 UruCoins.", mentions: [ANA, BETO] });
  assert.deepEqual([saldo(ANA), saldo(BETO), C4.salas.has(G)], [400, 600, false]);
});

test("4 en línea por UruCoins: si apagan los juegos con la partida empezada, nadie puede jugar, y a los 10 minutos cada uno recupera lo suyo", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => {
    t.mock.timers.reset();
    F.updateChat(G, { games: true });
  });
  F.initDataDB({ chat: G, sender: ANA, senderJid: "", pushName: "Ana" });
  fijarSaldo(F, G, ANA, 500);
  fijarSaldo(F, G, BETO, 500);
  await partidaPorUruCoins(100);
  F.updateChat(G, { games: false });
  assert.equal((await escribir(ANA, "4", { datosChat: F.getChat(G) })).respuestaDeJuego, undefined, "con los juegos apagados no toma jugadas");
  t.mock.timers.tick(C4.CUATRO_EN_LINEA.INACTIVIDAD_MS);
  assert.equal(ultimo().text, "⌛ La partida de 4 en línea de @300000000000021 y @300000000000022 quedó parada con los juegos apagados: cada uno recupera sus 100 UruCoins.");
  assert.deepEqual([saldo(ANA), saldo(BETO), C4.salas.has(G)], [500, 500, false]);
});

test(".del4enlinea por UruCoins: esperando, devuelve; empezada, los que juegan no pueden y un admin les devuelve a los dos", async () => {
  fijarSaldo(F, G, ANA, 500);
  fijarSaldo(F, G, BETO, 500);
  await comando(ANA, "4enlinea", { text: "100" });
  await comando(ANA, "del4enlinea");
  assert.deepEqual(ultimo(), { text: "Partida de 4 en línea cancelada: @300000000000021 recupera sus 100 UruCoins.", mentions: [ANA] });
  assert.equal(saldo(ANA), 500);

  await partidaPorUruCoins(100);
  // Cancelling would be the way out of a game you're losing: not even for a player who is an admin.
  for (const isAdmin of [false, true]) {
    await comando(BETO, "del4enlinea", { isAdmin });
    assert.equal(ultimo().text, "Esta partida es por UruCoins: para dejarla, .rendirse (y gana el otro).", `isAdmin ${isAdmin}`);
  }
  await comando(CARLA, "del4enlinea");
  assert.equal(ultimo().text, "Solo un admin puede cancelar una partida por UruCoins.");
  assert.ok(C4.salas.has(G));
  await comando(CARLA, "del4enlinea", { isAdmin: true });
  assert.deepEqual(ultimo(), { text: "Partida de 4 en línea cancelada: @300000000000021 y @300000000000022 recuperan sus 100 UruCoins cada uno.", mentions: [ANA, BETO] });
  assert.deepEqual([saldo(ANA), saldo(BETO), C4.salas.has(G)], [500, 500, false]);
});

test("4 en línea por UruCoins: .casino off y .monedas off frenan la apuesta, y no la partida gratis", async () => {
  fijarSaldo(F, G, ANA, 500);
  fijarSaldo(F, G, BETO, 500);
  const sinCasino = { games: 1, casino: 0 };
  await comando(ANA, "4enlinea", { text: "100", datosChat: sinCasino });
  assert.equal(ultimo().text, "🎰 El casino está apagado en este grupo. Un admin lo prende con .casino on");
  await comando(ANA, "4enlinea", { text: "100", datosChat: { games: 1, monedas: 0 } });
  assert.equal(ultimo().text, txt.disabledEconomy);
  assert.deepEqual([saldo(ANA), C4.salas.has(G)], [500, false]);

  await comando(ANA, "4enlinea", { datosChat: sinCasino });
  assert.match(ultimo().text, /^🔴 \*4 en línea\*\n@300000000000021 espera rival/, "gratis, sí");
  await comando(ANA, "del4enlinea");
  // Sitting down at a table with a bet stops the same.
  await comando(ANA, "4enlinea", { text: "100" });
  await comando(BETO, "4enlinea", { text: "100", datosChat: sinCasino });
  assert.equal(ultimo().text, "🎰 El casino está apagado en este grupo. Un admin lo prende con .casino on");
  assert.deepEqual([saldo(BETO), C4.salas.get(G).estado], [500, "ESPERANDO"]);
  await comando(ANA, "del4enlinea");
});

test(".rendirse: en el 4 en línea anda con el casino apagado; si no, va a la mano de blackjack, con los frenos del casino", async (t) => {
  t.after(() => BJ.devolverManosBlackjack());
  const sinCasino = { games: 1, casino: 0 };
  await comando(ANA, "4enlinea");
  await comando(BETO, "4enlinea");
  await comando(BETO, "rendirse", { datosChat: sinCasino });
  assert.equal(ultimo().text, "🏳️ @300000000000022 se rindió. ¡Ganó @300000000000021! 🎉");

  // A blackjack hand whose first two cards still allow giving up.
  fijarSaldo(F, G, CARLA, 100);
  assert.equal(BJ.repartir(G, CARLA, 20, () => {}, mazoDe("8♠", "8♥", "9♣", "7♦", "2♠", "3♥")).terminada, false);
  await comando(CARLA, "rendirse", { datosChat: sinCasino });
  assert.equal(ultimo().text, "🎰 El casino está apagado en este grupo. Un admin lo prende con .casino on");
  // Outside the casino's hours: an hour that starts two hours from now never includes now.
  const desde = (new Date().getHours() + 2) % 24;
  const horario = `${String(desde).padStart(2, "0")}:00-${String((desde + 1) % 24).padStart(2, "0")}:00`;
  await comando(CARLA, "rendirse", { datosChat: { games: 1, horarioJuegos: horario } });
  assert.match(ultimo().text, /^🕒 Acá los juegos van de /);
  await comando(CARLA, "rendirse", { datosChat: { games: 1, monedas: 0 } });
  assert.equal(ultimo().text, txt.disabledEconomy);
  assert.ok(BJ.estadoMano(G, CARLA), "la mano sigue");

  await comando(CARLA, "rendirme");
  assert.match(ultimo().text, /^🏳️ Te rendiste con .+ Recuperás 10 de 20\./);
  assert.equal(saldo(CARLA), 90);
  await comando(CARLA, "rendirse");
  assert.equal(ultimo().text, "No estás jugando al 4 en línea ni tenés una mano de blackjack.");
});
