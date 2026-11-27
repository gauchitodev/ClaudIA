import { test, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";

// The town's elections (lib/elecciones.js, plugins/pueblo-elecciones.js): the campaign from the 1st of the month, in
// the group's hours, the candidates, the secret vote in private and only of the ones who play, the count with what the
// term did, the reelection once, the bribes and the comisario, the juicio político; the intendente of before staying
// until the first one; and nothing at all with the town off.
// The clock is frozen at 15:05 of a 1st of December: the elections open on the 1st, in the daytime, and the plugins
// read the real time.
const T0 = new Date(2026, 11, 1, 15, 5, 0, 0).getTime();
mock.timers.enable({ apis: ["Date"], now: T0 });
const irA = (ms) => mock.timers.setTime(ms);

let F, P, E, A, Cache, PluginPueblo, Plugin, client;
const ANA = "300000000000091@lid";
const BETO = "300000000000092@lid";
const CARLA = "300000000000093@lid";
const DANI = "300000000000094@lid";
const EMI = "300000000000095@lid";
const GENTE = [ANA, BETO, CARLA, DANI, EMI];
const NOMBRES = { [ANA]: "Ana", [BETO]: "Beto", [CARLA]: "Carla", [DANI]: "Dani", [EMI]: "Emi" };
const DIA = 24 * 60 * 60 * 1000;
const HORA = 60 * 60 * 1000;

before(async () => {
  ({ F } = await prepararBase("elecciones"));
  P = await import("../lib/pueblo.js");
  E = await import("../lib/elecciones.js");
  A = await import("../lib/actividad.js");
  Cache = await import("../lib/cache-grupos.js");
  PluginPueblo = (await import("../plugins/pueblo.js")).default;
  Plugin = (await import("../plugins/pueblo-elecciones.js")).default;
});
beforeEach(() => {
  irA(T0);
  client = clienteFalso();
  conexion.client = client;
  P._dep.azar = () => 0;
  E._dep.azar = () => 99; // the comisario finds nothing unless a test says so
});

const enviados = () => globalThis.enviados;
const ultimo = () => enviados().at(-1);
const textoDe = (e) => e?.msg?.text || "";
const fila = (chat) => db.prepare(`SELECT * FROM pueblos WHERE chat = ?`).get(chat);
const fijar = (chat, datos) => db.prepare(`UPDATE pueblos SET ${Object.keys(datos).map((k) => `${k} = ?`).join(", ")} WHERE chat = ?`).run(...Object.values(datos), chat);
const oficio = (chat, quien, laburo, cobros = 5, desde = Date.now() - 30 * DIA) => db.prepare(`INSERT OR REPLACE INTO laburos (chat, usuario, laburo, desde, cobros) VALUES (?, ?, ?, ?, ?)`).run(chat, quien, laburo, desde, cobros);
const participantes = (gente = GENTE) => gente.map((id) => ({ id }));
const saldo = (chat, quien) => F.getSaldoCoins(chat, quien);
// One town's round, as the scheduled task runs it for each.
const ronda = (chat) => E.rondaElecciones(client, chat, new Date());
const eleccion = (chat) => db.prepare(`SELECT * FROM elecciones WHERE chat = ? ORDER BY id DESC LIMIT 1`).get(chat);

// A group with its people, talking the day before, with a town (by .pueblo on, as an admin does).
async function pueblo(chat, { gente = GENTE } = {}) {
  for (const quien of gente) F.initDataDB({ chat, sender: quien, senderJid: "", pushName: NOMBRES[quien] });
  Cache.guardar(client, chat, { subject: `Pueblo ${chat.split("@")[0]}`, participants: [...participantes(gente), { id: "bot@lid" }] });
  const ayer = new Date(Date.now() - DIA);
  for (let i = 0; i < 40; i++) F.sumarMensajeDiario(chat, ANA, A.claveDia(ayer));
  await PluginPueblo.run({ chat, sender: ANA, senderJid: "", text: ".pueblo on", isGroup: true, message: {} }, { client, command: "pueblo", args: ["on"], isAdmin: true, isOwner: false });
  for (const quien of gente) F.fijarSaldoCoins?.(chat, quien, 0);
  return fila(chat);
}
async function enGrupo(chat, quien, texto, { mencion = null, isBotAdmin = false, botSettings = {} } = {}) {
  const [command, ...args] = texto.split(/\s+/);
  const borrado = { veces: 0 };
  const m = { chat, sender: quien, senderJid: "", text: `.${texto}`, isGroup: true, message: {}, key: { id: "X" }, mentionedJid: mencion ? [mencion] : [], delete: async () => borrado.veces++ };
  await Plugin.run(m, { client, command, args, text: args.join(" "), participants: participantes(), isBotAdmin, botSettings });
  return { texto: textoDe(ultimo()), mentions: ultimo()?.msg?.mentions || [], borrado: borrado.veces };
}
async function privado(quien, texto) {
  const [command, ...args] = texto.split(/\s+/);
  const m = { chat: `${quien.split("@")[0]}@s.whatsapp.net`, sender: quien, senderJid: "", text: `.${texto}`, isGroup: false, message: {} };
  await Plugin.run(m, { client, command, args, text: args.join(" "), participants: [], botSettings: {} });
  return textoDe(ultimo());
}
// The campaign open, with Beto and Carla políticos of level 3 (10 paydays) and everyone else with a trade.
async function enCampana(chat) {
  await pueblo(chat);
  for (const quien of [ANA, DANI, EMI]) oficio(chat, quien, "mozo");
  oficio(chat, BETO, "politico", 10);
  oficio(chat, CARLA, "politico", 10);
  assert.equal(await ronda(chat), true);
  return eleccion(chat);
}
// The lists closed and the voting open.
async function enVotacion(chat, { candidatos = [BETO, CARLA] } = {}) {
  await enCampana(chat);
  for (const c of candidatos) assert.equal(E.anotarCandidato(chat, c, "").ok, true);
  irA(T0 + E.ELECCION.CAMPANA_DIAS * DIA);
  assert.equal(await ronda(chat), true);
  return eleccion(chat);
}

test("elecciones: con el pueblo apagado no hay nada, y apagarlo a mitad anula la elección y devuelve las coimas", async () => {
  const chat = "apagado@g.us";
  for (const quien of GENTE) F.initDataDB({ chat, sender: quien, senderJid: "", pushName: NOMBRES[quien] });
  oficio(chat, BETO, "politico", 10);
  assert.equal(await E.chequearElecciones(client, new Date()), 0);
  assert.match((await enGrupo(chat, BETO, "candidato")).texto, /Sin pueblo/);
  assert.match((await enGrupo(chat, ANA, "elecciones")).texto, /Sin pueblo no hay elecciones/);
  assert.match((await enGrupo(chat, ANA, "juiciopolitico")).texto, /Sin pueblo/);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM elecciones WHERE chat = ?`).get(chat).n, 0);

  const otro = "seapaga@g.us";
  await enCampana(otro);
  E.anotarCandidato(otro, BETO, "");
  F.ganarCoins(otro, BETO, 100, "prueba");
  assert.equal(E.prometer(otro, BETO, ANA, 50).ok, true);
  assert.equal(saldo(otro, BETO), 50);
  await PluginPueblo.run({ chat: otro, sender: ANA, senderJid: "", text: ".pueblo off", isGroup: true, message: {} }, { client, command: "pueblo", args: ["off"], isAdmin: true, isOwner: false });
  assert.equal(eleccion(otro).estado, "anulada");
  assert.equal(saldo(otro, BETO), 100, "la plata de la coima vuelve");
  assert.equal(await E.chequearElecciones(client, new Date()), 0);
});

test("elecciones: la campaña abre el 1 del mes, una vez, con las reglas, sin arrobar a nadie y en el horario del grupo", async () => {
  const chat = "calendario@g.us";
  await pueblo(chat);
  const antes = enviados().length;
  // Before the day's hours, nothing.
  assert.equal(await E.chequearElecciones(client, new Date(2026, 11, 1, 8, 0)), 0);
  // With game hours, only inside them.
  F.updateChat(chat, { horarioJuegos: "20:00-23:00" });
  assert.equal(await E.chequearElecciones(client, new Date()), 0);
  assert.equal(enviados().length, antes);
  irA(new Date(2026, 11, 1, 20, 30).getTime());
  assert.equal(await E.chequearElecciones(client, new Date()), 1);
  const anuncio = ultimo();
  assert.match(textoDe(anuncio), /ELECCIONES EN/);
  assert.match(textoDe(anuncio), /nivel 3 o más/);
  assert.match(textoDe(anuncio), /\.votar\* por privado \(en el horario de juegos, de 20:00 a 23:00\)/);
  assert.match(textoDe(anuncio), /Reelección:\* una sola vez seguida/);
  assert.match(textoDe(anuncio), /\.prometer/);
  assert.match(textoDe(anuncio), /\.juiciopolitico/);
  assert.equal(anuncio.msg.mentions, undefined, "el anuncio no arroba a nadie");
  const el = eleccion(chat);
  assert.equal(el.mes, "2026-12");
  assert.equal(el.cierra_inscripcion - el.anuncio, E.ELECCION.CAMPANA_DIAS * DIA);
  // Once a month.
  assert.equal(await ronda(chat), false);

  // A group that didn't talk the day before waits; past the 10th, the month goes by.
  const callado = "callado@g.us";
  await pueblo(callado);
  db.prepare(`DELETE FROM actividad_diaria WHERE chat = ?`).run(callado);
  irA(new Date(2026, 11, 2, 15, 0).getTime());
  assert.equal(await ronda(callado), false);
  irA(new Date(2026, 11, 11, 15, 0).getTime());
  for (let i = 0; i < 40; i++) F.sumarMensajeDiario(callado, ANA, A.claveDia(new Date(Date.now() - DIA)));
  assert.equal(await ronda(callado), false);
  assert.match(E.textoProxima(callado), /arrancan el 1 de enero/);
});

test("elecciones: se presentan los políticos de nivel 3, con frase filtrada, y las listas cierran a tiempo", async () => {
  const chat = "candidatos@g.us";
  await enCampana(chat);
  oficio(chat, DANI, "politico", 1);
  assert.match((await enGrupo(chat, ANA, "candidato")).texto, /se presentan los políticos/);
  assert.match((await enGrupo(chat, DANI, "candidato")).texto, /nivel 3 o más, y vos sos nivel 1/);
  assert.match((await enGrupo(chat, BETO, "candidato mirá https://estafa.com")).texto, /❌/);
  const r = await enGrupo(chat, BETO, "candidato Un asado por barrio");
  assert.match(r.texto, /es la \*lista 1\*, «Un asado por barrio»/);
  assert.deepEqual(r.mentions, [BETO]);
  assert.match((await enGrupo(chat, CARLA, "candidato")).texto, /lista 2/);
  assert.match((await enGrupo(chat, BETO, "candidato Bajamos el impuesto")).texto, /cambié tu frase/);
  assert.match((await enGrupo(chat, CARLA, "candidato baja el impuesto ya")).texto, /cambié tu frase: .*«baja el impuesto ya»/, "una frase que empieza con baja es una frase");
  assert.match((await enGrupo(chat, CARLA, "candidato baja")).texto, /se bajó de la lista 2/);
  assert.deepEqual(E.candidatosDe(eleccion(chat).id).map((c) => c.usuario), [BETO]);
  assert.match((await enGrupo(chat, CARLA, "candidato")).texto, /Volviste a la lista/);
  const tablero = (await enGrupo(chat, ANA, "elecciones")).texto;
  assert.match(tablero, /\*1\.\* Beto — «Bajamos el impuesto»/);
  assert.match(tablero, /\*2\.\* Carla/);
  irA(T0 + E.ELECCION.CAMPANA_DIAS * DIA);
  assert.match((await enGrupo(chat, DANI, "candidato")).texto, /ya cerraron/);
  assert.match((await enGrupo(chat, CARLA, "candidato baja")).texto, /ya cerraron/);
});

test("elecciones: la reelección es una sola vez seguida, y el volteado por juicio no se presenta", async () => {
  const chat = "reeleccion@g.us";
  await enCampana(chat);
  fijar(chat, { intendente: BETO, mandatos: 2, intendente_desde: Date.now() - 20 * DIA });
  assert.match(E.anotarCandidato(chat, BETO, "").error, /la reelección se puede una sola vez/);
  fijar(chat, { mandatos: 1 });
  assert.match(E.anotarCandidato(chat, BETO, "").mensaje, /Va por la reelección/);
  fijar(chat, { inhabilitado: CARLA });
  assert.match(E.anotarCandidato(chat, CARLA, "").error, /juicio político/);
});

test("elecciones: se vota por privado, una vez, solo los que juegan, y la urna no guarda a quién", async () => {
  const chat = "votacion@g.us";
  const el = await enVotacion(chat);
  const aviso = textoDe(ultimo());
  // The towns of the other tests aren't voting: here the people vote in one group only.
  db.prepare(`UPDATE elecciones SET estado = 'cerrada' WHERE chat != ?`).run(chat);
  assert.match(aviso, /SE VOTA EN/);
  assert.match(aviso, /\*1\.\* Beto/);
  assert.match(aviso, /\*2\.\* Carla/);
  assert.equal(ultimo().msg.mentions, undefined, "la boleta va con nombres, sin arrobar");
  assert.equal(eleccion(chat).estado, "votacion");
  assert.equal(eleccion(chat).cierra_votacion, Date.now() + E.ELECCION.VOTACION_DIAS * DIA);
  // In the group only the ballot; a vote said there isn't counted, and goes if Claudia can.
  assert.match((await enGrupo(chat, ANA, "votar")).texto, /Se vota \*por privado\*/);
  const enPublico = await enGrupo(chat, ANA, "votar 1", { isBotAdmin: true });
  assert.match(enPublico.texto, /el voto es secreto/);
  assert.equal(enPublico.borrado, 1);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM elecciones_votos`).get().n, 0);
  // In private.
  assert.match(await privado(ANA, "votar"), /TU BOLETA[\s\S]*\*1\.\* Beto[\s\S]*\.votar 1/);
  assert.match(await privado(ANA, "votar 1"), /tu voto por la lista 1 \(Beto\) quedó en la urna/);
  assert.match(await privado(ANA, "votar 2"), /Ya votaste/);
  assert.match(await privado(DANI, "votar 7"), /No hay ninguna lista 7/);
  // Who doesn't play doesn't vote: no trade, a trade from after the campaign opened, never paid.
  assert.match(E.votar(chat, "300000000000099@lid", 1).error, /hace falta un oficio/);
  oficio(chat, EMI, "mozo", 5, el.anuncio + HORA);
  assert.match(await privado(EMI, "votar 1"), /de después de que arrancó/);
  oficio(chat, EMI, "mozo", 0);
  assert.match(await privado(EMI, "votar 1"), /haber cobrado por lo menos 1 vez/);
  // The box keeps who voted, not for whom.
  const columnas = db.prepare(`PRAGMA table_info(elecciones_votos)`).all().map((c) => c.name);
  assert.deepEqual(columnas, ["eleccion", "votante", "fecha"]);
  assert.deepEqual(E.candidatosDe(el.id).map((c) => c.votos), [1, 0]);
  // With game hours, the box opens in them, in private too.
  F.updateChat(chat, { horarioJuegos: "20:00-23:00" });
  assert.match(await privado(DANI, "votar 2"), /la urna abre en ese horario/);
  F.updateChat(chat, { horarioJuegos: "" });
  // After the close, nothing.
  irA(eleccion(chat).cierra_votacion);
  assert.match(await privado(DANI, "votar 2"), /No hay ninguna votación abierta/);
});

test("elecciones: el escrutinio cuenta, la gestión empuja al que va por la reelección y el ganador manda", async () => {
  const chat = "escrutinio@g.us";
  await enCampana(chat);
  // Beto is the intendente of before (the político of the highest level, back then) and runs again.
  fijar(chat, { intendente: BETO, mandatos: 1, intendente_desde: Date.now() - 25 * DIA, humor: 85, prosperidad: 85 });
  E.anotarCandidato(chat, BETO, "");
  E.anotarCandidato(chat, CARLA, "");
  irA(T0 + E.ELECCION.CAMPANA_DIAS * DIA);
  await ronda(chat);
  // Carla 2, Beto 1 by votes: the term (a happy, prosperous town) gives Beto one more, and the tie goes to who has more
  // votes of their own.
  assert.equal(E.votar(chat, ANA, 2).ok, true);
  assert.equal(E.votar(chat, DANI, 2).ok, true);
  assert.equal(E.votar(chat, EMI, 1).ok, true);
  const g = E.gestionDe(chat);
  assert.ok(g.puntos > 0.3, `la gestión suma (${g.puntos})`);
  assert.deepEqual(g.motivos, ["el pueblo anda contento", "hay plata en la calle"]);
  assert.equal(E.votosDeGestion(g.puntos, 3), 1, "con 3 votos, un empujoncito de 1");
  assert.equal(E.votosDeGestion(1, 100), E.ELECCION.GESTION_TOPE);
  assert.equal(E.votosDeGestion(-1, 4), -1);
  irA(eleccion(chat).cierra_votacion + HORA);
  fijar(chat, { humor: 85, prosperidad: 85 });
  assert.equal(await ronda(chat), true);
  const texto = textoDe(ultimo());
  assert.match(texto, /ESCRUTINIO/);
  assert.match(texto, /Votaron 3 vecinos/);
  assert.match(texto, /Lista 1, @300000000000092: 1 voto \(\+1 por la gestión\) = \*2\*/);
  assert.match(texto, /🏆 Lista 2, @300000000000093: 2 votos/);
  assert.match(texto, /@300000000000093 \*es el nuevo intendente\*/);
  assert.deepEqual(ultimo().msg.mentions.sort(), [BETO, CARLA].sort(), "arroba solo a los candidatos");
  const f = fila(chat);
  assert.equal(f.intendente, CARLA);
  assert.equal(f.mandatos, 1);
  assert.equal(eleccion(chat).estado, "cerrada");
  const hecho = P.hechosDesde(chat, 0).find((h) => h.tipo === "eleccion");
  assert.equal(hecho.datos.usuario, CARLA);
  assert.equal(hecho.datos.antes, BETO);
  // The one elected sets the tax and leans on the bank; the one before, no more.
  fijar(chat, { impuesto_fijado: 0 });
  assert.match(P.fijarImpuesto(chat, BETO, 12).error, /lo fija @/);
  assert.equal(P.fijarImpuesto(chat, CARLA, 12).ok, true);
  assert.match((await enGrupo(chat, ANA, "elecciones")).texto, /Las últimas \(2026-12\): ganó Carla, con 3 votos emitidos/);
});

test("elecciones: reelecta una vez sigue; la tercera seguida no se presenta; sin votos o sin listas vuelve el del pueblo", async () => {
  const chat = "mandatos@g.us";
  await enCampana(chat);
  fijar(chat, { intendente: CARLA, mandatos: 1, intendente_desde: Date.now() - 25 * DIA });
  E.anotarCandidato(chat, CARLA, "");
  irA(T0 + E.ELECCION.CAMPANA_DIAS * DIA);
  await ronda(chat);
  E.votar(chat, ANA, 1);
  irA(eleccion(chat).cierra_votacion);
  await ronda(chat);
  assert.match(textoDe(ultimo()), /\*sigue de intendente\*: reelecto.*segundo mandato seguido: en las próximas no se puede presentar/);
  assert.equal(fila(chat).mandatos, 2);
  // Next month: she can't run, nobody else does, and the town's own takes over.
  irA(new Date(2027, 0, 1, 15, 0).getTime());
  for (let i = 0; i < 40; i++) F.sumarMensajeDiario(chat, ANA, A.claveDia(new Date(Date.now() - DIA)));
  assert.equal(await ronda(chat), true);
  assert.match(textoDe(ultimo()), /ya va por su segundo mandato seguido y esta vez no puede presentarse/);
  assert.match(E.anotarCandidato(chat, CARLA, "").error, /una sola vez/);
  irA(eleccion(chat).cierra_inscripcion);
  assert.equal(await ronda(chat), true);
  assert.match(textoDe(ultimo()), /nadie se presentó. Sigue el intendente/);
  assert.equal(fila(chat).intendente, "");
  assert.equal(fila(chat).mandatos, 0);
  assert.equal(P.estadoDe(chat).intendente.persona, false);
  assert.equal(P.hechosDesde(chat, 0).find((h) => h.tipo === "eleccion").datos.desierta, true);
  // The month after, she can again: a term went by.
  irA(new Date(2027, 1, 1, 15, 0).getTime());
  for (let i = 0; i < 40; i++) F.sumarMensajeDiario(chat, ANA, A.claveDia(new Date(Date.now() - DIA)));
  await ronda(chat);
  assert.equal(E.anotarCandidato(chat, CARLA, "").ok, true);
  // Nobody votes: the town's own.
  irA(eleccion(chat).cierra_inscripcion);
  await ronda(chat);
  irA(eleccion(chat).cierra_votacion);
  await ronda(chat);
  assert.match(textoDe(ultimo()), /Nadie fue a votar: sigue el intendente/);
  assert.equal(fila(chat).intendente, "");
});

test("elecciones: la coima se guarda hasta el escrutinio; el coimeado la denuncia y el candidato queda afuera", async () => {
  const chat = "coima@g.us";
  await enCampana(chat);
  E.anotarCandidato(chat, BETO, "");
  E.anotarCandidato(chat, CARLA, "");
  F.ganarCoins(chat, BETO, 500, "prueba");
  F.ganarCoins(chat, CARLA, 500, "prueba");
  assert.match((await enGrupo(chat, ANA, `prometer @${BETO.split("@")[0]} 50`, { mencion: BETO })).texto, /Prometen los candidatos/);
  assert.match((await enGrupo(chat, BETO, "prometer 50", { mencion: BETO })).texto, /tu propio voto/);
  assert.match((await enGrupo(chat, BETO, "prometer 5000", { mencion: ANA })).texto, /va de 10 a 200/);
  const r = await enGrupo(chat, BETO, "prometer 50", { mencion: ANA });
  assert.match(r.texto, /le promete a @300000000000091 \*50 UruCoins\*/);
  assert.deepEqual(r.mentions, [BETO, ANA]);
  assert.equal(saldo(chat, BETO), 450, "la plata queda guardada");
  assert.match((await enGrupo(chat, BETO, "prometer 50", { mencion: ANA })).texto, /ya le prometiste/);
  assert.equal(E.prometer(chat, BETO, DANI, 30).ok, true);
  assert.equal(E.prometer(chat, CARLA, EMI, 40).ok, true);
  // Whoever wasn't promised anything can't report; Ana can.
  assert.match((await enGrupo(chat, EMI, `denunciarcoima @${BETO.split("@")[0]}`, { mencion: BETO })).texto, /no te prometió nada/);
  const arcas = fila(chat).arcas;
  const d = await enGrupo(chat, ANA, "denunciarcoima");
  assert.match(d.texto, /ESCÁNDALO EN LA CAMPAÑA/);
  assert.match(d.texto, /afuera de la elección\*, pierde los 80 de 2 sobres y paga 100 de multa/);
  assert.equal(saldo(chat, BETO), 320);
  assert.equal(fila(chat).arcas, arcas + 180);
  assert.equal(P.memoriaDe(chat, "comisario", BETO).veces, 1, "el comisario se acuerda");
  assert.equal(P.hechosDesde(chat, 0).find((h) => h.tipo === "escandalo_coima").datos.usuario, BETO);
  assert.deepEqual(E.candidatosDe(eleccion(chat).id).map((c) => c.usuario), [CARLA]);
  assert.match(E.anotarCandidato(chat, BETO, "").error, /coima/);
  // Carla's: Emi votes and is paid at the count; the comisario finds nothing (dice at 99).
  irA(T0 + E.ELECCION.CAMPANA_DIAS * DIA);
  await ronda(chat);
  assert.equal(E.votar(chat, EMI, 2).ok, true);
  irA(eleccion(chat).cierra_votacion);
  await ronda(chat);
  assert.equal(saldo(chat, EMI), 40);
  assert.equal(fila(chat).intendente, CARLA);
});

test("elecciones: en el escrutinio el comisario puede encontrar los sobres, y al que no votó no le pagan", async () => {
  const chat = "comisario@g.us";
  await enCampana(chat);
  E.anotarCandidato(chat, BETO, "");
  E.anotarCandidato(chat, CARLA, "");
  F.ganarCoins(chat, BETO, 300, "prueba");
  F.ganarCoins(chat, CARLA, 300, "prueba");
  E.prometer(chat, BETO, ANA, 50);
  E.prometer(chat, CARLA, DANI, 60);
  irA(T0 + E.ELECCION.CAMPANA_DIAS * DIA);
  await ronda(chat);
  E.votar(chat, ANA, 1);
  E.votar(chat, EMI, 1);
  E.votar(chat, DANI, 2);
  // The comisario's dice: Beto's envelope comes out (0 < 15), Carla's doesn't.
  const tiros = [0, 99];
  E._dep.azar = (n) => (tiros.shift() ?? 99) % n;
  irA(eleccion(chat).cierra_votacion);
  await ronda(chat);
  const texto = textoDe(ultimo());
  assert.match(texto, /🚨 Lista 1, @300000000000092: \*afuera\*/);
  assert.match(texto, /@300000000000093 \*es el nuevo intendente\*/);
  assert.equal(fila(chat).intendente, CARLA, "con 1 voto, porque los 2 de Beto no cuentan");
  assert.equal(saldo(chat, ANA), 0, "la coima de Beto se decomisó");
  assert.equal(saldo(chat, DANI), 60, "Dani votó: cobra la de Carla");
  assert.equal(saldo(chat, BETO), 300 - 50 - 100);
  // Not voting, the money goes back.
  const otro = "novoto@g.us";
  irA(T0);
  await enCampana(otro);
  E.anotarCandidato(otro, BETO, "");
  F.ganarCoins(otro, BETO, 100, "prueba");
  E.prometer(otro, BETO, ANA, 50);
  E._dep.azar = () => 99;
  irA(T0 + E.ELECCION.CAMPANA_DIAS * DIA);
  await ronda(otro);
  E.votar(otro, EMI, 1);
  irA(eleccion(otro).cierra_votacion);
  await ronda(otro);
  assert.equal(saldo(otro, ANA), 0);
  assert.equal(saldo(otro, BETO), 100);
});

test("elecciones: el juicio político voltea al intendente con las firmas, y si no llegan, falla", async () => {
  const chat = "juicio@g.us";
  await pueblo(chat);
  for (const quien of [ANA, CARLA, DANI, EMI]) oficio(chat, quien, "mozo");
  oficio(chat, BETO, "politico", 10);
  // Against the town's own, nothing.
  assert.match(E.firmarJuicio(chat, ANA).error, /a ese no lo voltea nadie/);
  fijar(chat, { intendente: BETO, mandatos: 1, intendente_desde: Date.now() - DIA });
  assert.match(E.firmarJuicio(chat, BETO).error, /contra vos mismo/);
  assert.match(E.firmarJuicio(chat, ANA).error, /luna de miel/);
  fijar(chat, { intendente_desde: Date.now() - 10 * DIA });
  oficio(chat, EMI, "mozo", 0);
  assert.match(E.firmarJuicio(chat, EMI).error, /Firman los que juegan/);
  oficio(chat, EMI, "mozo");
  // 4 who can sign besides him: a third is 2, but never fewer than 3.
  const r = await enGrupo(chat, ANA, "juiciopolitico");
  assert.match(r.texto, /abrió un \*juicio político\* contra el intendente @300000000000092\. Para voltearlo hacen falta \*3 firmas\*/);
  assert.deepEqual(r.mentions, [ANA, BETO]);
  assert.match(E.firmarJuicio(chat, ANA).error, /Ya firmaste/);
  assert.match(E.firmarJuicio(chat, CARLA).mensaje, /van \*2 de 3\*/);
  assert.match(E.lineaEleccionesPueblo(chat), /juicio político: 2 de 3 firmas/);
  const fin = E.firmarJuicio(chat, DANI);
  assert.match(fin.mensaje, /JUICIO POLÍTICO: @300000000000092 AFUERA/);
  assert.equal(fila(chat).intendente, "");
  assert.equal(fila(chat).inhabilitado, BETO);
  assert.equal(P.hechosDesde(chat, 0)[0].tipo, "juicio_politico");

  // Short of signatures in time, it fails, and another waits a week.
  const otro = "juiciofallido@g.us";
  await pueblo(otro);
  for (const quien of [ANA, CARLA, DANI, EMI]) oficio(otro, quien, "mozo");
  fijar(otro, { intendente: BETO, mandatos: 1, intendente_desde: Date.now() - 10 * DIA });
  assert.equal(E.firmarJuicio(otro, ANA).ok, true);
  irA(T0 + E.ELECCION.JUICIO_DIAS * DIA);
  await ronda(otro);
  assert.equal(db.prepare(`SELECT estado FROM elecciones_juicios WHERE chat = ?`).get(otro).estado, "fallido");
  assert.equal(P.hechosDesde(otro, 0)[0].tipo, "juicio_fallido");
  assert.match(E.firmarJuicio(otro, CARLA).error, /no juntó las firmas/);
  assert.equal(fila(otro).intendente, BETO);
});

test("elecciones: el intendente de antes queda hasta la primera elección y cuenta como un mandato", async () => {
  const chat = "migra@g.us";
  await pueblo(chat);
  const viejo = "migranpc@g.us";
  await pueblo(viejo);
  fijar(chat, { intendente: BETO });
  // A database from before the elections: without the columns.
  db.exec(`ALTER TABLE pueblos DROP COLUMN mandatos`);
  db.exec(`ALTER TABLE pueblos DROP COLUMN inhabilitado`);
  globalThis.db = F.loadDatabase();
  assert.equal(fila(chat).mandatos, 1);
  assert.equal(fila(chat).intendente, BETO);
  assert.equal(fila(viejo).mandatos, 0);
  assert.equal(fila(chat).inhabilitado, "");
  // Nothing moves him but the elections.
  fijar(chat, { dia: "2000-01-01" });
  P.diaDelPueblo(chat);
  assert.equal(P.estadoDe(chat).intendente.usuario, BETO);
  // Loaded again, nothing changes.
  fijar(chat, { mandatos: 2 });
  globalThis.db = F.loadDatabase();
  assert.equal(fila(chat).mandatos, 2);
});

test("elecciones: el tablero del pueblo y .elecciones dicen cómo viene", async () => {
  const chat = "tablero@g.us";
  await enCampana(chat);
  E.anotarCandidato(chat, BETO, "");
  const { texto } = await P.textoPueblo(chat);
  assert.match(texto, /🗳️ Campaña abierta: 1 lista, cierran el viernes 4\/12 a las 15:05/);
  assert.match(texto, /el del pueblo, hasta que el grupo elija uno: \.elecciones/);
  const tablero = (await enGrupo(chat, ANA, "elecciones")).texto;
  assert.match(tablero, /\*Campaña:\* las listas cierran el viernes 4\/12 a las 15:05/);
  assert.match(tablero, /🗳️ Vos podés votar: escribime \.votar por privado/);
  const avisoPrivados = (await enGrupo(chat, ANA, "elecciones", { botSettings: { antiPrivate: 1 } })).texto;
  assert.match(avisoPrivados, /los privados están cerrados/);
});

test("el manual de Claudia cuenta las elecciones con los números de ELECCION, y lo trae cuando le preguntan", async () => {
  const { MANUAL, CAMBIOS, conocimientoPara } = await import("../lib/manual-claudia.js");
  const e = E.ELECCION;
  for (const dicho of [
    ".candidato",
    ".candidato baja",
    ".votar 2",
    ".prometer @persona 50",
    ".denunciarcoima",
    ".juiciopolitico",
    ".elecciones",
    `hasta el ${e.INICIO_HASTA_DIA}`,
    `de ${e.DESDE_HORA} a ${e.HASTA_HORA} si no tiene`,
    `Campaña, ${e.CAMPANA_DIAS} días`,
    `políticos de nivel ${e.CANDIDATO_NIVEL} o más`,
    `hasta ${e.FRASE_MAX} letras`,
    `dura ${e.VOTACION_DIAS} días`,
    "una sola vez seguida",
    `nunca más de ${e.GESTION_TOPE}`,
    `de ${e.PROMESA_MIN} a ${e.PROMESA_MAX}, hasta ${e.PROMESAS_MAX} por elección`,
    `(${e.COIMA_RIESGO} %, o ${e.COIMA_RIESGO + e.COIMA_JUNADO} %`,
    `paga ${e.COIMA_MULTA} de multa`,
    `(al menos ${e.JUICIO_FIRMAS_MIN}) en ${e.JUICIO_DIAS} días`,
    `primeros ${e.JUICIO_GRACIA_DIAS} días`,
    `esperar ${e.JUICIO_ESPERA_DIAS} días`,
  ])
    assert.ok(MANUAL.includes(dicho), `el manual no dice «${dicho}»`);
  assert.equal(e.GESTION_PESO, 0.25, "el manual dice «hasta un cuarto de los votos emitidos»");
  assert.equal(e.JUICIO_PARTE, 0.34, "el manual dice «un tercio de los que juegan»");
  assert.equal(e.VOTO_COBROS_MIN, 1, "el manual dice «por lo menos un cobro»");
  assert.equal(e.MANDATOS_SEGUIDOS, 2, "el manual dice «una sola vez seguida»");
  assert.doesNotMatch(MANUAL, /político del grupo de más nivel, desde el nivel/, "el intendente ya no es automático");
  assert.equal(CAMBIOS[0].titulo, "Elecciones en el pueblo");
  for (const pregunta of ["cómo voto en las elecciones?", "quién puede ser candidato a intendente", "qué es el juicio político"]) assert.match(conocimientoPara(pregunta), /LAS ELECCIONES/, pregunta);
});

test("elecciones: el que se fue del grupo no gana: su lista queda afuera, y el intendente que se va deja el sillón", async () => {
  const chat = "seva@g.us";
  await enCampana(chat);
  E.anotarCandidato(chat, BETO, "");
  E.anotarCandidato(chat, CARLA, "");
  irA(T0 + E.ELECCION.CAMPANA_DIAS * DIA);
  await ronda(chat);
  assert.equal(E.votar(chat, ANA, 1).ok, true);
  assert.equal(E.votar(chat, DANI, 1).ok, true);
  assert.equal(E.votar(chat, EMI, 2).ok, true);
  // Beto, ahead, leaves the group before the count.
  irA(eleccion(chat).cierra_votacion + HORA);
  Cache.guardar(client, chat, { subject: "Pueblo seva", participants: [...participantes(GENTE.filter((x) => x !== BETO)), { id: "bot@lid" }] });
  assert.equal(await ronda(chat), true);
  const texto = textoDe(ultimo());
  assert.match(texto, /Lista 1, Beto: se fue del grupo, sus votos no cuentan/);
  assert.match(texto, /@300000000000093 \*es el nuevo intendente\*/);
  assert.equal(fila(chat).intendente, CARLA);
  // Then Carla leaves too: the town's own takes over, and it's news.
  Cache.guardar(client, chat, { subject: "Pueblo seva", participants: [...participantes([ANA, DANI, EMI]), { id: "bot@lid" }] });
  irA(Date.now() + HORA);
  assert.equal(await ronda(chat), true);
  assert.match(textoDe(ultimo()), /Carla se fue del grupo y dejó el sillón vacío/);
  assert.equal(fila(chat).intendente, "");
  assert.equal(P.estadoDe(chat).intendente.persona, false);
  assert.ok(P.hechosDesde(chat, 0).some((h) => h.tipo === "intendente_se_fue"));
  // With no list of participants at hand, nobody is taken out.
  assert.deepEqual(E.sacarAusentes(eleccion(chat), null), []);
});
