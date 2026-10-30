import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, clienteFalso } from "./helpers.mjs";

// What the bot owes for later (lib/pendientes.js): reminders, lightning trivias, download retries, markets. Every
// minute it runs whatever is due. A send that failed once used to leave the item as "error" for good: a reminder the
// person had been promised never went out.

let F, P;
before(async () => {
  ({ F } = await prepararBase("pendientes"));
  P = await import("../lib/pendientes.js");
});
beforeEach(() => {
  db.exec("DELETE FROM pendientes");
  globalThis.botConectado = true;
});

const fila = (id) => db.prepare("SELECT * FROM pendientes WHERE id = ?").get(id);
const vencer = (id) => db.prepare("UPDATE pendientes SET ejecutar_en = ? WHERE id = ?").run(Date.now() - 1000, id);
const recordatorio = (texto, cuando = Date.now() - 1000) => Number(F.crearPendiente(G, "111@lid", "recordatorio", { texto }, cuando));

// A client whose sends fail the first "fallas" times, the way they do over a socket that just died.
function clienteQueFalla(fallas) {
  const client = clienteFalso();
  const enviar = client.sendMessage;
  client.sendMessage = async (...args) => {
    if (fallas-- > 0) throw new Error("Connection Closed");
    return enviar(...args);
  };
  return client;
}

// The failures get logged; here they're expected.
async function callado(fn) {
  const real = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = real;
  }
}

test("pendientes: un recordatorio que no se pudo mandar se reintenta más tarde, en vez de perderse", async () => {
  const id = recordatorio("pagar la luz");
  const client = clienteQueFalla(1);
  await callado(() => P.procesarPendientes(client));
  assert.equal(fila(id).estado, "pendiente", "quedaba en 'error' para siempre");
  assert.equal(fila(id).intentos, 1);
  assert.ok(fila(id).ejecutar_en > Date.now(), "espera un rato antes de reintentar");

  vencer(id);
  await P.procesarPendientes(client);
  assert.equal(fila(id).estado, "hecho");
  assert.match(globalThis.enviados.at(-1).msg.text, /me pediste que te recuerde: \*pagar la luz\*/);
});

test("pendientes: las esperas entre intentos se duplican, y después de varios fallos se deja", async () => {
  const id = recordatorio("algo");
  const client = clienteQueFalla(Infinity);
  const esperas = [];
  for (let i = 0; i < P.PENDIENTES.INTENTOS_MAX; i++) {
    vencer(id);
    const antes = Date.now();
    await callado(() => P.procesarPendientes(client));
    if (fila(id).estado === "pendiente") esperas.push(Math.round((fila(id).ejecutar_en - antes) / 60000));
  }
  assert.deepEqual(esperas, [1, 2, 4, 8, 16], "minutos");
  assert.equal(fila(id).estado, "error");
});

test("pendientes: si se corta la conexión a mitad de la pasada, lo que falta vuelve a esperar sin gastar intentos", async () => {
  const primero = recordatorio("uno", Date.now() - 2000);
  const segundo = recordatorio("dos");
  const client = clienteFalso();
  const enviar = client.sendMessage;
  client.sendMessage = async (...args) => {
    const r = await enviar(...args);
    globalThis.botConectado = false; // the connection drops right after the first send
    return r;
  };
  await P.procesarPendientes(client);
  assert.equal(fila(primero).estado, "hecho");
  assert.equal(fila(segundo).estado, "pendiente", "salía por un socket muerto y quedaba en 'error'");
  assert.equal(fila(segundo).intentos, 0, "no cuenta como intento");
  assert.ok(fila(segundo).ejecutar_en <= Date.now(), "sale apenas vuelva la conexión");
});

test("trivia relámpago agendada: no sale fuera de su horario ni con la función apagada, y con la economía apagada no paga", async () => {
  const R = await import("../lib/trivia-relampago.js");
  const Tr = await import("../lib/trivia.js");
  F.initDataDB({ chat: G, sender: "111@lid", senderJid: "" });
  const aLas = (hora) => {
    const d = new Date();
    d.setHours(hora, 0, 0, 0);
    return d;
  };
  const client = clienteFalso();

  // .modo compraventa switched it off after it was scheduled in the morning.
  F.updateChat(G, { triviaRelampago: 0 });
  await R.lanzarTriviaRelampago(client, G, aLas(12));
  assert.equal(globalThis.enviados.length, 0, "salía con la función apagada");

  // The bot was down at the scheduled time and reconnected at night.
  F.updateChat(G, { triviaRelampago: 1 });
  await R.lanzarTriviaRelampago(client, G, aLas(2));
  assert.equal(globalThis.enviados.length, 0, "salía a las 2 de la mañana");

  // With the economy off it's played for nothing, like .trivia.
  F.updateChat(G, { monedas: 0 });
  try {
    await R.lanzarTriviaRelampago(client, G, aLas(12));
    assert.match(globalThis.enviados.at(-1).msg.text, /^⚡ \*TRIVIA RELÁMPAGO\*\n\n/, "sin anunciar premio");
    const ronda = Tr.rondaDe(G);
    const r = Tr.responderTrivia({ chat: G, sender: "111@lid", text: ronda.pregunta.correcta, quoted: { id: ronda.mensajeId } });
    assert.equal(r.reaccion, "✅");
    assert.doesNotMatch(r.texto, /UruCoins/);
    assert.equal(F.getSaldoCoins(G, "111@lid"), 0, "pagaba con la economía apagada");
  } finally {
    F.updateChat(G, { monedas: 1 });
    Tr.cerrarRonda(G);
  }
});
