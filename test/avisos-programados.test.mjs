import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G } from "./helpers.mjs";

// The scheduled announcements (lib/tareas-programadas.js, every 5 minutes) are marked as done before they go out, so
// two passes can't both send one. When the send failed the mark stayed, and the announcement was lost: the birthday
// greeting, the day's question, the weekly recap, the marketplace's "still on?" (whose post was then taken down "for
// lack of an answer"). Now a failed send is tried again on the next pass, a few times.

let F, Cu, P, R, Cv, A, Av;
const DIA = 24 * 3600e3;
const errorReal = console.error;
before(async () => {
  ({ F } = await prepararBase("avisos-programados"));
  Cu = await import("../lib/cumpleanos.js");
  P = await import("../lib/pregunta-dia.js");
  R = await import("../lib/recap.js");
  Cv = await import("../lib/compraventa.js");
  A = await import("../lib/actividad.js");
  Av = await import("../lib/avisos-programados.js");
  console.error = () => {}; // the failures are logged; here they're expected
  F.initDataDB({ chat: G, sender: "u@lid", senderJid: "", pushName: "U" });
  // Any hour and today's weekday, so the tests don't depend on the clock.
  Cu.CUMPLE.HORA_SALUDO = 0;
  A.ACTIVIDAD.HORA_PREGUNTA = 0;
  A.ACTIVIDAD.HORA_RECAP = 0;
  A.ACTIVIDAD.DIA_RECAP = new Date().getDay();
});
after(() => {
  console.error = errorReal;
});

// The next "n" sends fail, the way they do over a socket that just died. "intentos" keeps the texts they tried.
function fallarEnvios(n) {
  const client = globalThis.client;
  const real = client.sendMessage;
  const intentos = [];
  client.sendMessage = async (chat, contenido, ...resto) => {
    if (n-- > 0) {
      intentos.push(contenido?.text || "");
      throw new Error("Connection Closed");
    }
    return real(chat, contenido, ...resto);
  };
  return { intentos, restaurar: () => (client.sendMessage = real) };
}
const enviadosCon = (regex) => globalThis.enviados.filter((e) => regex.test(e.msg?.text || "")).length;
const hoy = new Date();
const cumpleDeHoy = `${hoy.getDate()}/${hoy.getMonth() + 1}`;

test("cumpleaños: si el saludo no se pudo mandar, sale en la pasada siguiente, y una sola vez", async () => {
  Cu.registrarCumple(G, "598@lid", cumpleDeHoy);
  const falla = fallarEnvios(1);
  await Cu.chequearCumpleanos();
  falla.restaurar();
  assert.equal(enviadosCon(/@598/), 0);
  await Cu.chequearCumpleanos();
  await Cu.chequearCumpleanos();
  assert.equal(enviadosCon(/@598/), 1, "el saludo se perdía");
});

test("cumpleaños: uno que no puede salir se deja después de unos intentos, en vez de volver cada 5 minutos", async () => {
  Cu.registrarCumple(G, "599@lid", cumpleDeHoy);
  const falla = fallarEnvios(Infinity);
  for (let i = 0; i < Av.AVISOS.INTENTOS_MAX + 3; i++) await Cu.chequearCumpleanos();
  falla.restaurar();
  assert.equal(falla.intentos.filter((t) => t.includes("@599")).length, Av.AVISOS.INTENTOS_MAX);
  await Cu.chequearCumpleanos();
  assert.equal(enviadosCon(/@599/), 0);
});

test("pregunta del día: si no se pudo mandar, se reintenta en la pasada siguiente", async () => {
  F.updateChat(G, { preguntaDia: 1 });
  try {
    const falla = fallarEnvios(1);
    await P.chequearPreguntaDelDia();
    falla.restaurar();
    assert.equal(F.preguntaDiaDe(G, A.claveDia()), null, "quedaba marcada vacía y el grupo se quedaba sin pregunta ese día");
    await P.chequearPreguntaDelDia();
    await P.chequearPreguntaDelDia();
    assert.equal(enviadosCon(/Pregunta del día/), 1);
  } finally {
    F.updateChat(G, { preguntaDia: 0 });
  }
});

test("pregunta del día: con la economía apagada sale sin premio y no paga", async () => {
  const H = "sin-monedas@g.us";
  F.initDataDB({ chat: H, sender: "u@lid", senderJid: "", pushName: "U" });
  F.updateChat(H, { preguntaDia: 1, monedas: 0 });
  await P.chequearPreguntaDelDia();
  const pregunta = globalThis.enviados.filter((e) => e.chat === H).at(-1)?.msg?.text || "";
  assert.match(pregunta, /Pregunta del día/);
  assert.doesNotMatch(pregunta, /UruCoins/, "prometía un premio con la economía apagada");
  const id = F.preguntaDiaDe(H, A.claveDia()).messageId;
  assert.equal(P.responderPreguntaDelDia({ chat: H, sender: "u@lid", text: "me gustó el asado del finde", quoted: { id } }), null);
  assert.equal(F.getSaldoCoins(H, "u@lid"), 0, "pagaba con la economía apagada");
});

test("recap semanal: si no se pudo mandar, sale en la pasada siguiente, y una sola vez", async () => {
  F.updateChat(G, { recapSemanal: 1 });
  for (let i = 0; i < 3; i++) F.sumarMensajeDiario(G, "u@lid", A.claveDia());
  const falla = fallarEnvios(1);
  await R.chequearRecapSemanal();
  falla.restaurar();
  await R.chequearRecapSemanal();
  await R.chequearRecapSemanal();
  assert.equal(enviadosCon(/RECAP DE LA SEMANA/), 1, "el recap se perdía");
});

test("compraventa: si el «¿sigue en pie?» no se pudo mandar, no arranca la cuenta para darla de baja", async () => {
  const { numero } = Cv.publicar(G, "u@lid", "vendo", "silla de oficina $ 2.500");
  const ahora = Date.now();
  F.actualizarPublicacion(G, numero, { actualizada: ahora - 8 * DIA });
  const falla = fallarEnvios(1);
  assert.equal(await Cv.chequearPublicaciones(ahora), 0);
  falla.restaurar();
  assert.equal(F.getPublicacion(G, numero).aviso, 0, "quedaba como avisada, y a los dos días se daba de baja");
  assert.equal(await Cv.chequearPublicaciones(ahora), 1);
  assert.equal(enviadosCon(/¿sigue en pie tu vendo/), 1);
  assert.ok(F.getPublicacion(G, numero).aviso > 0);
});
