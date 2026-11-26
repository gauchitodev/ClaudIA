import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, esperar, ultimoEnviado } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";

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
  const Tr = await import("../lib/trivia.js");
  A.ACTIVIDAD.RELAMPAGO_DESDE = 0;
  A.ACTIVIDAD.RELAMPAGO_HASTA = 23;
  A.ACTIVIDAD.RELAMPAGO_SEGUNDOS = 0.05;
  // In production each lightning trivia is rolled for and only in active groups; here it's forced so the test is
  // deterministic.
  A.ACTIVIDAD.RELAMPAGO_PROBABILIDAD = 1;
  A.ACTIVIDAD.RELAMPAGO_MENSAJES_MINIMOS = 0;
  // a fixed hour inside the window: at night (past RELAMPAGO_HASTA)
  // there is nothing left to schedule and the test failed
  const mediodia = new Date();
  mediodia.setHours(12, 0, 0, 0);
  // A second group with the trivia switched off one by one (.juego trivia off): nothing scheduled and the day not
  // marked done, so once it's back on the next pass schedules it.
  const G2 = "apagado@g.us";
  F.initDataDB({ sender: "u@lid", senderJid: "", pushName: "U", chat: G2 });
  F.updateChat(G2, { triviaRelampago: true, juegosApagados: '["trivia"]' });
  assert.equal(T.programarTriviasDelDia(mediodia), 2);
  assert.equal(T.programarTriviasDelDia(mediodia), 0);
  F.updateChat(G2, { juegosApagados: "[]" });
  assert.equal(T.programarTriviasDelDia(mediodia), 2, "prendida de nuevo, la pasada siguiente la agenda");
  F.updateChat(G2, { triviaRelampago: false });
  await T.lanzarTriviaRelampago(conexion.client, G, mediodia);
  const lanzada = ultimoEnviado();
  assert.match(lanzada.msg.text, /^⚡ \*TRIVIA RELÁMPAGO\* — 15 UruCoins para el primero que acierte\n\n.+\nA\) /);
  const ronda = Tr.rondaDe(G);
  assert.equal(ronda.tipo, "relampago");
  const idMsg = ronda.mensajeId;
  const correcta = ronda.pregunta.correcta;
  const mal = "abcd".replace(correcta, "")[0];
  assert.equal(Tr.responderTrivia({ chat: G, sender: "a", text: mal, quoted: { id: idMsg } }).reaccion, "❌");
  assert.equal(Tr.responderTrivia({ chat: G, sender: "a", text: correcta, quoted: { id: idMsg } }).reaccion, "🙅");
  assert.equal(Tr.responderTrivia({ chat: G, sender: "b", text: "hola", quoted: { id: idMsg } }), null);
  const win = Tr.responderTrivia({ chat: G, sender: "b", text: `${correcta.toUpperCase()})` });
  assert.equal(win.reaccion, "✅");
  // A question of the bank, at random: with its fact (lib/trivia-banco.js), before the prize.
  assert.match(win.texto, /^✅ ¡Acertó @b! Era \*[ABCD]\) .+\*\.\n(💡 .+\n)?🪙 \+15 UruCoins\.$/);
  assert.equal(saldo("b"), 15);
  assert.equal(Tr.rondaDe(G), null);
  await T.lanzarTriviaRelampago(conexion.client, G, mediodia);
  await esperar(120);
  assert.match(ultimoEnviado().msg.text, /^⏳ Nadie acertó\. Era \*[ABCD]\) .+\*\.(\n💡 .+)?$/);
});

// In a group of its own, with the week it sums up: it summed up the messages, the trivia and the day's question of the
// tests above, and run before them, or after only some, it found what they hadn't done yet.
test("recap semanal", async () => {
  const Tr = await import("../lib/trivia.js");
  const chat = "actividad-recap@g.us";
  F.initDataDB({ sender: "u@lid", senderJid: "", pushName: "U", chat }); // the group's row, which updateChat needs
  F.updateChat(chat, { recapSemanal: true });
  for (let i = 0; i < 3; i++) F.sumarMensajeDiario(chat, "u", A.claveDia());
  // b wins a lightning trivia and u answers the day's question, each paid by its own module as the recap reads them.
  // The lightning trivia is on just to launch it: on, the trivia test above scheduled them for this group too.
  const mediodia = new Date();
  mediodia.setHours(12, 0, 0, 0);
  F.updateChat(chat, { triviaRelampago: true });
  await T.lanzarTriviaRelampago(conexion.client, chat, mediodia);
  F.updateChat(chat, { triviaRelampago: false });
  assert.equal(Tr.responderTrivia({ chat, sender: "b", text: `${Tr.rondaDe(chat).pregunta.correcta.toUpperCase()})` }).reaccion, "✅");
  F.guardarPreguntaDia(chat, A.claveDia(), "¿Qué comieron el finde?", "pregunta-del-recap");
  assert.equal(P.responderPreguntaDelDia({ chat, sender: "u", text: "me gustó el asado del finde", quoted: { id: "pregunta-del-recap" } })?.premio, 3);

  const rec = await R.armarRecap(chat);
  assert.match(rec.texto, /Mensajes de la semana: \*\d+\*/);
  assert.match(rec.texto, /Trivias relámpago: @b ×1/);
  assert.match(rec.texto, /Respuestas a la pregunta del día: 1/);
  const ahora = new Date();
  A.ACTIVIDAD.DIA_RECAP = ahora.getDay();
  A.ACTIVIDAD.HORA_RECAP = 0;
  const aca = () => globalThis.enviados.filter((e) => e.chat === chat).length; // a pass goes over every group
  const antes = aca();
  await R.chequearRecapSemanal();
  await R.chequearRecapSemanal();
  assert.equal(aca(), antes + 1);
});

// ---------- group activity by hour (.actividad and .podar) ----------
// This table counts EVERY message, not just the conversation that feeds the streak: that's why it's apart from the
// tests above. The time is pinned with a Date of its own, as in test/horario-juegos.test.mjs, so the clock can't
// get in the way.
const H = "horario@g.us";
const en = (dia, hora) => new Date(2026, 8, dia, hora, 30, 0);

test("el panel de actividad resume días y horas", async () => {
  const Panel = (await import("../plugins/grupo-actividad.js")).default;
  const ahora = en(20, 15); // Sunday, September 20, 15:30
  const hoy = A.claveDia(ahora);
  const ayer = A.claveDia(new Date(ahora.getTime() - DIA));

  // with nothing recorded it says so, and doesn't divide by zero
  assert.match(A.textoActividad(H, ahora).texto, /No tengo actividad registrada/);

  for (let i = 0; i < 40; i++) F.sumarMensajeHora(H, hoy, 21);
  for (let i = 0; i < 25; i++) F.sumarMensajeHora(H, hoy, 13);
  for (let i = 0; i < 10; i++) F.sumarMensajeHora(H, hoy, 3);
  for (let i = 0; i < 30; i++) F.sumarMensajeHora(H, ayer, 22);

  const { texto } = A.textoActividad(H, ahora);
  assert.match(texto, /Hoy: \*75\* mensajes · ayer 30/);
  // Counting started yesterday: the average is over those two days, not over a week the bot never counted.
  assert.match(texto, /Últimos 2 días: \*105\* · 53 por día/);
  assert.match(texto, /21:00 █+░* 40\n22:00 █+░* 30\n13:00 █+░* 25/, "las horas pico van de mayor a menor");
  assert.doesNotMatch(texto, /03:00/, "solo las tres primeras");
  assert.match(texto, /Más tranquilo: de 0[45] a \d\d h/);

  // the command sends that same text. It reads the real clock, not the pinned one, so it gets something from today:
  // the days above drop out of its week as time goes by (this test broke once a week after September 20).
  F.sumarMensajeHora(H, A.claveDia(new Date()), 12);
  await Panel.run({ chat: H, isGroup: true }, { client: conexion.client });
  assert.match(ultimoEnviado().msg.text, /ACTIVIDAD DEL GRUPO/);
});

test("el panel no inventa promedios: los calcula sobre los días que realmente contó", () => {
  const ahora = en(20, 15);
  const hoy = A.claveDia(ahora);

  // First day of counting: no "ayer" (it wasn't counted) and no average (it would just repeat today).
  const nuevo = "nuevo@g.us";
  for (let i = 0; i < 300; i++) F.sumarMensajeHora(nuevo, hoy, 12);
  const primerDia = A.textoActividad(nuevo, ahora).texto;
  assert.match(primerDia, /Hoy: \*300\* mensajes\n/);
  assert.doesNotMatch(primerDia, /ayer|Últimos|por día/, "el primer día no hay con qué comparar");

  // A group counted for longer than a week keeps dividing by 7, silent days included: a quiet day is a real zero.
  const viejo = "viejo@g.us";
  F.sumarMensajeHora(viejo, A.claveDia(new Date(ahora.getTime() - 10 * DIA)), 12);
  for (let i = 0; i < 70; i++) F.sumarMensajeHora(viejo, hoy, 12);
  assert.match(A.textoActividad(viejo, ahora).texto, /Hoy: \*70\* mensajes · ayer 0\nÚltimos 7 días: \*70\* · 10 por día/);
});

test("el conteo por hora incluye comandos y mensajes de una palabra", async () => {
  const Hook = (await import("../plugins/_actividad-horaria.js")).default;
  const C = "todo@g.us";
  const msg = (text) => ({ chat: C, sender: "u@lid", text, message: {}, isGroup: true, fromMe: false, isBaileys: false });

  await Hook.before(msg(".bal"));
  await Hook.before(msg("jaja"));
  await Hook.before(msg("buenas gente"));
  await Hook.before({ ...msg("del bot"), fromMe: true });
  await Hook.before({ ...msg("aviso de grupo"), message: null });

  const hoy = A.claveDia();
  const total = F.mensajesPorDia(C, [hoy]).reduce((t, r) => t + r.total, 0);
  assert.equal(total, 3, "cuentan el comando y el 'jaja'; no cuentan el bot ni los avisos de grupo");
  // and the streak keeps its own rule: "jaja" isn't conversation
  assert.equal(A.mensajeCuenta("jaja"), false);
});

// In a group of its own: the rows it left in H showed up in the panel's test, which expects nothing recorded there at
// first.
test(".podar saca el detalle viejo y deja el reciente", async () => {
  const Podar = (await import("../plugins/owner-podar.js")).default;
  const C = "podar@g.us";
  const ahora = en(20, 15).getTime();
  const viejo = A.claveDia(new Date(ahora - 100 * DIA));
  const justoAlBorde = A.claveDia(new Date(ahora - A.ACTIVIDAD.HORARIA_DIAS * DIA));
  const reciente = A.claveDia(new Date(ahora - 5 * DIA));

  F.sumarMensajeHora(C, viejo, 10);
  F.sumarMensajeHora(C, viejo, 11);
  F.sumarMensajeHora(C, justoAlBorde, 12);
  F.sumarMensajeHora(C, reciente, 13);

  assert.equal(A.podarActividad(ahora), 2, "solo lo anterior a los 90 días");
  assert.equal(F.mensajesPorDia(C, [viejo]).length, 0);
  assert.equal(F.mensajesPorDia(C, [justoAlBorde])[0].total, 1, "el día 90 justo se conserva");
  assert.equal(F.mensajesPorDia(C, [reciente])[0].total, 1);

  assert.equal(A.podarActividad(ahora), 0, "correrlo de nuevo no borra nada");

  // The command takes no "ahora": it runs against the real clock, so the rows are seeded relative to it. And since it
  // prunes EVERY group, whatever the tests above left behind is cleared first, so the count comes out exact.
  const P = "poda@g.us";
  A.podarActividad();
  F.sumarMensajeHora(P, A.claveDia(new Date(Date.now() - 200 * DIA)), 9);
  await Podar.run({ chat: P, isGroup: true }, { client: conexion.client });
  assert.match(ultimoEnviado().msg.text, /Podé 1 fila de actividad por hora/);
  await Podar.run({ chat: P, isGroup: true }, { client: conexion.client });
  assert.match(ultimoEnviado().msg.text, /No había actividad por hora, envíos del bot ni usos de comandos de más de 90 días/);
});

// The streak's 🔥 (plugins/_actividad.js), only where the economy is on: with it off (.monedas, .modo compraventa) the
// streak is counted all the same, it pays nothing and nothing goes out.
const saldoEn = (chat) => F.getSaldoCoins(chat, "r@lid");
test("la racha se festeja con 🔥 solo con la economía prendida, y apagada se sigue contando", async () => {
  const Actividad = (await import("../plugins/_actividad.js")).default;
  const [CON, SIN] = ["racha-con@g.us", "racha-sin@g.us"];
  for (const chat of [CON, SIN]) F.initDataDB({ chat, sender: "r@lid", senderJid: "", pushName: "R" });
  F.updateChat(SIN, { monedas: 0 });
  const reacciones = [];
  const escribe = (chat, texto) => Actividad.before({ chat, sender: "r@lid", isGroup: true, message: { conversation: texto }, text: texto, react: async (emoji) => reacciones.push([chat, emoji]) }, { client: conexion.client });
  for (const texto of ["buen día gente", "cómo andan todos", "hoy llueve fuerte"]) {
    await escribe(CON, texto);
    await escribe(SIN, texto);
  }
  assert.deepEqual(reacciones, [[CON, "🔥"]]);
  assert.equal(saldoEn(CON), 3);
  assert.match(A.textoRacha(SIN, "r@lid"), /Racha diaria: 1 día/, "sin festejo, pero contada");
  assert.equal(saldoEn(SIN), 0);
});

// The month's ranking and the week's hashtags are the fun's (.diversion): with it off (.modo compraventa) their periods
// close with no announcement and no prize, marked as closed so turning it back on doesn't announce them late. The
// lottery isn't theirs.
test("el cierre del mes y de la semana: con la diversión apagada se cierran sin anunciar ni pagar; prendida, se anuncian", async () => {
  const Cierres = (await import("../plugins/_cierres-periodicos.js")).default;
  const { mesesAnteriores, semanasAnteriores } = await import("../lib/hashtags.js");
  const [SIN, CON] = ["cierre-sin@g.us", "cierre-con@g.us"];
  const [mes] = mesesAnteriores(Date.now(), 1);
  const [semana] = semanasAnteriores(Date.now(), 1);
  for (const chat of [SIN, CON]) {
    F.initDataDB({ chat, sender: "a@lid", senderJid: "", pushName: "A" });
    db.prepare(`INSERT INTO interacciones_mensuales (mes, chat, usuario, recibidas, emitidas) VALUES (?, ?, ?, 5, 2)`).run(mes, chat, "a@lid");
    F.agregarEntradaHashtag({ chat, hashtag: "quejadelunes", usuario: "a@lid", contenido: "#quejadelunes el lunes", messageId: `Q-${chat}`, semana });
    F.sumarReaccionEntradaHashtag(chat, `Q-${chat}`, 3);
  }
  F.updateChat(SIN, { diversion: 0 });
  F.agregarBoletosLoteria(SIN, semana, "a@lid", 2);
  const cierra = async (chat) => {
    globalThis.enviados = [];
    await Cierres.before({ chat, isGroup: true }, { client: conexion.client, chat: F.getChat(chat) });
    return globalThis.enviados.map((e) => e.msg?.text);
  };
  const enSin = await cierra(SIN);
  assert.equal(enSin.length, 1, JSON.stringify(enSin));
  assert.match(enSin[0], /^🎟️ \*LOTERÍA DE /, "solo la lotería, que es del casino: ni el ranking ni lo más votado");
  assert.ok(F.periodoCerrado(SIN, "mes", mes) && F.periodoCerrado(SIN, "semana", semana), "pero quedan cerrados");
  const premios = (chat) => db.prepare(`SELECT motivo FROM urucoins_log WHERE chat = ? AND (motivo = 'ganador_mes' OR motivo LIKE 'top_semana_%')`).all(chat).map((f) => f.motivo);
  assert.deepEqual(premios(SIN), [], "ni sus premios");
  const anuncios = await cierra(CON);
  assert.ok(anuncios.some((t) => /^🏆 \*CERRÓ EL RANKING DE /.test(t)), JSON.stringify(anuncios));
  assert.ok(anuncios.some((t) => /^📣 \*LO MÁS VOTADO DE /.test(t)), JSON.stringify(anuncios));
  assert.deepEqual(premios(CON).sort(), ["ganador_mes", "ganador_mes", "top_semana_quejadelunes"], "el más votado y el más activo, y lo más votado de la semana");
});
