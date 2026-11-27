import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, ultimoEnviado, fijarSaldo } from "./helpers.mjs";

// The group changas (lib/changas.js): a job that needs a team, posted by Claudia now and then in the groups that
// asked for them, or by someone who pays for it. People join with .anotarme or by reacting; with the team complete
// in time everybody is paid, and with no team nobody is.
let F, L, C, A;
before(async () => {
  ({ F } = await prepararBase("changas"));
  L = await import("../lib/laburos.js");
  C = await import("../lib/changas.js");
  A = await import("../lib/actividad.js");
});

// The dice, loaded: each call takes the next number, and 0 once they run out.
const dados = (...tiros) => {
  C._dep.azar = () => tiros.shift() ?? 0;
};
const SIN_EVENTO = 99;
const aLas = (hora, minutos = 0) => {
  const d = new Date();
  d.setHours(hora, minutos, 0, 0);
  return d;
};
const saldo = (chat, quien) => F.getSaldoCoins(chat, quien);
// A group with the changas on, the economy on and people talking at that hour.
function grupo(chat, { hora = 15, mensajes = 10 } = {}) {
  F.initDataDB({ chat, sender: "ana@lid", senderJid: "", pushName: "Ana" });
  F.updateChat(chat, { changas: 1 });
  for (let i = 0; i < mensajes; i++) F.sumarMensajeHora(chat, A.claveDia(), hora);
}
// One of Claudia's, open: with the dice at 0, the first of her bank (papas), for CUPOS_MIN people at PAGA_MIN.
async function abierta(chat, client = clienteFalso()) {
  grupo(chat);
  dados();
  const id = await C.lanzarChangaDeClaudia(client, chat, aLas(15));
  assert.ok(id, "tendría que haber salido");
  return C.changaAbierta(chat);
}

test("el banco de changas: oficios afines que existen, y eventos que dicen a quién le tocó", () => {
  assert.ok(C.CHANGAS.length >= 12);
  assert.equal(new Set(C.CHANGAS.map((c) => c.clave)).size, C.CHANGAS.length);
  for (const c of C.CHANGAS) {
    assert.ok(c.titulo.length > 10 && c.titulo.length <= C.CHANGA.TITULO_MAX && c.hecho.length > 10 && c.emoji, c.clave);
    assert.ok(c.afines.length >= 2 && c.afines.every((k) => L.OFICIOS[k]), `${c.clave}: oficios afines que existen`);
  }
  // Every trade is kindred to some changa.
  for (const oficio of Object.keys(L.OFICIOS)) assert.ok(C.CHANGAS.some((c) => c.afines.includes(oficio)), oficio);
  for (const e of C.EVENTOS) {
    assert.ok((e.uno > 1) !== (e.factor > 0), `${e.clave}: a uno o a todos`);
    assert.equal(e.texto.includes("{uno}"), Boolean(e.uno), e.clave);
  }
  for (const clave of ["vivo", "camion"]) assert.ok(C.EVENTOS.some((e) => e.clave === clave));
});

test("la changa de Claudia: sale con cupos y paga, se anotan con .anotarme y al completarse cobran todos", async () => {
  const G = "claudia@g.us";
  const client = clienteFalso();
  const changa = await abierta(G, client);
  const { CUPOS_MIN, PAGA_MIN, PLAZO_MIN } = C.CHANGA;
  assert.deepEqual([changa.creador, changa.clave, changa.cupos, changa.paga, changa.estado], ["", "papas", CUPOS_MIN, PAGA_MIN, "abierta"]);
  const anuncio = ultimoEnviado();
  assert.equal(anuncio.chat, G);
  assert.equal(anuncio.msg.text, `🧰 *CHANGA* — 🥔 Cosecha de papas en Canelones\n\nNecesito *${CUPOS_MIN}* y pago *${PAGA_MIN} UruCoins* a cada uno. Se anotan reaccionando a este mensaje o con .anotarme, y tienen ${PLAZO_MIN} minutos.\n_Si se junta el equipo cobran todos; si no, nadie. Rinde más con gente del rubro: peón de estancia, feriante y tambero._`);
  assert.match(changa.mensaje_id, /^MSG\d+$/);
  assert.equal(changa.vence, aLas(15).getTime() + PLAZO_MIN * 60 * 1000);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM pendientes WHERE chat = ? AND tipo = 'changa_vence' AND estado = 'pendiente'`).get(G).n, 1);

  const ahora = aLas(15, 5).getTime();
  const uno = C.anotarse(G, "ana@lid", ahora);
  assert.equal(uno.texto, "✍️ Anotado para «Cosecha de papas en Canelones». Van 1 de 2: falta 1.");
  assert.match(C.anotarse(G, "ana@lid", ahora).error, /Ya estás en la lista\. Van 1 de 2/);
  assert.equal(saldo(G, "ana@lid"), 0, "nadie cobra hasta que se junta el equipo");
  assert.match(C.textoChangas(G, ahora).texto, /^🧰 \*Changa abierta\*: Cosecha de papas en Canelones\nPaga \*60 UruCoins\* a cada uno y hacen falta 2\. Van 1: @ana\. Quedan 25 minutos/);

  dados(SIN_EVENTO);
  const dos = C.anotarse(G, "beto@lid", ahora);
  assert.ok(dos.hecha);
  assert.equal(dos.texto, "🧰 *Changa hecha* — 🥔 Cosecha de papas en Canelones\nSacaron las papas antes de que lloviera. Hay tierra hasta en el termo.\n🪙 @ana y @beto cobran *60 UruCoins* cada uno.");
  assert.deepEqual(dos.mentions, ["ana@lid", "beto@lid"]);
  assert.deepEqual([saldo(G, "ana@lid"), saldo(G, "beto@lid")], [PAGA_MIN, PAGA_MIN]);
  assert.equal(C.changaAbierta(G), null);
  assert.match(C.anotarse(G, "caro@lid", ahora).error, /No hay ninguna changa abierta/);
  assert.equal(C.vencerChanga(changa.id, changa.vence + 1), null, "hecha, el plazo ya no dice nada");
  assert.match(C.textoChangas(G, ahora).texto, /^🧰 Ahora no hay ninguna changa abierta\.\n\nLas mías están \*prendidas\*/);
});

test("gente del rubro en el equipo: +10 % para todos por cada uno, hasta el tope", async () => {
  const G = "rubro@g.us";
  const changa = await abierta(G);
  db.prepare(`UPDATE changas SET cupos = 5, paga = 100 WHERE id = ?`).run(changa.id);
  // Two peones and a tambero are of the trade; a DJ isn't, and neither is whoever has no trade.
  for (const [quien, oficio] of [["ana@lid", "peon"], ["beto@lid", "peon"], ["caro@lid", "tambero"], ["dani@lid", "dj"]]) assert.ok(L.tomarLaburo(G, quien, oficio).ok);
  F.initDataDB({ chat: G, sender: "caro@lid", senderJid: "", pushName: "Caro" });
  F.updateUser("caro@lid", { genero: "mujer" });
  dados(SIN_EVENTO);
  let r;
  for (const quien of ["ana@lid", "beto@lid", "caro@lid", "dani@lid", "eva@lid"]) r = C.anotarse(G, quien, changa.vence - 1000);
  assert.ok(Math.abs(r.hecha.bonus - 0.3) < 1e-9);
  assert.match(r.texto, /\n💪 Con @ana \(peón de estancia\), @beto \(peón de estancia\) y @caro \(tambera\) en el equipo, que son del rubro, rindió un 30 % más para todos\.\n🪙 @ana, @beto, @caro, @dani y @eva cobran \*130 UruCoins\* cada uno\.$/);
  for (const quien of ["ana@lid", "dani@lid", "eva@lid"]) assert.equal(saldo(G, quien), 130);

  // Four of the trade don't go past the cap.
  const G2 = "tope@g.us";
  const otra = await abierta(G2);
  db.prepare(`UPDATE changas SET cupos = 4, paga = 100 WHERE id = ?`).run(otra.id);
  for (const quien of ["a@lid", "b@lid", "c@lid", "d@lid"]) assert.ok(L.tomarLaburo(G2, quien, "feriante").ok);
  dados(SIN_EVENTO);
  for (const quien of ["a@lid", "b@lid", "c@lid", "d@lid"]) C.anotarse(G2, quien, otra.vence - 1000);
  assert.equal(saldo(G2, "a@lid"), Math.round(100 * (1 + C.CHANGA.BONUS_AFIN_MAX)));
});

test("los eventos: uno se hace el vivo y cobra doble, o se queda el camión y cobran la mitad", async () => {
  const idx = (clave) => C.EVENTOS.findIndex((e) => e.clave === clave);
  const hacer = async (chat, ...tiros) => {
    const changa = await abierta(chat);
    db.prepare(`UPDATE changas SET cupos = 3, paga = 100 WHERE id = ?`).run(changa.id);
    C.anotarse(chat, "ana@lid", changa.vence - 1000);
    C.anotarse(chat, "beto@lid", changa.vence - 1000);
    dados(...tiros);
    return C.anotarse(chat, "caro@lid", changa.vence - 1000);
  };
  // The event's roll (under EVENTO_CHANCE), which event, and who the clever one is (the second of the team).
  const vivo = await hacer("vivo@g.us", 0, idx("vivo"), 1);
  assert.equal(vivo.hecha.evento, "vivo");
  assert.match(vivo.texto, /\n😏 @beto se hizo el vivo: pasó dos veces por la caja con distinta gorra y cobró doble\.\n🪙 Cobran: @ana \*100\*, @beto \*200\* y @caro \*100\* UruCoins\.$/);
  assert.deepEqual(["ana@lid", "beto@lid", "caro@lid"].map((q) => saldo("vivo@g.us", q)), [100, 200, 100]);

  const camion = await hacer("camion@g.us", C.CHANGA.EVENTO_CHANCE - 1, idx("camion"));
  assert.match(camion.texto, /\n🚚 A la vuelta se quedó el camión.*cobran la mitad\.\n🪙 @ana, @beto y @caro cobran \*50 UruCoins\* cada uno\.$/);
  assert.equal(saldo("camion@g.us", "ana@lid"), 50);

  assert.equal((await hacer("propina@g.us", 0, idx("propina"))).hecha.evento, "propina");
  assert.equal(saldo("propina@g.us", "caro@lid"), 150);

  const nada = await hacer("nada@g.us", C.CHANGA.EVENTO_CHANCE);
  assert.equal(nada.hecha.evento, null);
  assert.equal(saldo("nada@g.us", "caro@lid"), 100);
});

test("sin equipo en el plazo nadie cobra, Claudia se burla y el pendiente lo dice en el grupo", async () => {
  const G = "sinequipo@g.us";
  const P = await import("../lib/pendientes.js");
  const changa = await abierta(G);
  C.anotarse(G, "ana@lid", changa.vence - 1000);
  assert.equal(C.vencerChanga(changa.id, changa.vence - 1), null, "antes de hora no");
  assert.match(C.anotarse(G, "beto@lid", changa.vence).error, /No hay ninguna changa abierta/, "pasado el plazo no entra nadie");
  dados(0);
  const r = C.vencerChanga(changa.id, changa.vence);
  assert.equal(r.texto, "🦗 La changa «Cosecha de papas en Canelones» quedó sin equipo. Se anotó @ana, y hacían falta 2: nadie cobra.\nDespués dicen que no hay laburo.");
  assert.deepEqual(r.mentions, ["ana@lid"]);
  assert.equal(saldo(G, "ana@lid"), 0);
  assert.equal(C.changaAbierta(G), null);
  assert.equal(C.vencerChanga(changa.id, changa.vence), null);

  // Through the pending work, with nobody in it.
  const G2 = "sinnadie@g.us";
  const client = clienteFalso();
  const otra = await abierta(G2, client);
  db.prepare(`UPDATE changas SET vence = ? WHERE id = ?`).run(Date.now() - 1000, otra.id);
  db.prepare(`UPDATE pendientes SET ejecutar_en = ? WHERE chat = ?`).run(Date.now() - 1000, G2);
  await P.procesarPendientes(client);
  assert.match(ultimoEnviado().msg.text, /^🦗 La changa «Cosecha de papas en Canelones» quedó sin equipo\. No se anotó nadie: nadie cobra\.\n/);
  assert.equal(ultimoEnviado().chat, G2);
});

test("cuándo sale la de Claudia: prendida, con economía, en horario, de a una, con tope por día y con el grupo charlando", async () => {
  const G = "cuando@g.us";
  const client = clienteFalso();
  const sale = async (ahora = aLas(15)) => {
    dados();
    return C.lanzarChangaDeClaudia(client, G, ahora);
  };
  const cerrar = () => db.prepare(`UPDATE changas SET estado = 'vencida' WHERE chat = ?`).run(G);
  F.initDataDB({ chat: G, sender: "ana@lid", senderJid: "", pushName: "Ana" });
  for (let i = 0; i < 10; i++) F.sumarMensajeHora(G, A.claveDia(), 15);

  assert.equal(F.getChat(G).changas, 0, "vienen apagadas");
  assert.equal(await sale(), null, "apagadas no sale");
  F.updateChat(G, { changas: 1, monedas: 0 });
  assert.equal(await sale(), null, "sin economía tampoco");
  F.updateChat(G, { monedas: 1, grupoCerradoPorHorario: 1 });
  assert.equal(await sale(), null, "ni con el grupo cerrado por su horario");
  F.updateChat(G, { grupoCerradoPorHorario: 0 });
  assert.equal(await sale(aLas(C.CHANGA.DESDE_HORA - 1)), null, "ni antes de hora");
  assert.equal(await sale(aLas(C.CHANGA.HASTA_HORA)), null, "ni de noche");
  // A quiet group: its messages were at 15, and at 18 nobody has written for a while.
  assert.equal(await sale(aLas(18)), null, "ni con el grupo callado");
  assert.equal(globalThis.enviados.length, 0);
  assert.ok(await sale(aLas(16)), "con mensajes en la hora anterior, sí");

  assert.equal(await sale(), null, "de a una");
  cerrar();
  const segunda = await sale();
  assert.ok(segunda);
  assert.notEqual(C.changaAbierta(G).clave, "papas", "no repite la última");
  cerrar();
  assert.equal(await sale(), null, `no más de ${C.CHANGA.MAX_DIA} por día`);

  // A send that fails leaves nothing open.
  const G2 = "falla@g.us";
  grupo(G2);
  dados();
  await assert.rejects(C.lanzarChangaDeClaudia({ sendMessage: async () => Promise.reject(new Error("sin conexión")) }, G2, aLas(15)));
  assert.equal(C.changaAbierta(G2), null);
});

test("se agendan una vez por día, repartidas en el horario, solo en grupos prendidos que charlaron ayer", () => {
  const G = "agenda@g.us";
  const pendientes = () => db.prepare(`SELECT ejecutar_en FROM pendientes WHERE chat = ? AND tipo = 'changa_grupal' ORDER BY ejecutar_en`).all(G).map((p) => p.ejecutar_en);
  const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const randomAntes = Math.random;
  Math.random = () => 0.5; // under PROBABILIDAD, and the middle of each stretch
  try {
    F.initDataDB({ chat: G, sender: "ana@lid", senderJid: "", pushName: "Ana" });
    const { DESDE_HORA, HASTA_HORA, MAX_DIA, MENSAJES_AYER } = C.CHANGA;
    C.programarChangasDelDia(aLas(DESDE_HORA));
    assert.equal(pendientes().length, 0, "apagadas, nada");
    F.updateChat(G, { changas: 1 });
    assert.equal(C.programarChangasDelDia(aLas(DESDE_HORA - 1)), 0, "antes de hora no agenda");
    F.updateChat(G, { monedas: 0 });
    C.programarChangasDelDia(aLas(DESDE_HORA));
    F.updateChat(G, { monedas: 1 });
    assert.equal(pendientes().length, 0, "sin economía, nada, y el día no queda marcado");

    db.prepare(`INSERT INTO actividad_diaria (chat, usuario, fecha, mensajes) VALUES (?, 'ana@lid', ?, ?)`).run(G, A.claveDia(ayer), MENSAJES_AYER);
    C.programarChangasDelDia(aLas(DESDE_HORA));
    const horas = pendientes();
    assert.equal(horas.length, MAX_DIA);
    const tramo = (HASTA_HORA - DESDE_HORA) / MAX_DIA;
    horas.forEach((h, i) => {
      const desde = aLas(DESDE_HORA).getTime() + i * tramo * 60 * 60 * 1000;
      assert.ok(h >= desde && h < desde + tramo * 60 * 60 * 1000, `la ${i + 1} cae en su tramo`);
    });
    C.programarChangasDelDia(aLas(DESDE_HORA + 1));
    assert.equal(pendientes().length, MAX_DIA, "una sola vez por día");

    // A group that didn't talk yesterday gets none.
    const G2 = "callado@g.us";
    F.initDataDB({ chat: G2, sender: "ana@lid", senderJid: "", pushName: "Ana" });
    F.updateChat(G2, { changas: 1 });
    C.programarChangasDelDia(aLas(DESDE_HORA));
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM pendientes WHERE chat = ?`).get(G2).n, 0);
  } finally {
    Math.random = randomAntes;
  }
});

test(".changa de una persona: paga de su bolsillo al publicar, sin bonus ni eventos, y si no se junta le vuelve", () => {
  const G = "persona@g.us";
  F.initDataDB({ chat: G, sender: "ana@lid", senderJid: "", pushName: "Ana" });
  const publicar = (quien, texto, ahora = aLas(15).getTime()) => C.publicarChanga(G, quien, texto.split(" ").filter(Boolean), ahora);
  fijarSaldo(F, G, "ana@lid", 400);

  for (const mal of ["", "3", "3 50", "tres 50 Mudanza", "3 50 ab", "3 5,5 Mudanza"]) assert.match(publicar("ana@lid", mal).error, /Se publica así: \.changa 3 50 Mudanza de la abuela/, `«${mal}»`);
  assert.match(publicar("ana@lid", "1 50 Mudanza").error, /para 2 a 6 personas/);
  assert.match(publicar("ana@lid", "7 50 Mudanza").error, /para 2 a 6 personas/);
  assert.match(publicar("ana@lid", "3 5 Mudanza").error, /de 10 a 500 UruCoins por persona/);
  assert.match(publicar("ana@lid", "3 501 Mudanza").error, /de 10 a 500/);
  assert.match(publicar("ana@lid", "3 200 Mudanza").error, /hacen falta 600 UruCoins y tenés 400/);
  assert.equal(saldo(G, "ana@lid"), 400);

  const r = publicar("ana@lid", "2 50 Mudanza   de la abuela");
  assert.ok(r.ok, r.error);
  assert.equal(r.texto, "🧰 *CHANGA de @ana* — Mudanza de la abuela\n\nNecesita *2* y paga *50 UruCoins* a cada uno, de su bolsillo. Se anotan reaccionando a este mensaje o con .anotarme, y tienen 30 minutos.\n_Si no se junta el equipo, nadie cobra y la plata le vuelve._");
  assert.deepEqual(r.mentions, ["ana@lid"]);
  assert.equal(saldo(G, "ana@lid"), 300, "la plata sale al publicar");
  assert.match(publicar("beto@lid", "2 10 Otra changa").error, /Ya hay una changa abierta/);
  const ahora = aLas(15, 1).getTime();
  assert.match(C.anotarse(G, "ana@lid", ahora).error, /La changa es tuya/);
  assert.match(C.textoChangas(G, ahora).texto, /^🧰 \*Changa abierta\* de @ana: Mudanza de la abuela/);

  // People of any trade and the dice loaded for an event: it pays what was put in, to the coin.
  for (const quien of ["beto@lid", "caro@lid"]) assert.ok(L.tomarLaburo(G, quien, "camionero").ok);
  C.anotarse(G, "beto@lid", ahora);
  dados(0, 0, 0);
  const hecha = C.anotarse(G, "caro@lid", ahora);
  assert.equal(hecha.texto, "🧰 *Changa hecha* — Mudanza de la abuela\n🪙 @beto y @caro cobran *50 UruCoins* cada uno.\nPagó @ana, de su bolsillo.");
  assert.deepEqual(hecha.mentions, ["beto@lid", "caro@lid", "ana@lid"]);
  assert.deepEqual(["ana@lid", "beto@lid", "caro@lid"].map((q) => saldo(G, q)), [300, 50, 50]);

  // With no team, the money goes back.
  const otra = publicar("ana@lid", "3 100 Pintar el quincho");
  assert.equal(saldo(G, "ana@lid"), 0);
  C.anotarse(G, "beto@lid", ahora);
  dados(1);
  const vencida = C.vencerChanga(otra.id, C.changaAbierta(G).vence);
  assert.equal(vencida.texto, "🦗 La changa «Pintar el quincho» quedó sin equipo. Se anotó @beto, y hacían falta 3: nadie cobra.\nAsí no levantamos el país, muchachos.\nA @ana le vuelven sus 300 UruCoins.");
  assert.deepEqual(vencida.mentions, ["beto@lid", "ana@lid"]);
  assert.equal(saldo(G, "ana@lid"), 300);

  // The day's cap per person.
  for (let i = 0; i < C.CHANGA.USUARIO_MAX_DIA - 2; i++) {
    const id = publicar("ana@lid", "2 10 Changa de relleno").id;
    C.vencerChanga(id, C.changaAbierta(G).vence);
  }
  assert.match(publicar("ana@lid", "2 10 Una más").error, /Ya publicaste 3 changas hoy/);
  fijarSaldo(F, G, "beto@lid", 100);
  assert.ok(publicar("beto@lid", "2 10 La de Beto").ok, "el tope es de cada uno");
});

test("reaccionar al mensaje de la changa es anotarse; sacar la reacción, borrarse; y no cuenta para monedas ni ranking", async () => {
  const G = "reaccion@g.us";
  const R = await import("../lib/reacciones.js");
  const client = clienteFalso();
  const changa = await abierta(G, client);
  db.prepare(`UPDATE changas SET vence = ? WHERE id = ?`).run(Date.now() + 60000, changa.id);
  const reaccion = (quien, text = "👍", id = changa.mensaje_id, extra = {}) => ({ key: { remoteJid: G, id, fromMe: true, participant: "bot@lid" }, reaction: { text, key: { participant: quien, ...extra } } });
  const antes = globalThis.enviados.length;

  assert.equal(C.reaccionAChanga(client, reaccion("ana@lid", "👍", "OTRO")), false, "a otro mensaje no es de la changa");
  assert.equal(C.reaccionAChanga(client, reaccion("bot@lid", "👍", changa.mensaje_id, { fromMe: true })), true);
  assert.deepEqual(C.anotadosEn(changa.id), [], "la reacción del bot no anota a nadie");

  R.contarReaccion(client, reaccion("ana@lid"));
  assert.deepEqual(C.anotadosEn(changa.id), ["ana@lid"]);
  assert.equal(saldo(G, "ana@lid"), 0, "anotarse no paga por reaccionar");
  assert.equal(globalThis.enviados.length, antes, "anotarse reaccionando no dice nada");
  R.contarReaccion(client, reaccion("ana@lid", ""));
  assert.deepEqual(C.anotadosEn(changa.id), [], "sacó la reacción");
  R.contarReaccion(client, reaccion("ana@lid", "🔥"));
  R.contarReaccion(client, reaccion("ana@lid", "💪"));
  assert.deepEqual(C.anotadosEn(changa.id), ["ana@lid"], "cambiar de emoji no la anota dos veces");

  // The one that completes the team gets the job done, and the group is told.
  dados(99);
  R.contarReaccion(client, reaccion("beto@lid"));
  await new Promise((r) => setImmediate(r));
  assert.equal(globalThis.enviados.length, antes + 1);
  assert.match(ultimoEnviado().msg.text, /^🧰 \*Changa hecha\*.*\n.*\n🪙 @ana y @beto cobran \*60 UruCoins\* cada uno\.$/);
  assert.deepEqual(ultimoEnviado().msg.mentions, ["ana@lid", "beto@lid"]);
  assert.equal(saldo(G, "beto@lid"), 60);
  // Done, a reaction to that message is one more reaction.
  assert.equal(C.reaccionAChanga(client, reaccion("caro@lid")), false);
});

test("los comandos: .changas on|off es de admins, .changa publica y .anotarme anota", async () => {
  const G = "comandos@g.us";
  const client = clienteFalso();
  const Changas = (await import("../plugins/coins-changas.js")).default;
  const Config = (await import("../plugins/grupo-config.js")).default;
  F.initDataDB({ chat: G, sender: "ana@lid", senderJid: "", pushName: "Ana" });
  const correr = async (sender, texto, permisos = {}) => {
    const [command, ...args] = texto.slice(1).split(/\s+/);
    await Changas.run({ chat: G, sender, isGroup: true, text: texto }, { client, command, args, text: args.join(" "), isAdmin: false, isOwner: false, ...permisos });
    return ultimoEnviado().msg;
  };
  assert.deepEqual(Changas.cmd, ["changa", "changas", "anotarme"]);
  assert.ok(Changas.economia && Changas.onlyGroup);

  assert.match((await correr("ana@lid", ".changas")).text, /^🧰 Ahora no hay ninguna changa abierta\.\n\nLas mías están \*apagadas\*.*\.changas on\n\nCualquiera puede publicar una pagándola: \.changa 3 50 Mudanza de la abuela/);
  await correr("ana@lid", ".changas on");
  assert.equal(F.getChat(G).changas, 0, "prenderlas es de admins");
  assert.match((await correr("ana@lid", ".changas on", { isAdmin: true })).text, /cada tanto voy a publicar una changa/);
  assert.equal(F.getChat(G).changas, 1);
  assert.match((await correr("ana@lid", ".changa")).text, /Las mías están \*prendidas\*/);
  await Config.run({ chat: G, sender: "ana@lid" }, { client, groupMetadata: { subject: "Grupo", id: G, participants: [] }, chat: F.getChat(G) });
  assert.match(ultimoEnviado().msg.text, /\n✅ Changas grupales por mi cuenta \(\.changas\)\n/);
  assert.match((await correr("ana@lid", ".changa off", { isOwner: true })).text, /no publico más changas por mi cuenta/);
  assert.equal(F.getChat(G).changas, 0);

  assert.match((await correr("beto@lid", ".anotarme")).text, /❌ No hay ninguna changa abierta ahora\./);
  assert.match((await correr("ana@lid", ".changa 2 30 Cortar el pasto")).text, /❌ Para pagarle 30 a 2 personas hacen falta 60 UruCoins y tenés 0\./);
  fijarSaldo(F, G, "ana@lid", 60);
  const anuncio = await correr("ana@lid", ".changa 2 30 Cortar el pasto");
  assert.match(anuncio.text, /^🧰 \*CHANGA de @ana\* — Cortar el pasto/);
  assert.deepEqual(anuncio.mentions, ["ana@lid"]);
  assert.match(C.changaAbierta(G).mensaje_id, /^MSG\d+$/, "queda anotado como qué mensaje salió, para las reacciones");
  assert.match((await correr("beto@lid", ".anotarme")).text, /^✍️ Anotado para «Cortar el pasto»\. Van 1 de 2: falta 1\.$/);
  const hecha = await correr("caro@lid", ".anotarme");
  assert.match(hecha.text, /^🧰 \*Changa hecha\* — Cortar el pasto\n🪙 @beto y @caro cobran \*30 UruCoins\* cada uno\.\nPagó @ana, de su bolsillo\.$/);
  assert.deepEqual(hecha.mentions, ["beto@lid", "caro@lid", "ana@lid"]);
});
