import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, ultimoEnviado } from "./helpers.mjs";

// The payday scenes (lib/escenas.js): some paydays come as a scene with options instead of the day's event; what one
// chooses is rolled with the bank's numbers, pays a multiple of the day's wage and moves the person's fame, which
// makes a nickname and changes the scenes to come.
let F, L, E, B;
before(async () => {
  ({ F } = await prepararBase("escenas"));
  L = await import("../lib/laburos.js");
  E = await import("../lib/escenas.js");
  B = await import("../lib/escenas-banco.js");
  E._dep.pueblo = () => true; // the scenes come only in a town; these tests play in one
});

// The dice, loaded: each call takes the next number, and 0 once they run out.
const dados = (...tiros) => {
  E._dep.azar = () => tiros.shift() ?? 0;
};
const SALE_ESCENA = 0; // under ESCENA.CHANCE
const NO_SALE = 99;
const saldo = (chat, quien) => F.getSaldoCoins(chat, quien);
const fila = (chat, quien) => db.prepare(`SELECT * FROM laburos WHERE chat = ? AND usuario = ?`).get(chat, quien);
const fama = (chat, quien, picaro, valiente) => db.prepare(`INSERT OR REPLACE INTO laburos_fama (chat, usuario, picaro, valiente, escenas, ultima) VALUES (?, ?, ?, ?, 0, '')`).run(chat, quien, picaro, valiente);
// Someone with a trade and their first scene of it open (the dice at 0 deal the trade's first one).
function conEscena(chat, quien, oficio = "camionero") {
  assert.ok(L.tomarLaburo(chat, quien, oficio).ok);
  dados(SALE_ESCENA, 0);
  const r = E.cobrarConEscena(chat, quien);
  assert.ok(r.ok && r.escena, r.error);
  return { r, abierta: E.escenaAbierta(chat, quien) };
}

test("el banco: cuatro escenas por oficio, cada una con su opción de no hacer nada y números que no regalan ni roban", () => {
  const { MULT_MIN, MULT_MAX, VALOR_MIN, VALOR_MAX } = E.ESCENA;
  assert.deepEqual(Object.keys(B.ESCENAS).sort(), Object.keys(L.OFICIOS).sort(), "cada oficio tiene sus escenas");
  const todas = [...Object.entries(B.ESCENAS).flatMap(([oficio, escenas]) => escenas.map((e) => [`${oficio}/${e.id}`, e])), ...B.ESCENAS_GENERALES.map((e) => [`general/${e.id}`, e])];
  assert.equal(new Set(todas.map(([clave]) => clave)).size, todas.length, "ninguna clave repetida");
  for (const escenas of Object.values(B.ESCENAS)) assert.ok(escenas.length >= 4);
  assert.ok(B.ESCENAS_GENERALES.filter((e) => !e.pide).length >= 4);
  for (const polo of Object.keys(E.POLOS)) assert.ok(B.ESCENAS_GENERALES.some((e) => e.pide === polo), `una escena propia de la fama de ${polo}`);

  for (const [clave, escena] of todas) {
    assert.ok(escena.texto.length > 20, clave);
    assert.ok(escena.opciones.length >= 2 && escena.opciones.length <= 3, `${clave}: dos o tres opciones`);
    assert.equal(escena.opciones.filter((o) => o.pasiva).length, 1, `${clave}: una sola opción de no hacer nada`);
    assert.ok(!escena.pide || E.POLOS[escena.pide], clave);
    assert.equal(E.buscarEscena(clave), escena);
    for (const o of escena.opciones) {
      const donde = `${clave} → ${o.nombre}`;
      assert.ok(o.nombre && o.nombre.length <= 50, donde);
      assert.ok(Number.isInteger(o.chance) && o.chance >= 25 && o.chance <= 100, donde);
      // Only the sure ones have no bad ending, and the "do nothing" one is sure.
      assert.equal(o.chance === 100, o.mal === null, donde);
      if (o.pasiva) assert.equal(o.chance, 100, donde);
      const finales = [o.bien, o.mal].filter(Boolean);
      for (const [mult, texto] of finales) {
        assert.ok(mult >= MULT_MIN && mult <= MULT_MAX, `${donde}: ×${mult}`);
        assert.ok(texto.length > 10, donde);
      }
      if (o.mal) assert.ok(o.bien[0] > o.mal[0], `${donde}: salir bien paga más que salir mal`);
      const valor = (o.chance * o.bien[0] + (100 - o.chance) * (o.mal?.[0] ?? 0)) / 100;
      assert.ok(valor >= VALOR_MIN && valor <= VALOR_MAX, `${donde}: paga ${valor.toFixed(2)} en promedio`);
      for (const [eje, n] of Object.entries(o.rep)) assert.ok(["picaro", "valiente"].includes(eje) && Number.isInteger(n) && n !== 0 && Math.abs(n) <= 4, donde);
    }
  }

  // A nickname for each trade and each fame, in both genders.
  for (const oficio of Object.keys(L.OFICIOS)) {
    for (const polo of Object.keys(E.POLOS)) {
      const apodo = B.APODOS[oficio]?.[polo];
      assert.ok(typeof apodo === "string" ? apodo.length > 3 : apodo?.length === 2 && apodo.every((a) => a.length > 3), `${oficio}/${polo}`);
    }
  }
});

test(".cobrar sin escena es el cobro de siempre", () => {
  const G = "sinescena@g.us";
  assert.ok(L.tomarLaburo(G, "ana@lid", "tambero").ok);
  dados(NO_SALE);
  const r = E.cobrarConEscena(G, "ana@lid");
  assert.ok(r.ok && !r.escena);
  assert.match(r.mensaje, /Cobraste \*\d+ UruCoins\*/);
  assert.equal(E.escenaAbierta(G, "ana@lid"), null);
  dados(SALE_ESCENA);
  assert.match(E.cobrarConEscena(G, "ana@lid").error, /Ya cobraste hoy/, "ni con los dados a favor hay segunda vuelta");
  assert.match(E.cobrarConEscena(G, "nadie@lid").error, /No tenés laburo/);
});

test("una escena al cobrar: toma el día, no paga hasta que se elige, y la opción que sale bien paga su múltiplo", () => {
  const G = "escena@g.us";
  const { r, abierta } = conEscena(G, "ana@lid");
  assert.match(r.mensaje, /^🚛 \*Hoy el sueldo viene con escena\*\n\nTe para la caminera/);
  assert.match(r.mensaje, /1️⃣ Coimear\n2️⃣ Discutir\n3️⃣ Pagar la multa/);
  assert.match(r.mensaje, /En juego, tu jornal de hoy: \d+ UruCoins/);
  assert.match(r.mensaje, /o \.elegir 2\)\. Tenés 10 minutos; si no, va la 3\./);
  assert.equal(abierta.escena, "camionero/caminera");
  assert.equal(saldo(G, "ana@lid"), 0, "todavía no cobró");
  assert.equal(fila(G, "ana@lid").cobros, 1, "el día cuenta para el nivel desde ya");
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM pendientes WHERE chat = ? AND tipo = 'escena_laburo' AND estado = 'pendiente'`).get(G).n, 1);

  // Collecting again doesn't deal another one, nor pays.
  dados(SALE_ESCENA);
  assert.match(E.cobrarConEscena(G, "ana@lid").error, /Primero resolvé la escena de hoy.*\.elegir 2/);
  assert.match(E.elegirEnEscena(G, "ana@lid", 4).error, /del 1 al 3/);
  assert.match(E.elegirEnEscena(G, "ana@lid", NaN).error, /del 1 al 3/);
  assert.ok(E.escenaAbierta(G, "ana@lid"), "una opción que no existe no la cierra");

  // 1, coimear: 50 % of going well, ×1.5, and +2 pícaro, +1 valiente.
  dados(49);
  const fin = E.elegirEnEscena(G, "ana@lid", 1);
  assert.ok(fin.ok && fin.salioBien);
  assert.equal(fin.cobrado, Math.round(abierta.jornal * 1.5));
  assert.equal(saldo(G, "ana@lid"), fin.cobrado);
  assert.match(fin.texto, /^🚛 \*Coimear\.\* .*Había\./);
  assert.match(fin.texto, new RegExp(`Cobraste \\*${fin.cobrado} UruCoins\\* \\(el jornal ×1,5\\)\\. Tenés ${fin.cobrado}\\.`));
  assert.match(fin.texto, /🎭 Fama: \+2 pícaro, \+1 valiente\./);
  assert.deepEqual(fin.mentions, []);
  const f = E.famaDe(G, "ana@lid");
  assert.deepEqual([f.picaro, f.valiente, f.escenas, f.ultima], [2, 1, 1, "camionero/caminera"]);
  assert.equal(E.escenaAbierta(G, "ana@lid"), null);
  assert.equal(E.elegirEnEscena(G, "ana@lid", 1), null, "sin escena abierta no hay nada que elegir");
  assert.match(E.cobrarConEscena(G, "ana@lid").error, /Ya cobraste hoy/);
});

test("la misma opción, cuando sale mal, paga lo que dice su mal final; la fama se mueve igual", () => {
  const G = "mal@g.us";
  const { abierta } = conEscena(G, "ana@lid");
  dados(50); // 50 % of going well: 50 is already the other half
  const fin = E.elegirEnEscena(G, "ana@lid", 1);
  assert.equal(fin.salioBien, false);
  assert.equal(fin.cobrado, Math.round(abierta.jornal * 0.3));
  assert.match(fin.texto, /con vocación/);
  assert.equal(E.famaDe(G, "ana@lid").picaro, 2);
});

test("sin respuesta en el plazo se resuelve sola con la opción de no hacer nada, y se le avisa nombrándolo", () => {
  const G = "sola@g.us";
  const { abierta } = conEscena(G, "ana@lid");
  assert.equal(E.vencerEscena(G, "ana@lid", abierta.vence - 1000), null, "antes de hora no");
  const fin = E.vencerEscena(G, "ana@lid", abierta.vence);
  assert.match(fin.texto, /^⏰ @ana no contestó a tiempo y la escena se resolvió sola\.\n🚛 \*Pagar la multa\.\*/);
  assert.deepEqual(fin.mentions, ["ana@lid"]);
  assert.equal(saldo(G, "ana@lid"), Math.round(abierta.jornal * 0.7));
  assert.match(fin.texto, /🎭 Fama: \+1 honesto, \+1 cagón\./);
  assert.equal(E.vencerEscena(G, "ana@lid", abierta.vence), null, "ya está resuelta");

  // Answered in time, the pending work finds nothing to do.
  const otra = conEscena(G, "beto@lid").abierta;
  dados(0);
  assert.ok(E.elegirEnEscena(G, "beto@lid", 2).ok);
  assert.equal(E.vencerEscena(G, "beto@lid", otra.vence), null);

  // With the economy switched off meanwhile, the wage is paid without a word.
  const callada = conEscena(G, "caro@lid").abierta;
  F.initDataDB({ chat: G, sender: "caro@lid", senderJid: "", pushName: "Caro" }); // the chat's row, for the switch
  F.updateChat(G, { monedas: 0 });
  assert.equal(E.vencerEscena(G, "caro@lid", callada.vence), null);
  assert.equal(saldo(G, "caro@lid"), Math.round(callada.jornal * 0.7));
});

test("el pendiente de una escena vencida la resuelve y lo dice en el grupo; .cobrar antes de que pase, también", async () => {
  const G = "pendiente@g.us";
  const P = await import("../lib/pendientes.js");
  const client = clienteFalso();
  conEscena(G, "ana@lid");
  conEscena(G, "beto@lid");
  db.prepare(`UPDATE laburos_escenas SET vence = ? WHERE chat = ?`).run(Date.now() - 1000, G);
  // Beto collects again before the pending work gets to it: it resolves right there.
  const r = E.cobrarConEscena(G, "beto@lid");
  assert.match(r.mensaje, /@beto no contestó a tiempo/);
  db.prepare(`UPDATE pendientes SET ejecutar_en = ? WHERE chat = ?`).run(Date.now() - 1000, G);
  await P.procesarPendientes(client);
  const delGrupo = globalThis.enviados.filter((e) => e.chat === G);
  assert.equal(delGrupo.length, 1, "la de Beto ya estaba resuelta: un solo aviso");
  assert.match(delGrupo[0].msg.text, /@ana no contestó a tiempo/);
  assert.deepEqual(delGrupo[0].msg.mentions, ["ana@lid"]);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM pendientes WHERE chat = ? AND estado = 'pendiente'`).get(G).n, 0);
});

test("la fama: pasado el umbral da un apodo del oficio, en el género de la persona, y tiene tope", () => {
  const G = "fama@g.us";
  F.initDataDB({ chat: G, sender: "eva@lid", senderJid: "", pushName: "Eva" });
  F.updateUser("eva@lid", { genero: "mujer" });
  assert.equal(E.apodoDe(G, "ana@lid"), "", "sin laburo ni fama");
  assert.equal(E.lineaDeFama(G, "ana@lid"), "");

  // Ana has 2 of pícaro: one more coima (+2) takes her to the threshold, and the nickname is announced.
  conEscena(G, "ana@lid");
  fama(G, "ana@lid", E.ESCENA.FAMA_UMBRAL - 2, 0);
  assert.equal(E.apodoDe(G, "ana@lid"), "");
  dados(0);
  const fin = E.elegirEnEscena(G, "ana@lid", 1);
  assert.match(fin.texto, /🏷️ Te ganaste un apodo: de ahora en más, en este grupo sos \*el Coimero de la Ruta 5\*\./);
  assert.equal(E.apodoDe(G, "ana@lid"), "el Coimero de la Ruta 5");
  assert.equal(E.lineaDeFama(G, "ana@lid"), "🎭 Fama: *el Coimero de la Ruta 5* · pícaro 4, valiente 1 (de 10)");
  assert.match(E.famaParaPrompt(G, "ana@lid", "Ana"), /Ana se ganó fama de pícaro y el apodo "el Coimero de la Ruta 5"/);

  // The strongest fame names; on a tie, honesto ↔ pícaro. And each side has its own.
  fama(G, "ana@lid", 4, 5);
  assert.equal(E.apodoDe(G, "ana@lid"), "el Loco del Atajo");
  fama(G, "ana@lid", -5, 5);
  assert.equal(E.apodoDe(G, "ana@lid"), "el Santo de la Balanza");
  fama(G, "ana@lid", 0, -4);
  assert.equal(E.apodoDe(G, "ana@lid"), "el Ochenta por Hora");
  assert.equal(E.lineaDeFama(G, "ana@lid"), "🎭 Fama: *el Ochenta por Hora* · cagón 4 (de 10)");
  fama(G, "ana@lid", 0, -3);
  assert.equal(E.apodoDe(G, "ana@lid"), "");
  assert.equal(E.famaParaPrompt(G, "ana@lid", "Ana"), "");
  assert.equal(E.lineaDeFama(G, "ana@lid"), "🎭 Fama: cagón 3 (de 10)");

  // A woman's, and the nickname follows the trade she has now.
  assert.ok(L.tomarLaburo(G, "eva@lid", "tambero").ok);
  fama(G, "eva@lid", -6, -4);
  assert.equal(E.apodoDe(G, "eva@lid"), "la Reina del Ordeñe");
  assert.equal(E.lineaDeFama(G, "eva@lid"), "🎭 Fama: *la Reina del Ordeñe* · honesta 6, cagona 4 (de 10)");
  db.prepare(`UPDATE laburos SET laburo = 'dj' WHERE chat = ? AND usuario = ?`).run(G, "eva@lid");
  assert.equal(E.apodoDe(G, "eva@lid"), "la Fiel a la Lista");

  // The cap, and losing the nickname by going the other way.
  conEscena(G, "beto@lid");
  fama(G, "beto@lid", E.ESCENA.FAMA_MAX, 4);
  dados(0);
  E.elegirEnEscena(G, "beto@lid", 1);
  assert.equal(E.famaDe(G, "beto@lid").picaro, E.ESCENA.FAMA_MAX);
  conEscena(G, "caro@lid");
  fama(G, "caro@lid", 4, 0);
  const lavada = E.elegirEnEscena(G, "caro@lid", 3); // paying the fine: +1 honesto
  assert.match(lavada.texto, /🏷️ Se te lavó la fama: ya nadie te dice el Coimero de la Ruta 5\./);
});

test("la fama cambia las escenas que tocan: más controles al pícaro, menos al honesto, y las propias de cada fama", () => {
  const { PESO_OFICIO, PESO_GENERAL, PESO_FAMA, PESO_CONTROL_PICARO, PESO_CONTROL_HONESTO } = E.ESCENA;
  const sinFama = { picaro: 0, valiente: 0, ultima: "" };
  const peso = (lista, clave) => lista.find((c) => c.clave === clave)?.peso;
  const normal = E.escenasPara("camionero", sinFama);
  assert.equal(normal.length, 4 + B.ESCENAS_GENERALES.filter((e) => !e.pide).length);
  assert.equal(peso(normal, "camionero/caminera"), PESO_OFICIO);
  assert.equal(peso(normal, "general/paro"), PESO_GENERAL);
  assert.equal(peso(normal, "general/inspeccion-sorpresa"), undefined, "la inspección sorpresa es para el pícaro conocido");

  const picaro = E.escenasPara("camionero", { ...sinFama, picaro: E.ESCENA.FAMA_UMBRAL });
  assert.equal(peso(picaro, "camionero/caminera"), PESO_OFICIO * PESO_CONTROL_PICARO, "al pícaro conocido lo paran más");
  assert.equal(peso(picaro, "camionero/atajo"), PESO_OFICIO, "lo que no es un control, igual");
  assert.equal(peso(picaro, "general/inspeccion-sorpresa"), PESO_FAMA * PESO_CONTROL_PICARO);
  assert.equal(peso(picaro, "general/caja-chica"), undefined);

  const honesto = E.escenasPara("camionero", { ...sinFama, picaro: -E.ESCENA.FAMA_UMBRAL });
  assert.equal(peso(honesto, "camionero/caminera"), PESO_OFICIO * PESO_CONTROL_HONESTO);
  assert.equal(peso(honesto, "general/caja-chica"), PESO_FAMA);
  assert.ok(peso(E.escenasPara("dj", { ...sinFama, valiente: 9 }), "general/lo-bravo"));
  assert.ok(peso(E.escenasPara("dj", { ...sinFama, valiente: -9 }), "general/nadie-te-llama"));
  assert.equal(peso(E.escenasPara("dj", { ...sinFama, valiente: 3 }), "general/lo-bravo"), undefined, "bajo el umbral, nada");

  // The last one isn't dealt again right away.
  assert.equal(peso(E.escenasPara("camionero", { ...sinFama, ultima: "camionero/caminera" }), "camionero/caminera"), undefined);
  const G = "repite@g.us";
  conEscena(G, "ana@lid");
  dados(0);
  E.elegirEnEscena(G, "ana@lid", 3);
  db.prepare(`UPDATE laburos SET ultimo_cobro = '' WHERE chat = ?`).run(G);
  dados(SALE_ESCENA, 0);
  E.cobrarConEscena(G, "ana@lid");
  assert.equal(E.escenaAbierta(G, "ana@lid").escena, "camionero/atajo");
});

test("el nivel y la racha doble van en el jornal de la escena, y la subida de nivel se avisa al abrirla", () => {
  const G = "nivel@g.us";
  assert.ok(L.tomarLaburo(G, "ana@lid", "camionero").ok);
  db.prepare(`UPDATE laburos SET cobros = 6 WHERE chat = ? AND usuario = ?`).run(G, "ana@lid"); // level 2, one payday from 3
  const base = L.sueldoActual("camionero");
  dados(SALE_ESCENA, 0);
  const r = E.cobrarConEscena(G, "ana@lid");
  assert.match(r.mensaje, /\(nivel 2, \+5 %\)/);
  assert.match(r.mensaje, /⬆️ Subiste a nivel 3 de camionero/);
  assert.ok(Math.abs(E.escenaAbierta(G, "ana@lid").jornal - base * 1.05) < 1e-9);
});

test("los comandos: .cobrar abre la escena, un número suelto o citándola la contesta, y .elegir también", async () => {
  const G = "comandos@g.us";
  const client = clienteFalso();
  const Laburos = (await import("../plugins/coins-laburos.js")).default;
  const Hook = (await import("../plugins/_escenas.js")).default;
  const m = (sender, text, extra = {}) => ({ chat: G, sender, isGroup: true, message: {}, text, mentionedJid: [], ...extra });
  const correr = async (sender, texto) => {
    const [command, ...args] = texto.slice(1).split(/\s+/);
    await Laburos.run(m(sender, texto), { client, command, args, text: args.join(" ") });
    return ultimoEnviado().msg;
  };
  const suelto = async (sender, texto, extra = {}) => {
    const antes = globalThis.enviados.length;
    const mensaje = m(sender, texto, extra);
    await Hook.before(mensaje, { client, chat: F.getChat(G) });
    return { mensaje, dicho: globalThis.enviados.length > antes ? ultimoEnviado().msg.text : null };
  };
  F.initDataDB({ chat: G, sender: "ana@lid", senderJid: "", pushName: "Ana" }); // the chat's row, for its switches
  for (const quien of ["ana@lid", "beto@lid", "caro@lid"]) assert.ok(L.tomarLaburo(G, quien, "camionero").ok);

  assert.match((await correr("ana@lid", ".elegir 2")).text, /No tenés ninguna escena para resolver/);
  dados(SALE_ESCENA, 0);
  assert.match((await correr("ana@lid", ".cobrar")).text, /Hoy el sueldo viene con escena/);
  const idEscena = E.escenaAbierta(G, "ana@lid").mensaje_id;
  assert.match(idEscena, /^MSG\d+$/, "queda anotado como qué mensaje salió");

  // Not hers: somebody else's number, a number that isn't an option, one another game took, one quoting something else.
  assert.equal((await suelto("beto@lid", "1")).dicho, null);
  assert.equal((await suelto("ana@lid", "4")).dicho, null);
  assert.equal((await suelto("ana@lid", "dale, la 2")).dicho, null);
  assert.equal((await suelto("ana@lid", "2", { respuestaDeJuego: true })).dicho, null);
  assert.equal((await suelto("ana@lid", "2", { quoted: { id: "OTRO" } })).dicho, null);
  assert.ok(E.escenaAbierta(G, "ana@lid"));

  // Quoting the scene, it's hers even with another game on.
  dados(0);
  const citada = await suelto("ana@lid", " 2 ", { quoted: { id: idEscena }, respuestaDeJuego: true });
  assert.match(citada.dicho, /\*Discutir\.\*/);
  assert.equal(E.escenaAbierta(G, "ana@lid"), null);

  // A bare number, and the message is marked so Claudia and the other games leave it alone.
  dados(SALE_ESCENA, 0);
  await correr("beto@lid", ".cobrar");
  dados(0);
  const r = await suelto("beto@lid", "3");
  assert.match(r.dicho, /\*Pagar la multa\.\*/);
  assert.equal(r.mensaje.respuestaDeJuego, true);
  assert.equal((await suelto("beto@lid", "3")).dicho, null, "sin escena, un 3 es un 3");

  // .elegir, and with the economy off the bare number isn't read.
  dados(SALE_ESCENA, 0);
  await correr("caro@lid", ".cobrar");
  assert.match((await correr("caro@lid", ".elegir 9")).text, /❌ Las opciones van del 1 al 3/);
  F.updateChat(G, { monedas: 0 });
  assert.equal((await suelto("caro@lid", "1")).dicho, null);
  F.updateChat(G, { monedas: 1 });
  dados(0);
  assert.match((await correr("caro@lid", ".elegir 1")).text, /\*Coimear\.\*/);
});

test("la fama se ve: el apodo en .perfil y al lado del oficio en .baltop", async () => {
  const G = "sevé@g.us";
  const Pf = await import("../lib/perfil.js");
  const Top = (await import("../plugins/coins-baltop.js")).default;
  const client = clienteFalso();
  for (const [quien, nombre] of [["ana@lid", "Ana"], ["beto@lid", "Beto"]]) F.initDataDB({ chat: G, sender: quien, senderJid: "", pushName: nombre });
  for (const quien of ["ana@lid", "beto@lid"]) {
    assert.ok(L.tomarLaburo(G, quien, "dj").ok);
    F.moverCoins(G, quien, quien === "ana@lid" ? 200 : 100, "test_carga");
  }
  assert.doesNotMatch(Pf.textoPerfil(G, "ana@lid", F.getUser("ana@lid"), true).texto, /Fama/);
  fama(G, "ana@lid", 0, -5);
  fama(G, "beto@lid", 2, 0);
  assert.match(Pf.textoPerfil(G, "ana@lid", F.getUser("ana@lid"), true).texto, /\n💼 🎧 DJ, nivel 1; faltan 3 cobros para el nivel 2\n🎭 Fama: \*el Patovica Arrepentido\* · cagón 5 \(de 10\)\n/);
  assert.match(Pf.textoPerfil(G, "beto@lid", F.getUser("beto@lid")).texto, /\n🎭 Fama: pícaro 2 \(de 10\)\n/);
  // With the economy off the record shows no job, and no fame either.
  F.updateChat(G, { monedas: 0 });
  assert.doesNotMatch(Pf.textoPerfil(G, "ana@lid", F.getUser("ana@lid"), true).texto, /Fama/);
  F.updateChat(G, { monedas: 1 });

  await Top.run({ chat: G, sender: "ana@lid", isGroup: true }, { client, text: "" });
  assert.match(ultimoEnviado().msg.text, /1\. Ana \(🎧 DJ, «el Patovica Arrepentido»\) — \*200\*\n2\. Beto \(🎧 DJ\) — \*100\*/);
});

test("sin pueblo prendido no hay escenas: .cobrar queda como siempre", () => {
  const chat = "sinpueblo@g.us";
  const quien = "nadie@s.whatsapp.net";
  assert.ok(L.tomarLaburo(chat, quien, "camionero").ok);
  const antes = E._dep.pueblo;
  E._dep.pueblo = () => false;
  try {
    dados(SALE_ESCENA, 0);
    const r = E.cobrarConEscena(chat, quien);
    assert.ok(r.ok && !r.escena, "cobra el sueldo de siempre");
    assert.equal(E.escenaAbierta(chat, quien), null);
  } finally {
    E._dep.pueblo = antes;
  }
});
