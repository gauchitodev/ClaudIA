import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase } from "./helpers.mjs";
import { estadoDe } from "../lib/estado-de-plugins.js";

// Claudia's turn in a chat (lib/turnos-de-claudia.js): one answer every 20 seconds per chat, as before, but what's said
// to her in between waits for her turn instead of being dropped; a bare call ("Claudia") waits a few seconds for its
// question, and the next message of whoever called her that way is for her too. The clock is passed in.

let T;
const ritmoDeClaudia = estadoDe("ia-ultima-respuesta", () => new Map()); // when she last started to talk, per chat
const S = 1000;
const C = "turnos@g.us";
const msj = (persona, solo = false) => ({ persona, solo });

before(async () => {
  await prepararBase("turnos-de-claudia");
  T = await import("../lib/turnos-de-claudia.js");
});
beforeEach(() => {
  T.reiniciarTurnos();
  ritmoDeClaudia.clear();
});

test("una llamada sola es su nombre o su mención, con un saludo a lo sumo", () => {
  for (const t of ["Claudia", "claudia!!", "¿Claudia?", "hola Claudia", "Buenas tardes, bot", "CLAUDIA 😂", "claudia claudia", "che tabbot", "Clau", "clau!!", "hola Clau", "¿Clau?", "Clauuu", "CLAUDIAAA!!", "hola claudiaa"]) assert.equal(T.esLlamadaSola(t), true, t);
  assert.equal(T.esLlamadaSola("@200000000000001", ["200000000000001"]), true, "su mención");
  assert.equal(T.esLlamadaSola("hola @200000000000001 ", ["200000000000001"]), true);
  for (const t of ["Claudia, ¿qué hora es?", "claudia te presento a mi perro", "bot de cuarta", "jaja", "clau, ¿qué hora es?", "clauuu, ¿qué hora es?", "hola Claudio"]) assert.equal(T.esLlamadaSola(t), false, t);
  assert.equal(T.esLlamadaSola("@200000000000001 ¿qué opinás?", ["200000000000001"]), false);
  assert.equal(T.esLlamadaSola("claudia @111", ["200000000000001"]), false, "la mención de otro dice algo");
});

test("la pausa: lo que le dicen en los 20 segundos espera su turno, y se contesta junto", () => {
  const t0 = 1_000_000;
  assert.equal(T.anotar(C, msj("ana"), t0), t0, "sin pausa, ya");
  assert.deepEqual(
    T.tomarTanda(C, t0).map((e) => e.persona),
    ["ana"],
  );
  assert.equal(ritmoDeClaudia.get(C), t0, "su turno empieza, y la pausa cuenta desde ahí");
  assert.equal(T.anotar(C, msj("beto"), t0 + 5 * S), t0 + 20 * S);
  assert.equal(T.anotar(C, msj("carla"), t0 + 8 * S), t0 + 20 * S);
  assert.equal(T.tomarTanda(C, t0 + 19 * S), null, "todavía no");
  assert.deepEqual(
    T.tomarTanda(C, t0 + 20 * S).map((e) => [e.persona, e.en]),
    [
      ["beto", t0 + 5 * S],
      ["carla", t0 + 8 * S],
    ],
  );
  assert.equal(T.cuandoContesta(C, t0 + 21 * S), null, "no queda nada esperando");
  // She talked in between on her own (a glance, a sticker): what waits, waits for the pause again.
  assert.equal(T.anotar(C, msj("dani"), t0 + 30 * S), t0 + 40 * S);
  ritmoDeClaudia.set(C, t0 + 35 * S);
  assert.equal(T.tomarTanda(C, t0 + 40 * S), null);
  assert.equal(T.cuandoContesta(C, t0 + 40 * S), t0 + 55 * S);
  // Each chat has its own.
  assert.equal(T.anotar("otro@g.us", msj("eva"), t0 + 41 * S), t0 + 41 * S);
});

test("una llamada sola espera su pregunta unos segundos, y lo que sigue de quien la llamó es para ella", () => {
  const t0 = 2_000_000;
  assert.equal(T.anotar(C, msj("ana", true), t0), t0 + 8 * S, "espera la pregunta");
  assert.equal(T.sigueLaLlamada(C, "ana", t0 + 3 * S), true);
  assert.equal(T.sigueLaLlamada(C, "beto", t0 + 3 * S), false, "lo de otro, no");
  assert.equal(T.anotar(C, msj("ana"), t0 + 3 * S), t0 + 3 * S, "llegó la pregunta: ya");
  assert.equal(T.sigueLaLlamada(C, "ana", t0 + 4 * S), false, "y lo que sigue ya no es para ella");
  assert.deepEqual(
    T.tomarTanda(C, t0 + 3 * S).map((e) => e.solo),
    [true, false],
  );
  // With no question, the call alone; and the caller's next message is for her for a minute, after the answer too.
  const t1 = t0 + 100 * S;
  assert.equal(T.anotar(C, msj("ana", true), t1), t1 + 8 * S);
  assert.ok(T.tomarTanda(C, t1 + 8 * S));
  assert.equal(T.sigueLaLlamada(C, "ana", t1 + 60 * S), true);
  assert.equal(T.sigueLaLlamada(C, "ana", t1 + 61 * S), false, "pasado el minuto, no");
});

test("si la siguen llamando, la espera no pasa de 20 segundos desde la primera, y la tanda guarda las últimas diez", () => {
  const t0 = 3_000_000;
  assert.equal(T.anotar(C, msj("ana", true), t0), t0 + 8 * S);
  assert.equal(T.anotar(C, msj("ana", true), t0 + 6 * S), t0 + 14 * S);
  assert.equal(T.anotar(C, msj("ana", true), t0 + 12 * S), t0 + 20 * S);
  assert.equal(T.anotar(C, msj("ana", true), t0 + 18 * S), t0 + 20 * S, "no más de 20 desde la primera");
  assert.equal(T.tomarTanda(C, t0 + 20 * S).length, 4);
  for (let i = 0; i < 15; i++) T.anotar(C, msj(`p${i}`), t0 + 30 * S + i);
  assert.deepEqual(
    T.tomarTanda(C, t0 + 40 * S).map((e) => e.persona),
    Array.from({ length: 10 }, (_, i) => `p${i + 5}`),
  );
});

// A turn isn't always an answer (plugins/_auto-ia.js): named in passing she may send nothing, or just a reaction.
test("un turno en el que no dijo nada se devuelve: la pausa no cuenta desde un mensaje que no mandó", () => {
  // She had last talked a while ago: the turn she gives back leaves her pace where it was.
  ritmoDeClaudia.set(C, 1000 * S);
  T.anotar(C, msj("ana"), 1100 * S);
  assert.equal(T.tomarTanda(C, 1100 * S).length, 1);
  assert.equal(ritmoDeClaudia.get(C), 1100 * S);
  assert.equal(T.soltarTurno(C), true);
  assert.equal(ritmoDeClaudia.get(C), 1000 * S);
  assert.equal(T.anotar(C, msj("beto"), 1101 * S), 1101 * S, "a quien le habla después no lo hace esperar");
  assert.equal(T.soltarTurno(C), false, "devuelto una vez, no hay más que devolver");

  // She had never talked there: back to that.
  T.reiniciarTurnos();
  ritmoDeClaudia.clear();
  T.anotar(C, msj("ana"), 2000 * S);
  T.tomarTanda(C, 2000 * S);
  assert.equal(T.soltarTurno(C), true);
  assert.equal(ritmoDeClaudia.has(C), false);

  // If she said something on her own meanwhile (a glance, a sticker), that one counts: nothing is given back.
  T.anotar(C, msj("ana"), 3000 * S);
  T.tomarTanda(C, 3000 * S);
  ritmoDeClaudia.set(C, 3002 * S);
  assert.equal(T.soltarTurno(C), false);
  assert.equal(ritmoDeClaudia.get(C), 3002 * S);
  assert.equal(T.soltarTurno("otro@g.us"), false, "ni de un chat donde no tomó ninguno");
});

test("insistir: a quien dejó pasar, lo que le diga en los dos minutos siguientes lleva palabras", () => {
  const [LID, NUMERO] = ["300000000000021@lid", "59899000021@s.whatsapp.net"];
  assert.equal(T.insiste(C, [LID, NUMERO], 1000 * S), false);
  T.anotarSilencio(C, [LID, NUMERO], 1000 * S);
  assert.equal(T.insiste(C, [LID], 1030 * S), true);
  assert.equal(T.insiste(C, [NUMERO, undefined], 1030 * S), true, "por cualquiera de sus dos ids: el mensaje siguiente puede traer uno solo");
  assert.equal(T.insiste(C, ["300000000000022@lid"], 1030 * S), false, "otra persona, no");
  assert.equal(T.insiste("otro@g.us", [LID], 1030 * S), false, "ni en otro grupo");
  assert.equal(T.insiste(C, [LID], 1000 * S + T.TURNOS.INSISTE_MS), true);
  assert.equal(T.insiste(C, [LID], 1000 * S + T.TURNOS.INSISTE_MS + 1), false, "pasado el rato, es un mensaje como cualquier otro");
  // Answered with words, it's over at once, by whichever id the answered message came with: left under the other
  // one, the next message that brought it got words again for no reason.
  T.anotarSilencio(C, [LID, NUMERO], 2000 * S);
  T.olvidarSilencio(C, [NUMERO, null]);
  assert.equal(T.insiste(C, [LID], 2001 * S), false);
  assert.equal(T.insiste(C, [LID, NUMERO], 2001 * S), false);
  assert.equal(T.insiste(C, [], 2001 * S), false);
  assert.equal(T.insiste(C, undefined, 2001 * S), false);
  // Somebody else's stays, and theirs goes whole however many times it was noted.
  T.anotarSilencio(C, [LID], 2010 * S);
  T.anotarSilencio(C, ["300000000000022@lid"], 2010 * S);
  T.anotarSilencio(C, [LID, NUMERO], 2020 * S);
  T.olvidarSilencio(C, [LID]);
  assert.deepEqual([T.insiste(C, [NUMERO], 2021 * S), T.insiste(C, ["300000000000022@lid"], 2021 * S)], [false, true]);
  T.olvidarSilencio(C, ["300000000000022@lid"]);
  T.olvidarSilencio(C, ["nadie@lid"]);
  assert.equal(T.insiste(C, ["300000000000022@lid"], 2021 * S), false);

  // One noted later doesn't take the ones still running with it.
  T.anotarSilencio(C, ["viejo@lid"], 3000 * S);
  T.anotarSilencio(C, ["medio@lid"], 3060 * S);
  T.anotarSilencio(C, ["nuevo@lid"], 3000 * S + T.TURNOS.INSISTE_MS + 1);
  assert.deepEqual(["viejo@lid", "medio@lid", "nuevo@lid"].map((id) => T.insiste(C, [id], 3000 * S + T.TURNOS.INSISTE_MS + 2)), [false, true, true]);
});
