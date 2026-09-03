import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, esperar, ultimoEnviado } from "./helpers.mjs";

let F, A, P, T, R;
before(async () => {
  ({ F } = await prepararBase("actividad"));
  A = await import("../lib/actividad.js");
  P = await import("../lib/pregunta-dia.js");
  T = await import("../lib/trivia-relampago.js");
  R = await import("../lib/recap.js");
  F.initDataDB({ sender: "u@lid", senderJid: "1@s.whatsapp.net", pushName: "U", chat: G });
  F.updateChat(G, { preguntaDia: true, triviaRelampago: true, recapSemanal: true });
});
const DIA = 86400e3;
const saldo = (u) => F.getSaldoCoins(G, u);

test("racha diaria", () => {
  assert.equal(A.registrarActividad(G, "u", "jaja"), null);
  A.registrarActividad(G, "u", "buen día gente");
  A.registrarActividad(G, "u", "cómo andan");
  const r = A.registrarActividad(G, "u", "hoy llueve");
  assert.deepEqual(r, { dias: 1, premio: 3 });
  assert.equal(A.registrarActividad(G, "u", "otro mensaje"), null);
  assert.match(A.textoRacha(G, "u"), /Racha diaria: 1 día · mejor: 1/);
  F.setRacha(G, "v", 4, A.claveDia(new Date(Date.now() - DIA)));
  let rv;
  for (const t of ["a b", "c d", "e f"]) rv = A.registrarActividad(G, "v", t);
  assert.deepEqual(rv, { dias: 5, premio: 7 });
  F.setRacha(G, "w", 9, A.claveDia(new Date(Date.now() - 3 * DIA)));
  let rw;
  for (const t of ["a b", "c d", "e f"]) rw = A.registrarActividad(G, "w", t);
  assert.deepEqual(rw, { dias: 1, premio: 3 });
  assert.match(A.textoRacha(G, "w"), /mejor: 9/);
  F.setRacha(G, "x", 20, A.claveDia(new Date(Date.now() - DIA)));
  let rx;
  for (const t of ["a b", "c d", "e f"]) rx = A.registrarActividad(G, "x", t);
  assert.equal(rx.premio, 10);
});

test("pregunta del día: una por día, premio una vez por persona", async () => {
  A.ACTIVIDAD.HORA_PREGUNTA = 0;
  await P.chequearPreguntaDelDia();
  await P.chequearPreguntaDelDia();
  const preguntas = globalThis.enviados.filter((e) => /Pregunta del día/.test(e.msg.text));
  assert.equal(preguntas.length, 1);
  const id = F.preguntaDiaDe(G, A.claveDia()).messageId;
  const m = { chat: G, sender: "u", text: "me gustó el asado del finde", quoted: { id } };
  assert.equal(P.responderPreguntaDelDia(m)?.premio, 3);
  assert.equal(P.responderPreguntaDelDia(m), null);
  assert.equal(P.responderPreguntaDelDia({ chat: G, sender: "z", text: "sí", quoted: { id } }), null);
});

test("trivia relámpago: agenda, lanza, responde y vence", async () => {
  A.ACTIVIDAD.RELAMPAGO_DESDE = 0;
  A.ACTIVIDAD.RELAMPAGO_HASTA = 23;
  A.ACTIVIDAD.RELAMPAGO_SEGUNDOS = 0.05;
  assert.equal(T.programarTriviasDelDia(), 2);
  assert.equal(T.programarTriviasDelDia(), 0);
  await T.lanzarTriviaRelampago(globalThis.client, G);
  const lanzada = ultimoEnviado();
  assert.match(lanzada.msg.text, /TRIVIA RELÁMPAGO/);
  const estado = globalThis.relampagos.get(G);
  const idMsg = estado.mensajeId;
  const mal = "abcd".replace(estado.respuesta, "")[0];
  assert.equal(T.responderRelampago({ chat: G, sender: "a", text: mal, quoted: { id: idMsg } }).reaccion, "❌");
  assert.equal(T.responderRelampago({ chat: G, sender: "a", text: estado.respuesta, quoted: { id: idMsg } }).reaccion, "🙅");
  assert.equal(T.responderRelampago({ chat: G, sender: "b", text: "hola", quoted: { id: idMsg } }), null);
  const win = T.responderRelampago({ chat: G, sender: "b", text: estado.respuesta.toUpperCase() + ")", quoted: { id: idMsg } });
  assert.equal(win.reaccion, "✅");
  assert.equal(saldo("b"), 15);
  assert.ok(!globalThis.relampagos.has(G));
  await T.lanzarTriviaRelampago(globalThis.client, G);
  await esperar(120);
  assert.match(ultimoEnviado().msg.text, /Nadie acertó/);
});

test("recap semanal", async () => {
  const rec = await R.armarRecap(G);
  assert.match(rec.texto, /Mensajes de la semana: \*\d+\*/);
  assert.match(rec.texto, /Trivias relámpago: @b ×1/);
  assert.match(rec.texto, /Respuestas a la pregunta del día: 1/);
  const ahora = new Date();
  A.ACTIVIDAD.DIA_RECAP = ahora.getDay();
  A.ACTIVIDAD.HORA_RECAP = 0;
  const antes = globalThis.enviados.length;
  await R.chequearRecapSemanal();
  await R.chequearRecapSemanal();
  assert.equal(globalThis.enviados.length, antes + 1);
});
