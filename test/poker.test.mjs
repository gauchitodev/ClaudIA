import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, fijarSaldo, mazoDe, esperar } from "./helpers.mjs";

// The poker table (lib/poker.js, plugins/coins-poker.js, coins-poker-mesa.js and coins-poker-cartas.js): opening and
// sitting, the hands with scripted decks, the betting rules, the pots, the clocks, leaving and closing, the cards in
// private, and the money: chips come from and go back to the balance only on the way in and out.
const G = "120363000000000091@g.us";
const G2 = "120363000000000092@g.us";
const ANA = "300000000000041@lid";
const BETO = "300000000000042@lid";
const CARLA = "300000000000043@lid";
const DANI = "300000000000044@lid";
const ELI = "300000000000045@lid";
const FEDE = "300000000000046@lid";
const GUS = "300000000000047@lid";
const TODOS = [ANA, BETO, CARLA, DANI, ELI, FEDE, GUS];
const CHAT = { games: 1, casino: 1, monedas: 1 };

let F, P, MJ, Poker, Mesa, Cartas, client, avisos;
before(async () => {
  ({ F } = await prepararBase("poker"));
  globalThis.txt = (await import("../lib/strings.js")).default;
  P = await import("../lib/poker.js");
  MJ = await import("../lib/mensajes-de-juego.js");
  Poker = (await import("../plugins/coins-poker.js")).default;
  Mesa = (await import("../plugins/coins-poker-mesa.js")).default;
  Cartas = (await import("../plugins/coins-poker-cartas.js")).default;
  for (const chat of [G, G2]) F.initDataDB({ chat, sender: ANA, senderJid: "", pushName: "Ana" });
  F.initDataDB({ chat: G, sender: BETO, senderJid: "", pushName: "Beto" });
});
after(() => P.olvidarMesas());

let ids = 0;
beforeEach(() => {
  P.olvidarMesas();
  Object.assign(P.POKER, { TURNO_MS: 600_000, ENTRE_MANOS_MS: 600_000, INACTIVIDAD_MS: 600_000 });
  P._dep.mazo = () => mazoDe("A♠", "K♠", "A♦", "K♦", "2♣", "7♥", "9♠", "J♦", "3♣");
  avisos = [];
  P._dep.avisar = async (chat, texto, mentions) => {
    avisos.push({ chat, texto, mentions });
    return { key: { id: `AV-${++ids}` } };
  };
  F.updateChat(G, { games: 1, casino: 1, monedas: 1, horarioJuegos: "" });
  client = clienteFalso();
  // Each message with an id of its own: the game marks are kept by id (lib/mensajes-de-juego.js).
  for (const metodo of ["sendMessage", "sendText"]) {
    const real = client[metodo];
    client[metodo] = async (...args) => {
      await real(...args);
      const id = `PK-${++ids}`;
      globalThis.enviados.at(-1).id = id;
      return { key: { id } };
    };
  }
  for (const u of TODOS) fijarSaldo(F, G, u, 500);
});

const msg = (sender, text, chat = G, extra = {}) => ({ chat, sender, senderJid: "", text, isGroup: chat.endsWith("@g.us"), react: async (emoji) => globalThis.enviados.push({ chat, msg: { react: emoji } }), ...extra });
const plugin = (command) => (P.CMD.poker.includes(command) ? Poker : P.CMD.cartas.includes(command) ? Cartas : Mesa);
// A command, as handle-message.js runs it once its checks pass. Returns what went out last.
async function comando(sender, texto, { chat = G, isAdmin = false, datosChat = CHAT, botSettings = {}, extra = {} } = {}) {
  const [command, ...args] = texto.split(/\s+/);
  await plugin(command).run(msg(sender, `.${texto}`, chat, extra), { client, command, args, text: args.join(" "), isAdmin, chat: datosChat, botSettings });
  return globalThis.enviados.at(-1)?.msg;
}
const ultimo = () => globalThis.enviados.at(-1)?.msg;
const saldo = (u, chat = G) => F.getSaldoCoins(chat, u);
const mesa = (chat = G) => P.mesaDe(chat);
const fichas = (u, chat = G) => mesa(chat)?.asientos.find((a) => a.id === u)?.fichas;
const mano = (chat = G) => mesa(chat)?.mano;
// Everything at the table plus everyone's balance: chips are never made nor lost.
const enCirculacion = (gente) => gente.reduce((suma, u) => suma + saldo(u) + (fichas(u) || 0), 0) + (mano() ? mano().jugadores.reduce((s, j) => s + j.aporteTotal, 0) : 0);
async function sentar(...gente) {
  for (const u of gente) await comando(u, "poker 100");
}

test(".poker: el primero abre con la entrada, los demás se sientan con la misma, y la mesa se muestra o explica", async () => {
  for (const entrada of ["49", "101"]) assert.equal((await comando(ANA, `poker ${entrada}`)).text, "❌ La entrada va de 50 a 100 UruCoins: .poker 100", entrada);
  assert.equal((await comando(ANA, "poker 100")).text, "🃏 *Mesa de póker* · entrada *100* UruCoins · ciegas 5/10\n@300000000000041 se sentó y espera gente (de 2 a 6).\nPara sentarte: .poker 100. Si en 10 minutos no se sienta nadie más, se cierra y cobra sus fichas.");
  assert.deepEqual([ultimo().mentions, saldo(ANA), mesa().estado, fichas(ANA)], [[ANA], 400, "ESPERANDO", 100]);
  assert.equal(MJ.juegoDelMensaje(globalThis.enviados.at(-1).id), "poker", "sus mensajes son del juego");
  assert.equal((await comando(ANA, "poker 100")).text, "❌ Ya estás en la mesa, con 100 fichas.");
  assert.equal((await comando(BETO, "poker 50")).text, "❌ Esta mesa es por 100 de entrada: para sentarte, .poker 100");
  fijarSaldo(F, G, CARLA, 20);
  assert.equal((await comando(CARLA, "poker 100")).text, "❌ No te alcanza: tenés 20 UruCoins.");
  assert.equal((await comando(BETO, "poker 100")).text, "🪑 @300000000000042 se sienta con 100. En la mesa: @300000000000041 (100), @300000000000042 (100). La mano arranca en unos segundos.");
  assert.deepEqual([ultimo().mentions, saldo(BETO)], [[ANA, BETO], 400]);
  assert.equal((await comando(ANA, "poker")).text, "🃏 *Mesa de póker* · entrada 100 · ciegas 5/10\nSentados: @300000000000041 (100), @300000000000042 (100). Para sentarte: .poker 100.");
  assert.equal((await comando(CARLA, "mesa")).text, (await comando(ANA, "poker")).text, ".mesa muestra lo mismo");
  // the table fills up at six
  fijarSaldo(F, G, CARLA, 500);
  await sentar(CARLA, DANI, ELI, FEDE);
  assert.equal(mesa().asientos.length, 6);
  assert.equal((await comando(GUS, "poker 100")).text, "❌ La mesa está llena (6 lugares).");
  assert.equal(saldo(GUS), 500);
  // another group: no table, the help; and a word that isn't an amount, the help too
  assert.match((await comando(ANA, "poker", { chat: G2 })).text, /^🃏 \*Póker \(Texas Hold'em\)\* — uso: \.poker <entrada>\n\nUna mesa por grupo, de 2 a 6\. El primero fija la entrada \(de 50 a 100 UruCoins\)/);
  assert.ok(ultimo().text.includes("▸ .paso · .pago · .subo 20 (subís 20 por encima de la apuesta) · .allin · .novoy") && ultimo().text.endsWith("el escudo acá no corre.\nEj: .poker 100"));
  assert.ok(!ultimo().text.includes("antiprivado"));
  assert.match((await comando(ANA, "poker", { chat: G2, botSettings: { antiPrivate: 1 } })).text, /\n\n⚠️ Ojo: los privados están cerrados \(\.antiprivado\), y las cartas van por privado: así no se puede jugar\.$/);
  assert.match((await comando(ANA, "poker mucho", { chat: G2 })).text, /^🃏 \*Póker \(Texas Hold'em\)\*/);
  assert.equal((await comando(ANA, "mesa", { chat: G2 })).text, "No hay mesa de póker en este grupo: .poker 100 abre una.");
  assert.equal((await comando(ANA, "paso", { chat: G2 })).text, "No hay mesa de póker en este grupo: .poker 100 abre una.");
  assert.equal((await comando(GUS, "paso")).text, "No estás en la mesa de póker.");
  assert.equal((await comando(ANA, "paso")).text, "Todavía no arrancó la mano.");
  assert.equal(P.ciegasDe(50).chica, 3);
  assert.deepEqual(P.ciegasDe(70), { grande: 7, chica: 4 });
});

test("mano a mano: el botón pone la ciega chica y habla primero antes del flop y último después; la ciega grande tiene su opción", async () => {
  await sentar(ANA, BETO);
  const inicio = P.empezarMano(mesa());
  assert.equal(inicio.texto, "🃏 *Mano 1* · botón @300000000000041 · ciegas @300000000000041 5 / @300000000000042 10 · pozo 15\nPedime tus cartas por privado con .cartas\n👉 @300000000000041: 5 para igualar · .pago · .subo 10 · .allin · .novoy (600 s)");
  assert.deepEqual([inicio.mentions, mesa().estado, mano().turno, fichas(ANA), fichas(BETO)], [[ANA, BETO], "MANO", 0, 95, 90]);
  assert.deepEqual(mano().jugadores.map((j) => j.cartas.map((c) => c.v + c.p)), [["A♠", "A♦"], ["K♠", "K♦"]], "una carta a cada uno, dos veces");
  // out of turn: a reaction, not a message
  const antes = globalThis.enviados.length;
  await comando(BETO, "pago");
  assert.deepEqual([globalThis.enviados.length - antes, ultimo()], [1, { react: "✋" }]);
  assert.equal((await comando(ANA, "paso")).text, "Hay 5 para igualar: .pago, .subo 10, .allin o .novoy.");
  assert.equal((await comando(ANA, "pago")).text, "✅ @300000000000041 paga 5 · pozo 20 · te toca @300000000000042 (puede pasar)");
  assert.deepEqual(ultimo().mentions, [ANA, BETO]);
  assert.equal(MJ.juegoDelMensaje(globalThis.enviados.at(-1).id), "poker", "las jugadas también son mensajes del juego");
  assert.equal((await comando(BETO, "subo 5")).text, "La subida mínima es 10 (.subo 10), o .allin.");
  assert.equal((await comando(BETO, "subo")).text, "¿Cuánto subís? .subo 10 (sube 10 por encima de la apuesta; es el mínimo ahora)");
  assert.equal((await comando(BETO, "subo 200")).text, "Tenés 90 fichas: para ir con todo, .allin.");
  assert.equal((await comando(BETO, "subo 10")).text, "⬆️ @300000000000042 sube 10 (la apuesta queda en 20) · pozo 30 · te toca @300000000000041 (10 para igualar)");
  assert.equal((await comando(ANA, "igualo")).text, "✅ @300000000000041 paga 10 · pozo 40\n🂠 *Flop:* 2♣ 7♥ 9♠ · te toca @300000000000042 (puede pasar)");
  assert.deepEqual([mano().calle, fichas(ANA), fichas(BETO)], ["flop", 80, 80]);
  assert.equal((await comando(BETO, "paso")).text, "👌 @300000000000042 pasa · pozo 40 · te toca @300000000000041 (puede pasar)");
  assert.equal((await comando(ANA, "subo 20")).text, "⬆️ @300000000000041 sube 20 (la apuesta queda en 20) · pozo 60 · te toca @300000000000042 (20 para igualar)");
  assert.equal((await comando(BETO, "voy")).text, "✅ @300000000000042 paga 20 · pozo 80\n🂠 *Turn:* 2♣ 7♥ 9♠ J♦ · te toca @300000000000042 (puede pasar)");
  await comando(BETO, "paso");
  assert.equal((await comando(ANA, "paso")).text, "👌 @300000000000041 pasa · pozo 80\n🂠 *River:* 2♣ 7♥ 9♠ J♦ 3♣ · te toca @300000000000042 (puede pasar)");
  await comando(BETO, "paso");
  assert.equal((await comando(ANA, "paso")).text, "👌 @300000000000041 pasa · pozo 80\n🏁 *Mesa:* 2♣ 7♥ 9♠ J♦ 3♣\n@300000000000041: A♠ A♦ · par de ases\n@300000000000042: K♠ K♦ · par de reyes\n🏆 @300000000000041 gana 80 con par de ases\n💰 @300000000000041 140 · @300000000000042 60");
  assert.deepEqual([mesa().estado, mano(), fichas(ANA), fichas(BETO), saldo(ANA), saldo(BETO)], ["ESPERANDO", null, 140, 60, 400, 400], "las fichas no tocan el saldo");
  assert.equal(enCirculacion([ANA, BETO]), 1000);
  // the next hand: the button moves, Beto posts the small blind and goes first
  const segunda = P.empezarMano(mesa());
  assert.match(segunda.texto, /^🃏 \*Mano 2\* · botón @300000000000042 · ciegas @300000000000042 5 \/ @300000000000041 10 · pozo 15\n/);
  assert.match(segunda.texto, /👉 @300000000000042: 5 para igualar/);
  await comando(BETO, "pago");
  assert.deepEqual([mano().turno, fichas(BETO)], [1, 50]);
  assert.equal(P.empezarMano(mesa()), null, "con una mano en juego no se reparte otra");
});

test("cuatro jugadores: subida mínima, un all-in corto no reabre la ronda, y sin nadie por apostar se va hasta el final", async () => {
  // deal order is Beto, Carla, Dani, Ana (Ana opened, so she's the button): Beto 7-7, Carla A-K, Dani 2-3, Ana Q-Q
  P._dep.mazo = () => mazoDe("7♠", "A♠", "2♥", "Q♣", "7♦", "K♠", "3♥", "Q♦", "7♥", "Q♠", "4♦", "9♣", "2♠");
  await sentar(ANA, BETO, CARLA, DANI);
  const inicio = P.empezarMano(mesa());
  assert.match(inicio.texto, /^🃏 \*Mano 1\* · botón @300000000000041 · ciegas @300000000000042 5 \/ @300000000000043 10 · pozo 15\n.*\n👉 @300000000000044: 10 para igualar/s);
  assert.equal((await comando(DANI, "subo 10")).text, "⬆️ @300000000000044 sube 10 (la apuesta queda en 20) · pozo 35 · te toca @300000000000041 (20 para igualar)");
  assert.equal((await comando(ANA, "subo 70")).text, "⬆️ @300000000000041 sube 70 (la apuesta queda en 90) · pozo 125 · te toca @300000000000042 (85 para igualar)");
  assert.equal((await comando(BETO, "allin")).text, "🔥 @300000000000042 va all-in con 95 · pozo 220 · te toca @300000000000043 (90 para igualar y quedar all-in, o .novoy)");
  assert.equal(mano().subidaIncompleta, true, "95 sobre 90 no llega a la subida mínima");
  assert.equal((await comando(CARLA, "pago")).text, "🔥 @300000000000043 paga 90 y queda all-in · pozo 310 · te toca @300000000000044 (80 para igualar y quedar all-in, o .novoy)");
  assert.equal((await comando(DANI, "novoy")).text, "🏳️ @300000000000044 no va · pozo 310 · te toca @300000000000041 (10 para igualar y quedar all-in, o .novoy)");
  assert.equal((await comando(ANA, "subo 5")).text, "Ya no se puede subir en esta ronda (un all-in corto no la reabre): .pago o .novoy.");
  assert.equal(enCirculacion([ANA, BETO, CARLA, DANI]), 2000);
  const fin = (await comando(ANA, "pago")).text;
  assert.equal(fin, "🔥 @300000000000041 paga 10 y queda all-in · pozo 320\n— no queda nadie por apostar, voy hasta el final\n🏁 *Mesa:* 7♥ Q♠ 4♦ 9♣ 2♠\n@300000000000042: 7♠ 7♦ · trío de sietes\n@300000000000043: A♠ K♠ · carta alta: as\n@300000000000041: Q♣ Q♦ · trío de damas\n🏆 @300000000000041 gana 320 con trío de damas\n💰 @300000000000041 320 · @300000000000042 se quedó sin fichas y deja la mesa (.poker 100 para volver) · @300000000000043 se quedó sin fichas y deja la mesa (.poker 100 para volver) · @300000000000044 80");
  assert.deepEqual(mesa().asientos.map((a) => [a.id, a.fichas]), [[ANA, 320], [DANI, 80]], "los que se quedaron sin fichas dejan la mesa");
  assert.equal(enCirculacion([ANA, BETO, CARLA, DANI]), 2000);
  // back in with a new buy-in, for the next hand
  assert.equal((await comando(BETO, "poker 100")).text, "🪑 @300000000000042 se sienta con 100. En la mesa: @300000000000041 (320), @300000000000044 (80), @300000000000042 (100). La mano arranca en unos segundos.");
  assert.equal(saldo(BETO), 300);
});

test("pozos laterales: cada uno gana hasta su nivel, lo no igualado vuelve, y si todos se retiran el último se lleva las ciegas", async () => {
  await sentar(ANA, BETO, CARLA);
  // different stacks, as after a few hands; deal order is Beto, Carla, Ana
  Object.assign(mesa().asientos[1], { fichas: 40 });
  Object.assign(mesa().asientos[2], { fichas: 70 });
  P._dep.mazo = () => mazoDe("A♠", "K♠", "2♣", "A♦", "K♦", "3♣", "5♥", "8♦", "10♠", "J♣", "9♥");
  P.empezarMano(mesa());
  assert.equal(mano().turno, 2, "con tres, habla primero el botón");
  assert.equal((await comando(ANA, "allin")).text, "🔥 @300000000000041 va all-in con 100 · pozo 115 · te toca @300000000000042 (35 para igualar y quedar all-in, o .novoy)");
  assert.equal((await comando(BETO, "allin")).text, "🔥 @300000000000042 va all-in con 35 · pozo 150 · te toca @300000000000043 (60 para igualar y quedar all-in, o .novoy)");
  const fin = (await comando(CARLA, "allin")).text;
  assert.ok(fin.startsWith("🔥 @300000000000043 va all-in con 60 · pozo 210\n— no queda nadie por apostar, voy hasta el final\n🏁 *Mesa:* 5♥ 8♦ 10♠ J♣ 9♥\n"), fin);
  assert.ok(fin.endsWith("\n🏆 Pozo principal (120): @300000000000042, par de ases · pozo lateral (60): @300000000000043, par de reyes\n@300000000000041 recupera 30 sin igualar\n💰 @300000000000041 30 · @300000000000042 120 · @300000000000043 60"), fin);
  assert.deepEqual([fichas(ANA), fichas(BETO), fichas(CARLA)], [30, 120, 60]);
  // next hand: the button moves to Beto; Beto and Carla fold and Ana takes the blinds without showing
  P.empezarMano(mesa());
  assert.match(P.textoMesa(mesa()).texto, /· mano 2 \(preflop\)\n@300000000000041 20 · 🔘 @300000000000042 120 · @300000000000043 55 · pozo 15\nMesa: todavía nada\n👉 Le toca a @300000000000042 \(10 para igualar\)$/);
  assert.equal((await comando(BETO, "novoy")).text, "🏳️ @300000000000042 no va · pozo 15 · te toca @300000000000043 (5 para igualar)");
  assert.equal((await comando(CARLA, "novoy")).text, "🏳️ @300000000000043 no va · pozo 15\n🏆 @300000000000041 se lleva 15: todos se retiraron.\n💰 @300000000000041 35 · @300000000000042 120 · @300000000000043 55");
  assert.equal(enCirculacion([ANA, BETO, CARLA]), 1410, "los 90 que saqué a mano, nada más");
});

test("el reloj: sin jugar a tiempo pasa o se retira, a la segunda seguida se levanta con sus fichas, y la mesa sola se cierra", async () => {
  await sentar(ANA, BETO);
  P.empezarMano(mesa());
  P.vencerTurno(mesa());
  assert.deepEqual(avisos.at(-1), { chat: G, texto: "⏳ @300000000000041 se quedó sin tiempo: no va · pozo 15\n🏆 @300000000000042 se lleva 15: todos se retiraron.\n💰 @300000000000041 95 · @300000000000042 105", mentions: [ANA, BETO] });
  await esperar(0);
  assert.equal(MJ.juegoDelMensaje(`AV-${ids}`), "poker", "lo que avisa sola también es del juego");
  assert.deepEqual([mesa().asientos[0].ausencias, mesa().estado], [1, "ESPERANDO"]);
  // next hand: Beto, now the button, calls; Ana's option runs out twice over (she checks when she can) and she stands
  // up
  P.empezarMano(mesa());
  await comando(BETO, "pago");
  P.vencerTurno(mesa());
  assert.match(avisos.at(-1).texto, /^⏳ @300000000000041 se quedó sin tiempo: pasa · se levanta al terminar la mano · pozo 20\n🂠 \*Flop:\* 2♣ 7♥ 9♠ · te toca @300000000000041 \(puede pasar\)$/);
  assert.equal(mesa().asientos[0].quiereIrse, true);
  // a stale timer does nothing: the turn already moved on
  const manoActual = mano();
  P.vencerTurno(mesa(), manoActual, 1);
  assert.equal(manoActual.turno, 0, "no era el turno de Beto");
  for (let i = 0; i < 3; i++) {
    P.vencerTurno(mesa()); // Ana
    if (mano()) await comando(BETO, "paso");
  }
  assert.equal(ultimo().text, "👌 @300000000000042 pasa · pozo 20\n🏁 *Mesa:* 2♣ 7♥ 9♠ J♦ 3♣\n@300000000000042: A♠ A♦ · par de ases\n@300000000000041: K♠ K♦ · par de reyes\n🏆 @300000000000042 gana 20 con par de ases\n💰 @300000000000042 115\n⏳ @300000000000041 no jugó dos turnos seguidos: se levanta con 85 UruCoins.");
  assert.deepEqual([mesa().asientos.map((a) => a.id), saldo(ANA), saldo(BETO)], [[BETO], 485, 400], "Ana cobró sus 85; las fichas de Beto siguen en la mesa");
  // alone, the table waits and then closes: Beto played, so it's a cash-out
  P.cerrarPorInactividad(mesa());
  assert.deepEqual(avisos.at(-1), { chat: G, texto: "⌛ La mesa de póker se cierra: 10 minutos sin dos para jugar. @300000000000042 cobra 115.", mentions: [BETO] });
  assert.deepEqual([mesa(), saldo(BETO)], [null, 515]);
  // a table nobody joined: a refund, not a play (counted against what the ledger held before, whatever ran first)
  const devoluciones = () => F.movimientosPorUsuarioYMotivo(G, { usuario: CARLA, desde: 0 }).find((m) => m.motivo === "casino_poker_devolucion") || { entradas: 0, n: 0 };
  const antesDeCarla = devoluciones();
  await comando(CARLA, "poker 100");
  P.cerrarPorInactividad(mesa());
  assert.deepEqual(avisos.at(-1), { chat: G, texto: "⌛ Nadie se sentó a la mesa de póker de @300000000000043 en 10 minutos: recupera sus 100 UruCoins.", mentions: [CARLA] });
  assert.equal(saldo(CARLA), 500);
  assert.deepEqual([devoluciones().entradas - antesDeCarla.entradas, devoluciones().n - antesDeCarla.n], [100, 1], "una devolución, no un cobro");
  // the real timers, shrunk: the turn runs out on its own, the next hand is dealt on its own
  Object.assign(P.POKER, { TURNO_MS: 30, ENTRE_MANOS_MS: 30 });
  await sentar(ANA, BETO);
  await esperar(120);
  assert.ok(avisos.some((a) => /^🃏 \*Mano 1\*/.test(a.texto)), "la mano arrancó sola");
  assert.ok(avisos.some((a) => /se quedó sin tiempo/.test(a.texto)), "y el turno venció solo");
  P.olvidarMesas();
});

test("irse y cerrar: .levantarme cobra entre manos o al terminar la mano; .delpoker es de los admins y devuelve todo", async () => {
  assert.equal((await comando(ANA, "levantarme")).text, "No hay mesa de póker en este grupo.");
  await sentar(ANA, BETO, CARLA);
  assert.equal((await comando(DANI, "levantarme")).text, "No estás en la mesa de póker.");
  assert.equal((await comando(CARLA, "levantarme")).text, "💰 @300000000000043 se levanta con 100 UruCoins.");
  assert.deepEqual([saldo(CARLA), mesa().asientos.length], [500, 2]);
  P.empezarMano(mesa());
  // Carla sits during the hand and leaves again: in the next hand, so paid right away
  await comando(CARLA, "poker 100");
  assert.equal((await comando(CARLA, "paso")).text, "Entrás en la próxima mano.");
  assert.equal((await comando(CARLA, "poker salir")).text, "💰 @300000000000043 se levanta con 100 UruCoins.");
  // Ana, to act, leaves: she folds now, Beto takes the pot, and she's paid at the end of the hand
  assert.equal((await comando(ANA, "levantarme")).text, "🏳️ @300000000000041 no va y se levanta al terminar la mano · pozo 15\n🏆 @300000000000042 se lleva 15: todos se retiraron.\n💰 @300000000000042 105\n💰 @300000000000041 se levanta con 95 UruCoins.");
  assert.deepEqual([saldo(ANA), mesa().asientos.map((a) => a.id)], [495, [BETO]]);
  // leaving when it isn't your turn, in a bigger hand: the hand goes on without you
  P.olvidarMesas(); // the chips at the table are simply dropped: balances set again
  for (const u of [ANA, BETO, CARLA]) fijarSaldo(F, G, u, 500);
  await sentar(ANA, BETO, CARLA);
  P.empezarMano(mesa());
  assert.equal(mano().turno, 2, "habla Ana, el botón");
  assert.equal((await comando(BETO, "levantarme")).text, "🏳️ @300000000000042 no va y se levanta al terminar la mano · pozo 15 · te toca @300000000000041 (10 para igualar)");
  assert.equal((await comando(ANA, "pago")).text, "✅ @300000000000041 paga 10 · pozo 25 · te toca @300000000000043 (puede pasar)");
  // the admin closes the table with the hand going: chips and stakes back to everyone
  assert.equal((await comando(ANA, "delpoker")).text, "Para irte de la mesa: .levantarme. Cerrarla entera es de los admins.");
  assert.equal((await comando(DANI, "poker cancelar", { isAdmin: true })).text, "Mesa de póker cerrada: @300000000000041 recupera 100, @300000000000042 recupera 100 y @300000000000043 recupera 100.");
  assert.deepEqual([mesa(), saldo(ANA), saldo(BETO), saldo(CARLA)], [null, 500, 500, 500]);
  assert.deepEqual(F.movimientosPorUsuarioYMotivo(G, { usuario: BETO, desde: 0 }).filter((m) => m.motivo === "casino_poker_devolucion").length, 1);
  assert.equal((await comando(DANI, "delpoker", { isAdmin: true })).text, "No hay mesa de póker en este grupo.");
  // all-in and leaving: the hand is played out for you
  await sentar(ANA, BETO);
  P.empezarMano(mesa());
  await comando(ANA, "allin");
  assert.match((await comando(BETO, "allin")).text, /voy hasta el final\n🏁 [\s\S]*🏆 @300000000000041 gana 200 con par de ases\n💰 @300000000000041 200 · @300000000000042 se quedó sin fichas y deja la mesa/);
  assert.deepEqual([mesa().asientos.map((a) => a.id), fichas(ANA), saldo(BETO), mesa().estado], [[ANA], 200, 400, "ESPERANDO"], "queda Ana sola, esperando");
});

test("al apagarse el bot, devolverPoker devuelve fichas y lo puesto en la mano, una sola vez", async () => {
  await sentar(ANA, BETO, CARLA);
  P.empezarMano(mesa());
  await comando(ANA, "subo 20");
  await comando(BETO, "pago");
  assert.deepEqual([fichas(ANA), fichas(BETO), fichas(CARLA)], [70, 70, 90]);
  fijarSaldo(F, G2, DANI, 500);
  await comando(DANI, "poker 100", { chat: G2 });
  assert.deepEqual(P.devolverPoker(), { apuestas: 4, monedas: 400 });
  assert.deepEqual([saldo(ANA), saldo(BETO), saldo(CARLA), saldo(DANI, G2), P.mesasPoker.size], [500, 500, 500, 500, 0]);
  assert.deepEqual(P.devolverPoker(), { apuestas: 0, monedas: 0 });
});

test("con el casino cerrado no se reparte otra mano y la mesa avisa una vez; la mano empezada se termina igual", async () => {
  await sentar(ANA, BETO);
  P.empezarMano(mesa());
  F.updateChat(G, { casino: 0 });
  assert.equal((await comando(ANA, "pago")).text, "✅ @300000000000041 paga 5 · pozo 20 · te toca @300000000000042 (puede pasar)");
  await comando(BETO, "novoy");
  assert.deepEqual([mesa().estado, fichas(ANA)], ["ESPERANDO", 110]);
  assert.deepEqual(P.empezarMano(mesa()), { texto: "⏸️ El casino está cerrado acá: la mesa espera. Si en 10 minutos no se puede jugar, se cierra y cada uno cobra sus fichas.", mentions: [] });
  assert.equal(P.empezarMano(mesa()), null, "lo dice una vez");
  F.updateChat(G, { casino: 1, games: 0 });
  assert.equal(P.empezarMano(mesa()), null, "con los juegos apagados tampoco");
  F.updateChat(G, { games: 1, juegosApagados: '["poker"]' });
  assert.equal(P.empezarMano(mesa()), null, "con el póker apagado con .juego, tampoco");
  F.updateChat(G, { juegosApagados: "[]" });
  assert.match(P.empezarMano(mesa()).texto, /^🃏 \*Mano 2\*/);
});

test(".cartas: en el grupo no, por privado sí: las tuyas, por tu LID o por tu número, en cada mesa en que estés", async () => {
  assert.equal((await comando(ANA, "cartas")).text, "Las cartas te las digo por privado: escribime .cartas a mí, no acá.");
  const privado = (quien, extra = {}) => comando(quien, "cartas", { chat: quien, extra });
  assert.equal((await privado(ANA)).text, "No estás sentado en ninguna mesa de póker. Se juega en un grupo: .poker 100 abre una mesa o te sienta en la que haya.");
  const NUMERO = "59891000042@s.whatsapp.net";
  await comando(ANA, "poker 100");
  await comando(BETO, "poker 100", { extra: { senderJid: NUMERO } });
  assert.match((await privado(ANA)).text, /^🃏 \*Póker en 120363000000000091@g\.us\*\nEstás sentado con 100 fichas, pero todavía no repartí: cuando arranque la mano, pedímelas de nuevo con \.cartas\.$/);
  P.empezarMano(mesa());
  assert.equal((await privado(ANA)).text, "🃏 *Póker en 120363000000000091@g.us* · mano 1\nTus cartas: *A♠ A♦*\nMesa: todavía nada · pozo 15 · tus fichas 95\n👉 Te toca a vos: 5 para igualar");
  const deBeto = (await privado(NUMERO)).text;
  assert.match(deBeto, /\nTus cartas: \*K♠ K♦\*\nMesa: todavía nada · pozo 15 · tus fichas 90\nLe toca a .+$/, "por el número con que se sentó");
  assert.ok(!deBeto.includes("A♠") && !(await privado(ANA)).text.includes("K♠"), "nunca las del otro");
  await comando(CARLA, "poker 100");
  assert.match((await privado(CARLA)).text, /\nHay una mano en juego, pero vos entrás en la próxima\.$/);
  await comando(ANA, "pago");
  await comando(BETO, "allin");
  assert.match((await privado(BETO)).text, /\nTus cartas: \*K♠ K♦\*\nMesa: todavía nada · pozo 110 · tus fichas 0\nFuiste all-in: queda ver la mesa\.$/);
  await comando(ANA, "novoy");
  assert.equal(mesa().estado, "ESPERANDO");
  P.empezarMano(mesa());
  const turno = mano().jugadores[mano().turno].id;
  await comando(turno, "novoy");
  assert.match((await privado(turno)).text, /\nYa te retiraste de esta mano \(tenías [^)]+\)\.$/);
  // seated in two groups at once: both, each with its group
  fijarSaldo(F, G2, ANA, 500);
  await comando(ANA, "poker 100", { chat: G2 });
  const dos = (await privado(ANA)).text;
  assert.ok(dos.includes("🃏 *Póker en 120363000000000091@g.us*") && dos.includes("\n\n🃏 *Póker en 120363000000000092@g.us*\nEstás sentado con 100 fichas"), dos);
});

test("los plugins llevan las marcas que corresponden: la entrada es casino, las jugadas y las cartas no", () => {
  assert.deepEqual([Poker.casino, Poker.economia, Poker.juego, Poker.onlyGroup], [true, true, true, true]);
  assert.deepEqual([Mesa.casino, Mesa.economia, Mesa.juego, Mesa.onlyGroup], [undefined, undefined, true, true]);
  assert.deepEqual([Cartas.casino, Cartas.juego, Cartas.onlyGroup], [undefined, undefined, undefined]);
  assert.deepEqual(Poker.cmd, ["poker"]); // .póker reaches it too: the parser takes the accent out
  assert.deepEqual(Mesa.cmd, ["paso", "pago", "igualo", "voy", "subo", "allin", "novoy", "levantarme", "mesa", "delpoker"]);
  assert.deepEqual(Cartas.cmd, ["cartas"]);
});
