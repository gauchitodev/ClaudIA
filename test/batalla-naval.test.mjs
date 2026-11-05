import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, fijarSaldo } from "./helpers.mjs";

// The batalla naval (lib/batalla-naval.js, plugins/fun-naval.js and fun-naval-del.js): the sea and the fleets, the
// shots, the commands, the bets, the ten minutes, and the games kept in the database across a restart. And .rendirse
// (plugins/fun-rendirse.js), which it shares with the 4 en línea and the blackjack.
const G = "120363000000000081@g.us";
const G2 = "120363000000000082@g.us";
const ANA = "300000000000031@lid";
const BETO = "300000000000032@lid";
const CARLA = "300000000000033@lid";
const CHAT = { games: 1 };
const LETRAS = "ABCDEFGH";

let F, BN, MJ, Plugin, Del, Rendirse, client, avisos;
before(async () => {
  ({ F } = await prepararBase("batalla-naval"));
  globalThis.txt = (await import("../lib/strings.js")).default;
  BN = await import("../lib/batalla-naval.js");
  MJ = await import("../lib/mensajes-de-juego.js");
  Plugin = (await import("../plugins/fun-naval.js")).default;
  Del = (await import("../plugins/fun-naval-del.js")).default;
  Rendirse = (await import("../plugins/fun-rendirse.js")).default;
  for (const chat of [G, G2]) F.initDataDB({ chat, sender: ANA, senderJid: "", pushName: "Ana" });
});
function limpiar() {
  for (const chat of [G, G2]) F.delNaval(chat);
  BN.olvidarSalas();
}
after(limpiar);

let ids = 0;
beforeEach(() => {
  limpiar();
  BN._dep.ahora = () => Date.now();
  BN._dep.azar = Math.random;
  avisos = [];
  BN._dep.avisar = async (chat, texto, mentions) => avisos.push({ chat, texto, mentions });
  F.updateChat(G, { games: 1 });
  client = clienteFalso();
  // Each message with an id of its own: the game marks are kept by id (lib/mensajes-de-juego.js).
  for (const metodo of ["sendMessage", "sendText"]) {
    const real = client[metodo];
    client[metodo] = async (...args) => {
      await real(...args);
      const id = `BN-${++ids}`;
      globalThis.enviados.at(-1).id = id;
      return { key: { id } };
    };
  }
});

const msg = (sender, text, chat = G, extra = {}) => ({ chat, sender, text, isGroup: true, react: async () => {}, ...extra });
const DUENO = { delnaval: () => Del, rendirse: () => Rendirse, rendirme: () => Rendirse };
// A command, as handle-message.js runs it once its checks pass, through the plugin that declares it.
const comando = (sender, command, { chat = G, isAdmin = false, text = "", datosChat = CHAT } = {}) =>
  (DUENO[command]?.() ?? Plugin).run(msg(sender, `.${command}${text ? ` ${text}` : ""}`, chat), { client, command, text, isAdmin, chat: datosChat });
// A plain message, as the hook sees it. Returns the message, to look at its marks.
async function escribir(sender, text, { chat = G, datosChat = CHAT, extra = {} } = {}) {
  const m = msg(sender, text, chat, extra);
  await Plugin.before(m, { client, chat: datosChat });
  return m;
}
const ultimo = () => globalThis.enviados.at(-1)?.msg;
const saldo = (quien, chat = G) => F.getSaldoCoins(chat, quien);
const sala = (chat = G) => BN.salas.get(chat);
const nombre = ([r, c]) => `${LETRAS[r]}${c + 1}`;
const celdasDe = (flota) => new Set(flota.flatMap((b) => b.celdas.map(([r, c]) => `${r},${c}`)));
// The fleet "quien" shoots at, and that sea's water cells, in order, to miss on purpose.
const flotaRival = (quien, chat = G) => sala(chat).flotas[quien === sala(chat).j1 ? 2 : 1];
function* aguas(flota) {
  const barcos = celdasDe(flota);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (!barcos.has(`${r},${c}`)) yield [r, c];
}
async function empezar({ chat = G, apuesta = "" } = {}) {
  await comando(ANA, "naval", { chat, text: apuesta });
  await comando(BETO, "naval", { chat, text: apuesta });
}
// Ana sinks Beto's whole fleet, Beto misses every time; the two take turns. Returns the last shot's cell.
async function ganaAna() {
  const objetivos = flotaRival(ANA).flatMap((b) => b.celdas);
  const agua = aguas(flotaRival(BETO));
  let casilla;
  for (const celda of objetivos) {
    casilla = nombre(celda);
    await escribir(ANA, casilla);
    if (sala()) await escribir(BETO, nombre(agua.next().value));
  }
  return casilla;
}

test("leerCasilla: B4, b 4 y 4B son la misma casilla; lo que no es una casilla, no", () => {
  for (const forma of ["B4", "b4", "b 4", " B4 ", "4B", "4 b"]) assert.deepEqual(BN.leerCasilla(forma), [1, 3], forma);
  assert.deepEqual(BN.leerCasilla("H8"), [7, 7]);
  assert.deepEqual(BN.leerCasilla("a1"), [0, 0]);
  for (const forma of ["", "B", "4", "B9", "I1", "B 44", "BB4", "hola", "B4 C5", "4"]) assert.equal(BN.leerCasilla(forma), null, JSON.stringify(forma));
  assert.equal(BN.nombreDeCasilla([1, 3]), "B4");
});

test("colocarFlota: cuatro barcos de 4, 3, 3 y 2, derechos, dentro del mar y sin tocarse ni en diagonal", () => {
  assert.deepEqual(BN.NAVAL.FLOTA.map(([, largo]) => largo), [4, 3, 3, 2]);
  for (let vuelta = 0; vuelta < 100; vuelta++) {
    const flota = BN.colocarFlota();
    assert.deepEqual(flota.map((b) => [b.nombre, b.articulo, b.largo, b.celdas.length, b.tocadas.length]), [["acorazado", "el", 4, 4, 0], ["crucero", "el", 3, 3, 0], ["submarino", "el", 3, 3, 0], ["lancha", "la", 2, 2, 0]]);
    const todas = celdasDe(flota);
    assert.equal(todas.size, 12, "ningún barco pisa a otro");
    for (const barco of flota) {
      const filas = new Set(barco.celdas.map(([r]) => r));
      const columnas = new Set(barco.celdas.map(([, c]) => c));
      assert.ok(filas.size === 1 || columnas.size === 1, "derecho");
      const [a, b] = [filas.size === 1 ? [...columnas] : [...filas]].map((xs) => [Math.min(...xs), Math.max(...xs)])[0];
      assert.equal(b - a + 1, barco.largo, "seguido");
      for (const [r, c] of barco.celdas) {
        assert.ok(r >= 0 && r < 8 && c >= 0 && c < 8, "adentro del mar");
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const vecina = `${r + dr},${c + dc}`;
            if (todas.has(vecina)) assert.ok(barco.celdas.some(([rr, cc]) => `${rr},${cc}` === vecina), `${barco.nombre} toca a otro barco en ${vecina}`);
          }
        }
      }
    }
  }
  // the dice decide where: the same dice, the same fleet
  assert.deepEqual(BN.colocarFlota(() => 0), BN.colocarFlota(() => 0));
  assert.notDeepEqual(BN.colocarFlota(() => 0), BN.colocarFlota(() => 0.999));
});

test("disparar: agua, tocado, hundido con el barco, la casilla repetida, y la flota entera", () => {
  const flota = () => [
    { nombre: "acorazado", articulo: "el", largo: 4, celdas: [[7, 0], [7, 1], [7, 2], [7, 3]], tocadas: [] },
    { nombre: "crucero", articulo: "el", largo: 3, celdas: [[0, 4], [1, 4], [2, 4]], tocadas: [] },
    { nombre: "submarino", articulo: "el", largo: 3, celdas: [[4, 6], [5, 6], [6, 6]], tocadas: [] },
    { nombre: "lancha", articulo: "la", largo: 2, celdas: [[0, 0], [0, 1]], tocadas: [] },
  ];
  const partida = { flotas: { 1: flota(), 2: flota() }, tiros: { 1: {}, 2: {} } };
  assert.deepEqual(BN.disparar(partida, 1, [5, 5]), { ok: true, resultado: "agua" });
  assert.equal(partida.tiros[1]["5,5"], "agua");
  const tocado = BN.disparar(partida, 1, [0, 0]);
  assert.deepEqual([tocado.ok, tocado.resultado, tocado.barco.nombre, partida.tiros[1]["0,0"]], [true, "tocado", "lancha", "tocado"]);
  assert.deepEqual(BN.disparar(partida, 1, [0, 0]), { ok: false, anterior: "tocado" });
  assert.deepEqual(BN.disparar(partida, 1, [5, 5]), { ok: false, anterior: "agua" });
  const hundido = BN.disparar(partida, 1, [0, 1]);
  assert.deepEqual([hundido.resultado, hundido.barco.nombre, hundido.ganaste], ["hundido", "lancha", false]);
  assert.deepEqual([partida.tiros[1]["0,0"], partida.tiros[1]["0,1"]], ["hundido", "hundido"], "el barco entero se ve hundido");
  assert.equal(BN.hundidos(partida, 1), 1);
  assert.equal(BN.hundidos(partida, 2), 0, "el otro no tiró");
  // player 2 shoots at player 1's sea, apart
  assert.equal(BN.disparar(partida, 2, [0, 0]).resultado, "tocado");
  assert.equal(partida.tiros[1]["0,0"], "hundido", "sin tocar el radar del otro");
  // the rest of the fleet: the last one wins
  const resto = partida.flotas[2].filter((b) => b.nombre !== "lancha").flatMap((b) => b.celdas);
  const resultados = resto.map((celda) => BN.disparar(partida, 1, celda));
  assert.deepEqual(resultados.map((r) => Boolean(r.ganaste)), [false, false, false, false, false, false, false, false, false, true]);
  assert.equal(BN.hundidos(partida, 1), 4);
});

test("dibujarRadar: las columnas arriba, la letra de cada fila y un emoji por tiro", () => {
  const radar = BN.dibujarRadar({ "0,2": "agua", "1,0": "tocado", "1,1": "hundido", "7,7": "agua" });
  assert.equal(
    radar,
    ["🧭1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣", "🇦🟦🟦🌊🟦🟦🟦🟦🟦", "🇧💥🚢🟦🟦🟦🟦🟦🟦", "🇨🟦🟦🟦🟦🟦🟦🟦🟦", "🇩🟦🟦🟦🟦🟦🟦🟦🟦", "🇪🟦🟦🟦🟦🟦🟦🟦🟦", "🇫🟦🟦🟦🟦🟦🟦🟦🟦", "🇬🟦🟦🟦🟦🟦🟦🟦🟦", "🇭🟦🟦🟦🟦🟦🟦🟦🌊"].join("\n"),
  );
  assert.equal(BN.LEYENDA, "🟦 sin tirar · 🌊 agua · 💥 tocado · 🚢 hundido");
});

test(".naval: el primero abre la mesa, el segundo se sienta, Claudia ubica las flotas y cada uno tira en su turno", async () => {
  await comando(ANA, "naval");
  assert.equal(ultimo().text, "🚢 *Batalla naval*\n@300000000000031 espera rival.\n\nPara jugar contra esa persona escribí .naval\nPara cancelar: .delnaval (se borra sola a los 10 minutos)");
  assert.deepEqual([sala().estado, sala().apuesta, F.getNaval(G).estado], ["ESPERANDO", 0, "ESPERANDO"], "guardada en la base");
  await comando(ANA, "naval");
  assert.equal(ultimo().text, "Ya estás esperando rival, esperá a que alguien se sume.");
  assert.deepEqual(BN.sentarse(G, ANA), { ok: false, error: "No hay ninguna mesa de batalla naval esperando rival." }, "ni por la lib se sienta contra sí misma");

  await comando(BETO, "naval");
  const inicio = ultimo();
  assert.match(inicio.text, /^🚢 \*Batalla naval\*\n🔵 @300000000000031 {2}vs {2}🔴 @300000000000032\n\nYa ubiqué las dos flotas a escondidas: acorazado \(4\), crucero \(3\), submarino \(3\), lancha \(2\)\. Los barcos no se tocan entre sí\. Cada turno es un tiro: escribí la casilla, por ejemplo B4\.\n🟦 sin tirar · 🌊 agua · 💥 tocado · 🚢 hundido\n\nTurno de @300000000000031 🔵\. Escribí la casilla \(A1 a H8\)\. Para abandonar: \.rendirse$/);
  assert.deepEqual(inicio.mentions, [ANA, BETO]);
  assert.deepEqual([sala().estado, sala().turno, sala().flotas[1].length, sala().flotas[2].length], ["JUGANDO", 1, 4, 4]);
  assert.notDeepEqual(sala().flotas[1], sala().flotas[2], "cada uno con su mar");
  assert.equal(MJ.juegoDelMensaje(globalThis.enviados.at(-1).id), "naval", "sus mensajes son del juego");

  // Beto's turn it isn't: nothing said, but the cell is the game's, so Claudia doesn't chat back
  let antes = globalThis.enviados.length;
  let m = await escribir(BETO, "A1");
  assert.deepEqual([globalThis.enviados.length, m.respuestaDeJuego, sala().turno], [antes, true, 1]);
  // not a cell: not the game's
  m = await escribir(ANA, "hola");
  assert.deepEqual([globalThis.enviados.length, m.respuestaDeJuego], [antes, undefined]);
  // someone else's cell: nothing
  m = await escribir(CARLA, "A1");
  assert.deepEqual([globalThis.enviados.length, m.respuestaDeJuego], [antes, undefined]);

  // Ana misses: her radar, and Beto's turn
  const agua = aguas(flotaRival(ANA)).next().value;
  await escribir(ANA, nombre(agua).toLowerCase());
  assert.match(ultimo().text, new RegExp(`^🌊 \\*${nombre(agua)}\\*: agua\\.\n\n\\*Radar de @300000000000031\\* 🔵 · hundió 0 de 4\n🧭1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣\n(🇦|🇧|🇨|🇩|🇪|🇫|🇬|🇭)`));
  assert.ok(ultimo().text.includes("🌊") && ultimo().text.endsWith("\n\nTurno de @300000000000032 🔴. Escribí la casilla (A1 a H8). Para abandonar: .rendirse"));
  assert.equal(ultimo().text.split("\n").length, 14, "el resultado, el radar con su título y el turno, con sus espacios");
  assert.deepEqual([sala().turno, F.getNaval(G).tiros[1][`${agua[0]},${agua[1]}`]], [2, "agua"], "guardado el tiro");
  // Ana again: not her turn anymore
  antes = globalThis.enviados.length;
  await escribir(ANA, "H8");
  assert.equal(globalThis.enviados.length, antes);

  // Beto hits
  const barco = flotaRival(BETO)[3];
  await escribir(BETO, nombre(barco.celdas[0]));
  assert.match(ultimo().text, new RegExp(`^💥 \\*${nombre(barco.celdas[0])}\\*: ¡tocado!\n\n\\*Radar de @300000000000032\\* 🔴 · hundió 0 de 4\n`));
  assert.ok(ultimo().text.includes("💥"));
  // Ana shoots where she already did: told, and still her turn
  await escribir(ANA, nombre(agua));
  assert.equal(ultimo().text, `Ya tiraste en ${nombre(agua)} (fue agua): elegí otra casilla.`);
  assert.equal(sala().turno, 1);
  // Beto sinks the lancha, after Ana's next miss
  const agua2 = [...aguas(flotaRival(ANA))][1];
  await escribir(ANA, nombre(agua2));
  await escribir(BETO, nombre(barco.celdas[1]));
  assert.match(ultimo().text, new RegExp(`^🚢 \\*${nombre(barco.celdas[1])}\\*: ¡hundido! Era la lancha de @300000000000031\\.\n\n\\*Radar de @300000000000032\\* 🔴 · hundió 1 de 4\n`));
  assert.equal((ultimo().text.match(/🚢/g) || []).length, 3, "las dos casillas de la lancha, más el emoji del aviso");

  // .naval during the game, from anyone: both radars and whose turn
  await comando(CARLA, "naval");
  assert.match(ultimo().text, /^🚢 \*Batalla naval\*\n🔵 @300000000000031 {2}vs {2}🔴 @300000000000032\n\n\*Radar de @300000000000031\* 🔵 · hundió 0 de 4\n🧭/);
  assert.match(ultimo().text, /\n\n\*Radar de @300000000000032\* 🔴 · hundió 1 de 4\n🧭[\s\S]*\n\n🟦 sin tirar · 🌊 agua · 💥 tocado · 🚢 hundido\nTurno de @300000000000031 🔵\. Escribí la casilla \(A1 a H8\)\. Para abandonar: \.rendirse$/);
  assert.equal(MJ.juegoDelMensaje(globalThis.enviados.at(-1).id), "naval");
});

test("batalla naval: gana el que hunde toda la flota del otro, y la mesa queda libre", async () => {
  await empezar();
  const ultimoBarco = flotaRival(ANA)[3];
  const casilla = await ganaAna();
  assert.equal(casilla, nombre(ultimoBarco.celdas[1]));
  assert.match(ultimo().text, new RegExp(`^🏆 \\*${casilla}\\*: ¡hundido! Era la lancha de @300000000000032 y no le queda ningún barco: @300000000000031 🔵 ganó la batalla\\. 🎉\n\n\\*Radar de @300000000000031\\* 🔵 · hundió 4 de 4\n🧭`));
  assert.ok(!/Turno de/.test(ultimo().text));
  assert.equal((ultimo().text.match(/🚢/g) || []).length, 12, "la flota entera hundida en el radar");
  assert.deepEqual([sala(), F.getNaval(G)], [undefined, null], "la mesa queda libre, también en la base");
  // and a new game can start
  await comando(BETO, "naval");
  assert.match(ultimo().text, /espera rival/);
});

test("batalla naval: un tiro que cita otro juego es de ese juego, y los de otro chat no se mezclan", async () => {
  await empezar();
  MJ.marcarMensajeDeJuego("TRIVIA-1", G, { juego: "trivia" });
  const antes = globalThis.enviados.length;
  const m = await escribir(ANA, "B4", { extra: { quoted: { id: "TRIVIA-1" } } });
  assert.deepEqual([globalThis.enviados.length, m.respuestaDeJuego, sala().turno], [antes, undefined, 1]);
  // the same people in another group: a table of its own
  await comando(ANA, "naval", { chat: G2 });
  assert.match(ultimo().text, /espera rival/);
  assert.deepEqual([sala(G2).estado, sala().estado], ["ESPERANDO", "JUGANDO"]);
  await escribir(ANA, "B4", { chat: G2 });
  assert.equal(sala().turno, 1, "un tiro en el otro grupo no es de esta partida");
});

test("batalla naval: .rendirse le da la partida al otro, y .delnaval la borra (los que juegan o un admin)", async () => {
  await comando(ANA, "rendirse");
  assert.equal(ultimo().text, "No estás jugando al 4 en línea ni a la batalla naval, ni tenés una mano de blackjack.");
  await comando(ANA, "naval");
  await comando(ANA, "rendirse");
  assert.equal(ultimo().text, "Todavía no empezó: si querés dejar la mesa, usá .delnaval.");
  await comando(BETO, "naval");
  await comando(CARLA, "rendirse");
  assert.equal(ultimo().text, "No estás jugando al 4 en línea ni a la batalla naval, ni tenés una mano de blackjack.");
  await comando(BETO, "rendirme");
  assert.deepEqual(ultimo(), { text: "🏳️ @300000000000032 se rindió. ¡Ganó @300000000000031! 🎉", mentions: [BETO, ANA] });
  assert.deepEqual([sala(), F.getNaval(G)], [undefined, null]);

  await comando(ANA, "delnaval");
  assert.equal(ultimo().text, "No hay ninguna partida de batalla naval en este grupo.");
  await empezar();
  await comando(CARLA, "delnaval");
  assert.equal(ultimo().text, "Solo los que juegan o un admin pueden cancelar la partida.");
  assert.equal(sala().estado, "JUGANDO");
  await comando(CARLA, "delnaval", { isAdmin: true });
  assert.equal(ultimo().text, "Partida de batalla naval cancelada.");
  assert.deepEqual([sala(), F.getNaval(G)], [undefined, null]);
  await empezar();
  await comando(BETO, "delnaval");
  assert.equal(ultimo().text, "Partida de batalla naval cancelada.");
  assert.equal(sala(), undefined);
});

test("batalla naval: con los juegos apagados no toma tiros, y una mesa sin jugadas se borra a los 10 minutos", async () => {
  await empezar();
  const antes = globalThis.enviados.length;
  const m = await escribir(ANA, "B4", { datosChat: { games: 0 } });
  assert.deepEqual([globalThis.enviados.length, m.respuestaDeJuego, sala().turno], [antes, undefined, 1]);
  await escribir(ANA, "B4");
  assert.equal(sala().turno, 2, "con los juegos prendidos, sí");

  let ahora = Date.now();
  BN._dep.ahora = () => ahora;
  await escribir(BETO, "C5");
  ahora += 9 * 60 * 1000;
  assert.equal(BN.salaVigente(G)?.estado, "JUGANDO", "a los 9 minutos sigue");
  ahora += 2 * 60 * 1000;
  assert.equal(BN.salaVigente(G), null, "a los 11, no");
  assert.deepEqual([sala(), F.getNaval(G), avisos], [undefined, null, []], "gratis, se borra sin avisar, también de la base");
  // a table waiting too, through the sweep
  await comando(ANA, "naval");
  ahora += 11 * 60 * 1000;
  BN.barrer();
  assert.deepEqual([sala(), F.getNaval(G), avisos], [undefined, null, []]);
});

test("batalla naval: la partida sigue después de un reinicio, con las mismas flotas, los tiros y el turno", async () => {
  let ahora = Date.now();
  BN._dep.ahora = () => ahora;
  await empezar();
  const agua = aguas(flotaRival(ANA)).next().value;
  await escribir(ANA, nombre(agua));
  const barco = flotaRival(BETO)[0];
  await escribir(BETO, nombre(barco.celdas[0]));
  const antes = JSON.parse(JSON.stringify(sala()));
  assert.deepEqual([antes.turno, antes.tiros[1][`${agua[0]},${agua[1]}`], antes.tiros[2][`${barco.celdas[0][0]},${barco.celdas[0][1]}`]], [1, "agua", "tocado"]);

  // the bot restarts nine minutes later: the memory is gone, the database isn't, and the clock starts over
  ahora += 9 * 60 * 1000;
  BN.olvidarSalas();
  assert.equal(BN.salas.size, 0);
  await comando(CARLA, "naval");
  assert.match(ultimo().text, /^🚢 \*Batalla naval\*\n🔵 @300000000000031 {2}vs {2}🔴 @300000000000032\n\n\*Radar de @300000000000031\* 🔵 · hundió 0 de 4\n/);
  assert.match(ultimo().text, /Turno de @300000000000031 🔵\./);
  const despues = sala();
  assert.deepEqual({ ...despues, ultimo: 0 }, { ...antes, ultimo: 0 }, "la misma partida");
  assert.equal(despues.ultimo, ahora, "el reloj arranca de nuevo");
  ahora += 9 * 60 * 1000;
  assert.equal(BN.salaVigente(G)?.estado, "JUGANDO", "nueve minutos después del reinicio no venció");
  // and it goes on: Ana hits the ship Beto's radar knows nothing about
  const objetivo = flotaRival(ANA)[3].celdas[0];
  await escribir(ANA, nombre(objetivo));
  assert.match(ultimo().text, new RegExp(`^💥 \\*${nombre(objetivo)}\\*: ¡tocado!`));
  assert.equal(sala().turno, 2);
  // Beto writes nothing for eleven minutes: free, the game is simply dropped
  ahora += 11 * 60 * 1000;
  BN.barrer();
  assert.deepEqual([sala(), F.getNaval(G), avisos], [undefined, null, []]);
});

test("batalla naval por UruCoins: quien abre paga, quien se sienta escribe el mismo monto y paga, y el que gana se lleva los dos", async () => {
  fijarSaldo(F, G, ANA, 500);
  fijarSaldo(F, G, BETO, 500);
  await comando(ANA, "naval", { text: "100" });
  assert.equal(ultimo().text, "🚢 *Batalla naval* por *100 UruCoins* cada uno\n@300000000000031 espera rival.\n\nPara jugar contra esa persona escribí .naval 100 (ponés 100, y el que gana se lleva 200).\nPara cancelar: .delnaval (si en 10 minutos no se sienta nadie, te los devuelvo)");
  assert.equal(saldo(ANA), 400, "a quien abre se le cobra al abrir");
  for (const text of ["", "50"]) {
    await comando(BETO, "naval", { text });
    assert.equal(ultimo().text, "❌ Esta mesa es por 100 UruCoins cada uno: para sentarte, escribí .naval 100", `«${text}»`);
  }
  assert.deepEqual([saldo(BETO), sala().estado], [500, "ESPERANDO"]);
  await comando(BETO, "naval", { text: "100" });
  assert.equal(saldo(BETO), 400);
  assert.match(ultimo().text, /^🚢 \*Batalla naval\*\n🔵 @300000000000031 {2}vs {2}🔴 @300000000000032\n💰 200 UruCoins en juego\n\n/);
  assert.equal(F.getNaval(G).apuesta, 100, "la apuesta viaja con la partida");
  await ganaAna();
  assert.match(ultimo().text, /ganó la batalla\. 🎉\n💰 Se lleva 200 UruCoins\.\n\n\*Radar de @300000000000031\*/);
  assert.deepEqual([saldo(ANA), saldo(BETO), sala()], [600, 400, undefined]);
  // a free table takes nobody with an amount
  await comando(ANA, "naval");
  await comando(BETO, "naval", { text: "100" });
  assert.equal(ultimo().text, "❌ Esta mesa es sin apuesta: para sentarte, escribí .naval solo.");
});

test("batalla naval por UruCoins: rendirse es perder, el escudo del que pierde devuelve, y .rendirse anda igual con el casino apagado", async () => {
  fijarSaldo(F, G, ANA, 500);
  fijarSaldo(F, G, BETO, 500);
  F.borrarItem(G, BETO, "escudo");
  F.agregarItem(G, BETO, "escudo");
  await empezar({ apuesta: "100" });
  await comando(BETO, "rendirse", { datosChat: { games: 1, casino: 0 } });
  assert.deepEqual(ultimo(), { text: "🏳️ @300000000000032 se rindió. ¡Ganó @300000000000031! 🎉\n💰 Se lleva 200 UruCoins.\n🛡️ @300000000000032 tenía escudo y recupera 25.", mentions: [BETO, ANA] });
  assert.deepEqual([saldo(ANA), saldo(BETO), sala(), F.getNaval(G)], [600, 425, undefined, null]);
});

test("batalla naval por UruCoins: el monto es un número entero, con mínimo y máximo, y a cada uno le tiene que alcanzar", async () => {
  fijarSaldo(F, G, ANA, 500);
  fijarSaldo(F, G, BETO, 20);
  await comando(ANA, "naval", { text: "mucho" });
  assert.equal(ultimo().text, "Para jugar por UruCoins: .naval 100 (mínimo 5, máximo 100 o el 20 % de tu saldo, lo que sea mayor). Sin nada, se juega por diversión.");
  await comando(ANA, "naval", { text: "2" });
  assert.equal(ultimo().text, "❌ La apuesta mínima es 5 UruCoins.");
  await comando(ANA, "naval", { text: "1.000" });
  assert.equal(ultimo().text, "❌ Tu apuesta máxima en la batalla naval es 100 UruCoins (100 o el 20 % de tu saldo, lo que sea mayor).");
  assert.deepEqual([sala(), saldo(ANA)], [undefined, 500]);
  await comando(ANA, "naval", { text: "100" });
  await comando(BETO, "naval", { text: "100" });
  assert.equal(ultimo().text, "❌ No te alcanza: tenés 20 UruCoins.");
  assert.equal(sala().estado, "ESPERANDO");
  // Beto, broke, can't even open one
  await comando(ANA, "delnaval");
  await comando(BETO, "naval", { text: "50" });
  assert.equal(ultimo().text, "❌ No te alcanza: tenés 20 UruCoins.");
  assert.equal(sala(), undefined);
});

test("batalla naval por UruCoins: a los 10 minutos sin rival se devuelve, y en juego pierde aquel a quien le tocaba", async () => {
  fijarSaldo(F, G, ANA, 500);
  fijarSaldo(F, G, BETO, 500);
  let ahora = Date.now();
  BN._dep.ahora = () => ahora;
  await comando(ANA, "naval", { text: "100" });
  ahora += 11 * 60 * 1000;
  BN.barrer();
  assert.deepEqual(avisos, [{ chat: G, texto: "⌛ Nadie se sentó a la mesa de batalla naval de @300000000000031 en 10 minutos: recupera sus 100 UruCoins.", mentions: [ANA] }]);
  assert.deepEqual([saldo(ANA), sala(), F.getNaval(G)], [500, undefined, null]);

  // the bot restarts with a table open: the sweep picks it up from the database, with its clock started over
  avisos = [];
  await comando(ANA, "naval", { text: "100" });
  BN.olvidarSalas();
  ahora += 11 * 60 * 1000;
  BN.barrer();
  assert.deepEqual([avisos, F.getNaval(G)?.estado, saldo(ANA)], [[], "ESPERANDO", 400], "recién arrancada, los diez minutos corren de nuevo");
  ahora += 11 * 60 * 1000;
  BN.barrer();
  assert.deepEqual([avisos.length, saldo(ANA), F.getNaval(G)], [1, 500, null]);

  avisos = [];
  await empezar({ apuesta: "100" });
  await escribir(ANA, "A1");
  ahora += 11 * 60 * 1000;
  // looked at by a message in the chat, not by the sweep: settled the same
  assert.equal(BN.salaVigente(G), null);
  assert.deepEqual(avisos, [{ chat: G, texto: "⌛ @300000000000032 no tiró en 10 minutos: ¡ganó @300000000000031! 🎉\n💰 Se lleva 200 UruCoins.", mentions: [ANA, BETO] }]);
  assert.deepEqual([saldo(ANA), saldo(BETO), F.getNaval(G)], [600, 400, null]);

  // with the games switched off in between, nobody could play: each one gets theirs back
  avisos = [];
  await empezar({ apuesta: "100" });
  F.updateChat(G, { games: 0 });
  ahora += 11 * 60 * 1000;
  BN.barrer();
  assert.deepEqual(avisos, [{ chat: G, texto: "⌛ La batalla naval de @300000000000031 y @300000000000032 quedó parada con los juegos apagados: cada uno recupera sus 100 UruCoins.", mentions: [ANA, BETO] }]);
  assert.deepEqual([saldo(ANA), saldo(BETO), F.getNaval(G)], [600, 400, null]);
});

test(".delnaval por UruCoins: esperando, devuelve; empezada, los que juegan no pueden y un admin les devuelve a los dos", async () => {
  fijarSaldo(F, G, ANA, 500);
  fijarSaldo(F, G, BETO, 500);
  await comando(ANA, "naval", { text: "100" });
  await comando(ANA, "delnaval");
  assert.deepEqual(ultimo(), { text: "Partida de batalla naval cancelada: @300000000000031 recupera sus 100 UruCoins.", mentions: [ANA] });
  assert.equal(saldo(ANA), 500);
  await empezar({ apuesta: "100" });
  await comando(ANA, "delnaval");
  assert.equal(ultimo().text, "Esta partida es por UruCoins: para dejarla, .rendirse (y gana el otro).");
  await comando(CARLA, "delnaval");
  assert.equal(ultimo().text, "Solo un admin puede cancelar una partida por UruCoins.");
  assert.equal(sala().estado, "JUGANDO");
  await comando(CARLA, "delnaval", { isAdmin: true });
  assert.deepEqual(ultimo(), { text: "Partida de batalla naval cancelada: @300000000000031 y @300000000000032 recuperan sus 100 UruCoins cada uno.", mentions: [ANA, BETO] });
  assert.deepEqual([saldo(ANA), saldo(BETO), sala(), F.getNaval(G)], [500, 500, undefined, null]);
});

test("batalla naval por UruCoins: .casino off y .monedas off frenan la apuesta, y no la partida gratis", async () => {
  fijarSaldo(F, G, ANA, 500);
  for (const datosChat of [
    { games: 1, casino: 0 },
    { games: 1, monedas: 0 },
  ]) {
    await comando(ANA, "naval", { text: "100", datosChat });
    assert.deepEqual([sala(), saldo(ANA)], [undefined, 500], JSON.stringify(datosChat));
    await comando(ANA, "naval", { datosChat });
    assert.match(ultimo().text, /espera rival/);
    await comando(ANA, "delnaval", { datosChat });
  }
});
