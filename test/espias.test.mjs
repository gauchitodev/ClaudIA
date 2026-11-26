import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, fijarSaldo } from "./helpers.mjs";

// The secret missions (lib/espias.js, plugins/espias-agente.js, espias-grupo.js and _espias.js): signing up in
// private for a secret emoji, the envelope posted to the group, the mission read in private, the word caught in the
// group's messages, the reports and the deadline. And what it must never do: write first in private, or play where
// nobody asked for it.
let F, E, A, I, Cache, Agente, Grupo, Hook, client;
const G = "espias@g.us";
const ANA = "300000000000041@lid";
const BETO = "300000000000042@lid";
const CARLA = "300000000000043@lid";
const DANI = "300000000000044@lid";
const num = (lid) => `598${lid.slice(-8, -4)}@s.whatsapp.net`;
const PRIVADO = (lid) => num(lid);
const GENTE = [ANA, BETO, CARLA, DANI];

before(async () => {
  ({ F } = await prepararBase("espias"));
  E = await import("../lib/espias.js");
  A = await import("../lib/actividad.js");
  I = await import("../lib/intencion.js");
  Cache = await import("../lib/cache-grupos.js");
  Agente = (await import("../plugins/espias-agente.js")).default;
  Grupo = (await import("../plugins/espias-grupo.js")).default;
  Hook = (await import("../plugins/_espias.js")).default;
});

// The dice, loaded: each call takes the next number (within what was asked for, as real dice are), and 0 once they
// run out.
const dados = (...tiros) => {
  E._dep.azar = (n) => (tiros.shift() ?? 0) % n;
};
const aLas = (hora, minutos = 0) => {
  const d = new Date();
  d.setHours(hora, minutos, 0, 0);
  return d;
};
const saldo = (quien, chat = G) => F.getSaldoCoins(chat, quien);
const enviados = () => globalThis.enviados;
const ultimo = () => enviados().at(-1);

// A group with the game on, its people (listed by LID, with their number), the economy on and people talking.
function grupo(chat, { gente = GENTE, hora = 15, prendido = 1, nombre = "Los Espías" } = {}) {
  F.initDataDB({ chat, sender: ANA, senderJid: "", pushName: "Ana" });
  F.updateChat(chat, { espias: prendido });
  Cache.guardar(client, chat, { subject: nombre, participants: [...gente.map((id) => ({ id, phoneNumber: num(id) })), { id: "bot@lid" }] });
  for (let i = 0; i < 10; i++) F.sumarMensajeHora(chat, A.claveDia(), hora);
  for (const quien of gente) {
    F.initDataDB({ chat, sender: quien, senderJid: num(quien), pushName: quien.slice(-6, -4) });
    F.registrarMensajeGrupo(chat, [quien], aLas(hora).getTime());
  }
}
const msg = (sender, text, chat) => ({ chat, sender, senderJid: "", text, message: {}, isGroup: chat.endsWith("@g.us") });
// A command as handle-message.js runs it. In private the chat is the person's own.
async function privado(quien, texto) {
  const [command, ...args] = texto.split(/\s+/);
  await Agente.run(msg(quien, `.${texto}`, PRIVADO(quien)), { client, command, args, text: args.join(" ") });
  return ultimo();
}
async function enGrupo(quien, texto, { chat = G, isAdmin = false, mencion = null, participants = [] } = {}) {
  const [command, ...args] = texto.split(/\s+/);
  const plugin = Grupo.cmd.includes(command) ? Grupo : Agente;
  await plugin.run({ ...msg(quien, `.${texto}`, chat), mentionedJid: mencion ? [mencion] : [] }, { client, command, args, text: args.join(" "), isAdmin, participants, botSettings: {} });
  return ultimo();
}
// Ana and Beto signed up (🦊 and 🐊 with the dice at 0), and an envelope out at 15:00: Ana's, aimed at Beto, the word
// "chorizo".
async function conSobre(chat = G) {
  grupo(chat);
  dados();
  E.anotarAgente(chat, { usuario: ANA, jid: num(ANA) });
  E.anotarAgente(chat, { usuario: BETO, jid: num(BETO) });
  dados();
  const id = await E.lanzarSobre(client, chat, aLas(15));
  assert.ok(id, "tendría que haber salido el sobre");
  return E.misionAbierta(chat);
}
const T15 = () => aLas(15, 10).getTime();

beforeEach(() => {
  client = clienteFalso();
  for (const tabla of ["espias_agentes", "espias_misiones", "espias_denuncias", "pendientes", "periodos_cerrados", "presencia_grupo", "actividad_horaria", "actividad_diaria", "urucoins"]) globalThis.db.prepare(`DELETE FROM ${tabla}`).run();
  I._dep.probabilidades = () => null;
  E.ESPIA.REVELAR_AL_FALLAR = false;
});

test("el banco: palabras de una sola palabra, sin repetir, y emojis de sobra y distintos", () => {
  assert.ok(E.PALABRAS.length >= 60);
  assert.equal(new Set(E.PALABRAS.map(E.normalizar)).size, E.PALABRAS.length);
  for (const p of E.PALABRAS) {
    assert.match(E.normalizar(p), /^[a-z]{5,}$/, p);
    assert.ok(E.diceLaPalabra(`mirá ese ${p.toUpperCase()}, che`, p), p);
  }
  // No word of the bank is said by saying another one.
  for (const p of E.PALABRAS) for (const q of E.PALABRAS) if (p !== q) assert.ok(!E.diceLaPalabra(q, p), `${q} dice ${p}`);
  assert.ok(E.EMOJIS.length >= 30);
  assert.equal(new Set(E.EMOJIS).size, E.EMOJIS.length);
  for (const e of E.EMOJIS) assert.equal([...e].length, 1, `${e}: un solo code point`);
});

test("la palabra normalizada: sin tildes ni mayúsculas, en plural y en diminutivo, y solo como palabra entera", () => {
  for (const dicho of ["chorizo", "CHORIZO!!", "unos chorizos", "un choricito", "dos choricitos al pan", "chorizooo", "¿chorizo?"]) assert.ok(E.diceLaPalabra(dicho, "chorizo"), dicho);
  for (const dicho of ["chorizar", "achorizado", "choripán", "chori zo", ""]) assert.ok(!E.diceLaPalabra(dicho, "chorizo"), dicho);
  const casos = { ñandú: ["ñandu", "ÑANDÚES", "ñandús"], colchón: ["colchones", "colchoncito"], tambor: ["tambores", "tamborcito"], hormiga: ["hormiguita", "hormigas"], churrasco: ["churrasquito"], peaje: ["peajes", "peajecito"], dinosaurio: ["dinosaurito", "dinosaurios"], raviol: ["ravioles", "raviolitos"], fainá: ["faina", "fainás"], paraguas: ["paraguas"], heladera: ["heladerita", "heladeras"] };
  for (const [palabra, dichos] of Object.entries(casos)) for (const dicho of dichos) assert.ok(E.diceLaPalabra(dicho, palabra), `${dicho} → ${palabra}`);
});

test("viene apagada: sin .espias on no se agenda ni sale ningún sobre, y prenderla es de admins", async () => {
  F.initDataDB({ chat: "nuevo@g.us", sender: ANA, senderJid: "", pushName: "Ana" });
  assert.equal(F.getChat("nuevo@g.us").espias, 0);
  grupo(G, { prendido: 0 });
  E.anotarAgente(G, { usuario: ANA });
  E.anotarAgente(G, { usuario: BETO });
  for (let i = 0; i < 40; i++) F.sumarMensajeHora(G, A.claveDia(new Date(Date.now() - 86400000)), 12);
  assert.equal(E.programarSobresDelDia(aLas(12)), 0);
  assert.equal(await E.lanzarSobre(client, G, aLas(15)), null);
  assert.equal(enviados().length, 0);

  await enGrupo(CARLA, "espias on");
  assert.equal(F.getChat(G).espias, 0, "no es admin");
  assert.match((await enGrupo(CARLA, "espias on", { isAdmin: true })).msg.text, /prendida/);
  assert.equal(F.getChat(G).espias, 1);
  assert.match((await enGrupo(CARLA, "espias")).msg.text, /Hay 2 espías anotados/);
  await enGrupo(CARLA, "espias off", { isAdmin: true });
  assert.equal(F.getChat(G).espias, 0);
});

test("anotarse es por privado: .espia lista los grupos, .espia 1 da un emoji único y en el grupo no se muestra nada", async () => {
  grupo(G);
  grupo("otro@g.us", { gente: [BETO], nombre: "Otro" }); // Ana isn't in this one
  dados(0, 0, 0);
  assert.match((await privado(ANA, "espia")).msg.text, /1\. \*Los Espías\*: no estás anotado\. Te anotás con \.espia 1/);
  assert.doesNotMatch(ultimo().msg.text, /Otro/);
  const alta = await privado(ANA, "espia 1");
  assert.equal(alta.chat, PRIVADO(ANA));
  assert.match(alta.msg.text, /tu emoji secreto es 🦊/);
  assert.match((await privado(ANA, "espia 1")).msg.text, /Ya estabas anotado.*🦊/);
  // By a piece of the group's name, and another emoji for the next one.
  assert.match((await privado(BETO, "espia espias")).msg.text, /tu emoji secreto es 🐊/);
  assert.deepEqual(E.agentesDe(G).map((a) => [a.usuario, a.jid, a.emoji]), [[ANA, num(ANA), "🦊"], [BETO, num(BETO), "🐊"]]);
  assert.match((await privado(ANA, "espia")).msg.text, /\*Los Espías\*: sos 🦊/);
  assert.match((await privado(ANA, "espia 7")).msg.text, /^❌ No tengo ningún grupo con el número 7/);
  // Someone who isn't in any group that plays.
  assert.match((await privado("300000000000099@lid", "espia")).msg.text, /No estás en ningún grupo/);

  // In the group: a pointer to private, and nothing of who plays.
  const enElGrupo = await enGrupo(ANA, "espia 1");
  assert.equal(enElGrupo.chat, G);
  assert.match(enElGrupo.msg.text, /por privado/);
  assert.doesNotMatch(enElGrupo.msg.text, /🦊/);
  assert.doesNotMatch((await enGrupo(ANA, "sobre")).msg.text, /🦊/);

  // Out again.
  assert.match((await privado(ANA, "espia salir")).msg.text, /colgaste la gabardina en \*Los Espías\*/);
  assert.deepEqual(E.agentesDe(G).map((a) => a.usuario), [BETO]);
  assert.match((await privado(ANA, "espia salir")).msg.text, /No estás anotado en ningún grupo/);
});

test("el sobre: sale al grupo con el emoji, una vez por día, de día, con el grupo charlando y con espías anotados", async () => {
  grupo(G);
  dados();
  E.anotarAgente(G, { usuario: ANA, jid: num(ANA) });
  assert.equal(await E.lanzarSobre(client, G, aLas(15)), null, "con un solo espía no sale");
  E.anotarAgente(G, { usuario: BETO, jid: num(BETO) });
  assert.equal(await E.lanzarSobre(client, G, aLas(9)), null, "antes de hora");
  assert.equal(await E.lanzarSobre(client, G, aLas(E.ESPIA.HASTA_HORA)), null, "después de hora");
  assert.equal(await E.lanzarSobre(client, G, aLas(18)), null, "a las 18 el grupo no está charlando");
  F.updateChat(G, { monedas: 0 });
  assert.equal(await E.lanzarSobre(client, G, aLas(15)), null, "con la economía apagada");
  F.updateChat(G, { monedas: 1 });
  assert.equal(enviados().length, 0);

  dados();
  const id = await E.lanzarSobre(client, G, aLas(15));
  assert.ok(id);
  assert.equal(enviados().length, 1, "un solo mensaje");
  assert.equal(ultimo().chat, G, "y al grupo, no a un privado");
  assert.match(ultimo().msg.text, /^📩 Llegó un sobre para 🦊\n/);
  assert.doesNotMatch(ultimo().msg.text, /chorizo|300000000000/, "ni la palabra ni nadie");
  assert.equal(ultimo().msg.mentions, undefined);
  const mision = E.misionAbierta(G);
  assert.deepEqual([mision.agente, mision.emoji, mision.tipo, mision.palabra, mision.objetivo, mision.objetivo_jid, mision.premio, mision.abierta], [ANA, "🦊", "palabra", "chorizo", BETO, num(BETO), E.ESPIA.PREMIO, 0]);
  assert.equal(mision.vence, aLas(15).getTime() + E.ESPIA.PLAZO_MIN * 60000);
  const pendiente = globalThis.db.prepare(`SELECT * FROM pendientes WHERE tipo = 'espia_vence'`).get();
  assert.deepEqual([pendiente.chat, JSON.parse(pendiente.datos).id, pendiente.ejecutar_en], [G, id, mision.vence]);

  assert.equal(await E.lanzarSobre(client, G, aLas(15, 30)), null, "con uno abierto no sale otro");
  E.vencerMision(id, mision.vence);
  assert.equal(await E.lanzarSobre(client, G, aLas(15, 30)), null, "ni otro en el mismo día");
});

test("el objetivo es alguien que escribió hace poco y sigue en el grupo: nunca Claudia, ni el espía, ni quien se fue", async () => {
  grupo(G, { gente: [ANA, BETO] });
  // Carla wrote, and left; the bot "wrote" too; Dani is in the group and hasn't written for hours.
  F.registrarMensajeGrupo(G, [CARLA], aLas(15).getTime());
  F.registrarMensajeGrupo(G, ["bot@lid"], aLas(15).getTime());
  dados();
  E.anotarAgente(G, { usuario: ANA });
  E.anotarAgente(G, { usuario: BETO });
  for (const tiro of [0, 1, 2, 3]) {
    globalThis.db.prepare(`DELETE FROM espias_misiones`).run();
    dados(0, tiro);
    await E.lanzarSobre(client, G, aLas(15));
    assert.equal(E.misionAbierta(G).objetivo, BETO, `tiro ${tiro}`);
  }
  // With nobody to aim at, no envelope.
  globalThis.db.prepare(`DELETE FROM espias_misiones`).run();
  globalThis.db.prepare(`DELETE FROM presencia_grupo WHERE usuario = ?`).run(BETO);
  client = clienteFalso();
  assert.equal(await E.lanzarSobre(client, G, aLas(15)), null);
  assert.equal(enviados().length, 0);
});

test("el sobre no le toca dos veces seguidas al mismo, y la palabra no se repite", async () => {
  const primera = await conSobre();
  E.vencerMision(primera.id, primera.vence);
  globalThis.db.prepare(`UPDATE espias_misiones SET publicada = publicada - 86400000`).run();
  dados();
  await E.lanzarSobre(client, G, aLas(15));
  const segunda = E.misionAbierta(G);
  assert.equal(segunda.agente, BETO);
  assert.equal(segunda.emoji, "🐊");
  assert.notEqual(segunda.palabra, primera.palabra);
});

test(".sobre: solo el dueño del emoji recibe la misión, por privado y porque la pidió", async () => {
  const mision = await conSobre();
  const antes = enviados().length;
  assert.match((await privado(BETO, "sobre")).msg.text, /No hay ningún sobre para vos/);
  assert.match((await privado(CARLA, "sobre")).msg.text, /No hay ningún sobre para vos/);
  assert.equal(E.misionAbierta(G).abierta, 0);
  assert.match((await privado(ANA, "espia")).msg.text, /Tenés un sobre esperando/);
  const sobre = await privado(ANA, "sobre");
  assert.equal(sobre.chat, PRIVADO(ANA));
  assert.match(sobre.msg.text, /^📩 \*Sobre para 🦊\* · Los Espías\n/);
  assert.match(sobre.msg.text, /escriba la palabra \*«chorizo»\*/);
  assert.match(sobre.msg.text, new RegExp(`cobrás \\*${mision.premio} UruCoins\\*`));
  assert.doesNotMatch(sobre.msg.text, /@300000000000042/, "al objetivo se lo nombra, no se lo arroba");
  const abierta = E.misionAbierta(G).abierta;
  assert.ok(abierta > 0);
  // Asked again, the same mission, and the first opening stands.
  assert.match((await privado(ANA, "sobre")).msg.text, /«chorizo»/);
  assert.equal(E.misionAbierta(G).abierta, abierta);
  // Everything since the envelope went to whoever asked, in their own chat.
  for (const e of enviados().slice(antes)) assert.ok([PRIVADO(ANA), PRIVADO(BETO), PRIVADO(CARLA)].includes(e.chat));
});

test("Claudia nunca escribe primero por privado: fuera de las respuestas a un comando, todo va al grupo", async () => {
  const mision = await conSobre();
  E.abrirSobres([ANA], T15());
  E.leerMensaje(G, [CARLA], "chorizo", T15());
  E.denunciar(G, [CARLA], DANI, null, T15());
  E.vencerMision(mision.id, mision.vence);
  await E.lanzarSobre(client, G, aLas(15, 30));
  E.programarSobresDelDia(aLas(12));
  assert.deepEqual([...new Set(enviados().map((e) => e.chat))], [G]);
  // And the hook answers in the group it read the message in.
  const otra = await conSobre("otro-hook@g.us");
  E.abrirSobres([ANA], Date.now());
  globalThis.db.prepare(`UPDATE espias_misiones SET vence = ? WHERE id = ?`).run(Date.now() + 60000, otra.id);
  const m = msg(BETO, "me comí un choricito", "otro-hook@g.us");
  const copia = JSON.stringify(m);
  await Hook.before(m, { client });
  await new Promise((r) => setImmediate(r));
  assert.equal(ultimo().chat, "otro-hook@g.us");
  assert.match(ultimo().msg.text, /Misión cumplida/);
  assert.equal(JSON.stringify(m), copia, "el hook no le toca nada al mensaje");
});

test("la palabra: cuenta dicha por el objetivo, después de abierto el sobre; del espía o de otro, no", async () => {
  await conSobre();
  fijarSaldo(F, G, ANA, 0);
  assert.equal(E.leerMensaje(G, [BETO], "chorizo", T15()), null, "con el sobre sin abrir no cuenta");
  await privado(ANA, "sobre");
  globalThis.db.prepare(`UPDATE espias_misiones SET abierta = ?`).run(aLas(15, 5).getTime());
  assert.equal(E.leerMensaje(G, [ANA], "che beto, ¿chorizo?", T15()), null, "el espía la dice: no invalida");
  assert.equal(E.leerMensaje(G, [CARLA], "chorizo", T15()), null);
  assert.equal(E.leerMensaje(G, [BETO], "mañana hago asado", T15()), null);
  assert.equal(E.leerMensaje(G, [BETO], ".rae chorizo", T15()), null, "un comando no es decirla");
  assert.equal(E.misionAbierta(G).estado, "abierta", "y la misión sigue");

  // By his number alone, as some messages bring him, and in the plural diminutive.
  const r = E.leerMensaje(G, [num(BETO)], "Compré dos CHORICITOS para el asado", T15());
  assert.match(r.texto, /^🕵️ \*¡Misión cumplida!\* 🦊 era @300000000000041\.\nTenía hasta las \d\d:\d\d para lograr que @300000000000042 dijera «chorizo», y @300000000000042 /);
  assert.match(r.texto, new RegExp(`@300000000000041 cobra \\*${E.ESPIA.PREMIO} UruCoins\\*`));
  assert.deepEqual(r.mentions, [ANA, BETO]);
  assert.equal(saldo(ANA), E.ESPIA.PREMIO);
  assert.equal(E.misionAbierta(G), null);
  assert.equal(E.leerMensaje(G, [BETO], "chorizo", T15()), null, "una vez sola");
  assert.equal(saldo(ANA), E.ESPIA.PREMIO);
  // The emoji the group saw is burnt: Ana has another, and learns it in private.
  assert.match(r.texto, /🦊 quedó quemado/);
  const nuevo = E.agentesDeQuien([ANA], G)[0].emoji;
  assert.ok(nuevo !== "🦊" && nuevo !== "🐊");
  assert.match((await privado(ANA, "espia")).msg.text, new RegExp(`sos ${nuevo}`));
});

test("pasada la hora límite ya no cuenta, y al vencer se cuenta la misión pero no quién era", async () => {
  const mision = await conSobre();
  assert.equal(E.vencerMision(mision.id, mision.vence - 1), null, "antes de hora no vence");
  await privado(ANA, "sobre");
  globalThis.db.prepare(`UPDATE espias_misiones SET abierta = ?`).run(T15());
  assert.equal(E.leerMensaje(G, [BETO], "chorizo", mision.vence + 1), null);
  const r = E.vencerMision(mision.id, mision.vence);
  assert.match(r.texto, /^⌛ Se le acabó el tiempo a 🦊: tenía que lograr que @300000000000042 dijera «chorizo» y no hubo caso\./);
  assert.doesNotMatch(r.texto, /300000000000041/, "no dice quién era");
  assert.deepEqual(r.mentions, [BETO]);
  assert.equal(E.agentesDeQuien([ANA], G)[0].emoji, "🦊", "y conserva el disfraz");
  assert.equal(saldo(ANA), 0);
  assert.equal(E.vencerMision(mision.id, mision.vence), null, "una vez sola");
  assert.match((await privado(ANA, "sobre")).msg.text, /No hay ningún sobre/);

  // Never opened: nothing of the mission is told.
  globalThis.db.prepare(`DELETE FROM espias_misiones`).run();
  dados();
  await E.lanzarSobre(client, G, aLas(15));
  const otra = E.misionAbierta(G);
  const dormido = E.vencerMision(otra.id, otra.vence);
  assert.match(dormido.texto, /ni abrió el sobre/);
  assert.doesNotMatch(dormido.texto, /chorizo|termo|3000000000000/);

  // With the constant the other way, the group is told who, and the emoji is burnt.
  globalThis.db.prepare(`DELETE FROM espias_misiones`).run();
  E.ESPIA.REVELAR_AL_FALLAR = true;
  dados();
  await E.lanzarSobre(client, G, aLas(15));
  const tercera = E.misionAbierta(G);
  const revelada = E.vencerMision(tercera.id, tercera.vence);
  assert.match(revelada.texto, new RegExp(`${tercera.emoji} era @${tercera.agente.split("@")[0]}`));
  assert.notEqual(E.agentesDeQuien([tercera.agente], G)[0].emoji, tercera.emoji);
});

test("la variante difícil: que el objetivo ofrezca vender algo, leído por el clasificador de intención", async () => {
  grupo(G);
  dados();
  E.anotarAgente(G, { usuario: ANA });
  E.anotarAgente(G, { usuario: BETO });
  I._dep.probabilidades = (texto) => (/vendo/.test(texto) ? [0.02, 0.97, 0.01] : /busco/.test(texto) ? [0.02, 0.01, 0.97] : [0.98, 0.01, 0.01]);
  // agent, target, the roll for the hard one (under DIFICIL_CHANCE), and which of the two.
  dados(0, 0, E.ESPIA.DIFICIL_CHANCE - 1, 0);
  await E.lanzarSobre(client, G, aLas(15));
  const mision = E.misionAbierta(G);
  assert.deepEqual([mision.tipo, mision.palabra, mision.premio], ["vender", "", E.ESPIA.PREMIO_DIFICIL]);
  assert.match((await privado(ANA, "sobre")).msg.text, /lograr que \*.+\* ofrezca vender algo en el grupo/);
  globalThis.db.prepare(`UPDATE espias_misiones SET abierta = ?`).run(aLas(15, 5).getTime());
  assert.equal(E.leerMensaje(G, [BETO], "busco una heladera usada", T15()), null, "pedir no es ofrecer");
  assert.equal(E.leerMensaje(G, [BETO], "qué calor", T15()), null);
  assert.equal(E.leerMensaje(G, [ANA], "vendo una bici", T15()), null);
  const r = E.leerMensaje(G, [BETO], "vendo la bici, 3000 pesos", T15());
  assert.match(r.texto, /para lograr que @300000000000042 ofreciera vender algo/);
  assert.equal(saldo(ANA), E.ESPIA.PREMIO_DIFICIL);

  // Over the chance, or with no classifier at hand, the mission is a word.
  globalThis.db.prepare(`DELETE FROM espias_misiones`).run();
  dados(0, 0, E.ESPIA.DIFICIL_CHANCE, 0);
  await E.lanzarSobre(client, G, aLas(15));
  assert.equal(E.misionAbierta(G).tipo, "palabra");
});

test("los ejemplos que se le dan al espía de la difícil son frases que el clasificador de verdad lee así", () => {
  I._dep.probabilidades = I.probabilidades;
  for (const [tipo, frase] of Object.entries(E.EJEMPLO)) assert.equal(I.intencionDe(frase), tipo, frase);
});

test(".denunciar: acertar le saca la misión al espía, le cobra la multa y paga al denunciante", async () => {
  await conSobre();
  fijarSaldo(F, G, ANA, 100);
  fijarSaldo(F, G, CARLA, 50);
  assert.match((await enGrupo(CARLA, "denunciar")).msg.text, /^Se denuncia así/);
  const r = await enGrupo(CARLA, "denunciar 🦊 @300000000000041", { mencion: ANA });
  assert.equal(r.chat, G);
  assert.match(r.msg.text, /^🚨 \*¡Espía desenmascarado!\* @300000000000043 acertó: 🦊 era @300000000000041\.\nSu misión era lograr que @300000000000042 dijera «chorizo»/);
  assert.equal(saldo(ANA), 100 - E.ESPIA.MULTA);
  assert.equal(saldo(CARLA), 50 + E.ESPIA.RECOMPENSA);
  assert.equal(E.misionAbierta(G), null);
  assert.notEqual(E.agentesDeQuien([ANA], G)[0].emoji, "🦊");
  assert.match((await enGrupo(DANI, "denunciar @300000000000041", { mencion: ANA })).msg.text, /^❌ No hay ningún sobre abierto/);
  assert.equal(E.leerMensaje(G, [BETO], "chorizo", T15()), null, "la misión se perdió");
});

test(".denunciar: errar cuesta, es una por persona por sobre, y hay que tener con qué", async () => {
  await conSobre();
  fijarSaldo(F, G, CARLA, 50);
  fijarSaldo(F, G, DANI, E.ESPIA.DENUNCIA_FALSA - 1);
  fijarSaldo(F, G, ANA, 20);
  assert.match((await enGrupo(CARLA, "denunciar 🐊 @300000000000044", { mencion: DANI })).msg.text, /^❌ El sobre que anda dando vueltas es el de 🦊, no el de 🐊/);
  assert.match((await enGrupo(CARLA, "denunciar @300000000000043", { mencion: CARLA })).msg.text, /^❌ Denunciarte a vos no vale/);
  assert.match((await enGrupo(ANA, "denunciar @300000000000041", { mencion: ANA })).msg.text, /^❌ Denunciarte a vos no vale/, "al espía se le contesta lo mismo que a cualquiera");
  assert.match((await enGrupo(CARLA, "denunciar @bot", { mencion: "bot@lid" })).msg.text, /^❌ ¿Yo, espía\?/);
  assert.match((await enGrupo(DANI, "denunciar @300000000000041", { mencion: ANA })).msg.text, new RegExp(`^❌ Para denunciar hay que tener ${E.ESPIA.DENUNCIA_FALSA} UruCoins`));
  assert.equal(saldo(CARLA), 50, "nada de eso gastó la denuncia");

  const r = await enGrupo(CARLA, "denunciar @300000000000044", { mencion: DANI });
  assert.match(r.msg.text, /^❌ Le erraste: @300000000000044 no es 🦊\. Acusar en falso sale \*30 UruCoins\*/);
  assert.equal(saldo(CARLA), 50 - E.ESPIA.DENUNCIA_FALSA);
  assert.equal(E.misionAbierta(G).estado, "abierta");
  assert.match((await enGrupo(CARLA, "denunciar @300000000000041", { mencion: ANA })).msg.text, /^❌ Ya gastaste tu denuncia/);
  assert.equal(saldo(ANA), 20);

  // The spy can throw the group off by accusing somebody else: it costs them like anyone.
  fijarSaldo(F, G, ANA, 40);
  assert.match((await enGrupo(ANA, "denunciar @300000000000042", { mencion: BETO })).msg.text, /Le erraste/);
  assert.equal(saldo(ANA), 40 - E.ESPIA.DENUNCIA_FALSA);
  // A spy with less than the fine pays what they have.
  fijarSaldo(F, G, BETO, 50);
  const caido = await enGrupo(BETO, "denunciar @300000000000041", { mencion: ANA });
  assert.match(caido.msg.text, /@300000000000041 paga \*10 UruCoins\* de multa/);
  assert.equal(saldo(ANA), 0);
  assert.equal(saldo(BETO), 50 + E.ESPIA.RECOMPENSA);
});

test("salir con el sobre abierto lo deja sin efecto y el grupo se entera sin saber quién era; .espias off también lo anula", async () => {
  await conSobre();
  const r = await privado(ANA, "espia salir");
  assert.match(r.msg.text, /Tu sobre abierto quedó sin efecto/);
  const alGrupo = enviados().find((e) => e.chat === G && /colgó la gabardina/.test(e.msg.text));
  assert.ok(alGrupo);
  assert.doesNotMatch(alGrupo.msg.text, /300000000000041/);
  assert.equal(E.misionAbierta(G), null);

  await conSobre("apagar@g.us");
  const off = await enGrupo(CARLA, "espias off", { chat: "apagar@g.us", isAdmin: true });
  assert.match(off.msg.text, /El de 🦊 queda sin efecto/);
  assert.equal(E.misionAbierta("apagar@g.us"), null);
  assert.equal(E.agentesDe("apagar@g.us").length, 2, "los anotados siguen anotados");
  // Still signed up where the game went off: it shows, and they can leave.
  assert.match((await privado(BETO, "espia")).msg.text, /sos 🐊 \(ahí el juego está apagado\)/);
});

test("se agenda a lo sumo un sobre por día, solo donde está prendida, hay espías y el grupo habló ayer", () => {
  const ayer = A.claveDia(new Date(Date.now() - 86400000));
  const real = Math.random;
  Math.random = () => 0.5;
  try {
    grupo(G);
    const agendados = () => globalThis.db.prepare(`SELECT * FROM pendientes WHERE tipo = 'espia_sobre'`).all();
    E.anotarAgente(G, { usuario: ANA });
    E.anotarAgente(G, { usuario: BETO });
    assert.equal(E.programarSobresDelDia(aLas(E.ESPIA.DESDE_HORA - 1)), 0, "antes de hora ni mira");
    assert.equal(E.programarSobresDelDia(aLas(12)), 0, "ayer no habló nadie");
    globalThis.db.prepare(`DELETE FROM periodos_cerrados`).run();
    for (let i = 0; i < E.ESPIA.MENSAJES_AYER; i++) F.sumarMensajeDia?.(G, ANA, ayer);
    if (F.totalMensajesEntre(G, [ayer]) < E.ESPIA.MENSAJES_AYER) globalThis.db.prepare(`INSERT INTO actividad_diaria (chat, usuario, fecha, mensajes) VALUES (?, ?, ?, ?)`).run(G, ANA, ayer, E.ESPIA.MENSAJES_AYER);
    assert.equal(E.programarSobresDelDia(aLas(12)), E.ESPIA.MAX_DIA);
    const [p] = agendados();
    assert.equal(p.chat, G);
    assert.ok(p.ejecutar_en > aLas(12).getTime() && p.ejecutar_en < aLas(E.ESPIA.HASTA_HORA).getTime());
    assert.equal(E.programarSobresDelDia(aLas(13)), 0, "una vez por día");
    assert.equal(agendados().length, E.ESPIA.MAX_DIA);
  } finally {
    Math.random = real;
  }
});
