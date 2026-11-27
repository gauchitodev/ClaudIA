import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, fijarSaldo } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";

// The town of each group (lib/pueblo.js, plugins/pueblo.js): born with .pueblo on, its numbers moved by what happens,
// its events, its intendente and tax, what its characters remember; and what it must never do: change anything in a
// group that didn't switch it on.
let F, P, A, Plugin, client;
const ANA = "300000000000051@lid";
const BETO = "300000000000052@lid";
const CARLA = "300000000000053@lid";
const DIA = 24 * 60 * 60 * 1000;

before(async () => {
  ({ F } = await prepararBase("pueblo"));
  P = await import("../lib/pueblo.js");
  A = await import("../lib/actividad.js");
  Plugin = (await import("../plugins/pueblo.js")).default;
});
beforeEach(() => {
  client = clienteFalso();
  conexion.client = client;
  P._dep.azar = () => 0;
  P.PUEBLO.DESDE_HORA = 0;
  P.PUEBLO.HASTA_HORA = 24;
});

const enviados = () => globalThis.enviados;
const ultimo = () => enviados().at(-1);
const textoDe = (e) => e?.msg?.text || "";
const oficio = (chat, quien, laburo, cobros = 0) => db.prepare(`INSERT OR REPLACE INTO laburos (chat, usuario, laburo, desde, cobros) VALUES (?, ?, ?, ?, ?)`).run(chat, quien, laburo, Date.now() - 30 * DIA, cobros);
const fila = (chat) => db.prepare(`SELECT * FROM pueblos WHERE chat = ?`).get(chat);
const fijar = (chat, datos) => db.prepare(`UPDATE pueblos SET ${Object.keys(datos).map((k) => `${k} = ?`).join(", ")} WHERE chat = ?`).run(...Object.values(datos), chat);

function grupo(chat, { ahora = new Date() } = {}) {
  F.initDataDB({ chat, sender: ANA, senderJid: "", pushName: "Ana" });
  for (const quien of [BETO, CARLA]) F.initDataDB({ chat, sender: quien, senderJid: "", pushName: quien.slice(-6, -4) });
  for (let i = 0; i < 10; i++) F.sumarMensajeHora(chat, A.claveDia(ahora), ahora.getHours());
}
async function comando(chat, quien, texto, { isAdmin = false } = {}) {
  const [command, ...args] = texto.split(/\s+/);
  const m = { chat, sender: quien, senderJid: "", text: `.${texto}`, isGroup: true, message: {} };
  await Plugin.run(m, { client, command, args, isAdmin, isOwner: false });
  return textoDe(ultimo());
}
async function pueblo(chat) {
  grupo(chat);
  await comando(chat, ANA, "pueblo on", { isAdmin: true });
  return fila(chat);
}

test("pueblo: apagado no existe, y todo lo que lo usa queda neutro", () => {
  const chat = "apagado@g.us";
  grupo(chat);
  assert.equal(P.puebloActivo(chat), false);
  assert.equal(P.estadoDe(chat), null);
  assert.equal(P.modificador(chat, "sueldo:mozo"), 1);
  assert.equal(P.modificador(chat, "empresa:tambero"), 1);
  assert.equal(P.modificador(chat, "precios"), 1);
  assert.equal(P.modificador(chat, "changa:papas"), 1);
  assert.equal(P.modificador(chat, "encargo"), 0);
  assert.equal(P.modificador(chat, "robo"), 0);
  assert.equal(P.modificador(chat, "impuesto"), 0);
  assert.equal(P.registrarHecho(chat, "coima", { usuario: ANA }), false);
  assert.equal(P.npc(chat, "comisario"), "");
  assert.equal(P.lugarPara(chat, "camionero"), "");
  let tiros = 0;
  P._dep.azar = () => tiros++;
  assert.equal(P.huboRobo(chat), false);
  assert.equal(tiros, 0, "con el pueblo apagado no se tira ningún dado");
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM pueblo_hechos WHERE chat = ?`).get(chat).n, 0);
});

test("pueblo: .pueblo on lo hace nacer con nombre, personajes y lugares; solo un admin", async () => {
  const chat = "nace@g.us";
  grupo(chat);
  assert.match(await comando(chat, BETO, "pueblo on"), /solo para admins/);
  assert.equal(fila(chat), undefined);
  const antes = enviados().length;
  await comando(chat, ANA, "pueblo on", { isAdmin: true });
  const p = fila(chat);
  assert.ok(p, "nació");
  // It's born with the welcome to the world (lib/novedades.js, test/novedades.test.mjs): three messages.
  const bienvenida = enviados().slice(antes).map(textoDe);
  assert.equal(bienvenida.length, 3);
  assert.match(bienvenida[0], new RegExp(`Acaba de nacer \\*${p.nombre}\\*`));
  assert.match(bienvenida[0], /comisario/);
  assert.ok(P.NOMBRES_PUEBLO.includes(p.nombre));
  assert.ok(p.anio >= 1830 && p.anio < 1926);
  assert.equal(P.puebloActivo(chat), true);
  const e = P.estadoDe(chat);
  assert.equal(e.prosperidad, 50);
  assert.match(e.npc.comisario, /^el comisario /);
  assert.match(e.lugar.ruta, /^la ruta \d+$/);
  assert.match(P.lugarPara(chat, "camionero"), new RegExp(`a la altura de ${p.nombre}`));
  // The board.
  const tablero = await comando(chat, BETO, "pueblo");
  assert.match(tablero, new RegExp(p.nombre.toUpperCase()));
  assert.match(tablero, /Prosperidad ▰/);
  assert.match(tablero, /impuesto municipal \*10 %\*/);
  // Renamed, by an admin only.
  assert.match(await comando(chat, BETO, "pueblo nombre Pueblo Bandido"), /solo para admins/);
  assert.match(await comando(chat, ANA, "pueblo nombre Pueblo *Bandido*", { isAdmin: true }), /ahora se llama \*Pueblo Bandido\*/);
  assert.equal(fila(chat).nombre, "Pueblo Bandido");
  // Off and on again, it's the same town.
  await comando(chat, ANA, "pueblo off", { isAdmin: true });
  assert.equal(P.puebloActivo(chat), false);
  assert.equal(P.modificador(chat, "sueldo:mozo"), 1);
  assert.match(await comando(chat, ANA, "pueblo on", { isAdmin: true }), /se despertó/);
  assert.equal(fila(chat).nombre, "Pueblo Bandido");
});

test("pueblo: con la economía apagada, el pueblo se queda quieto", async () => {
  const chat = "sinmonedas@g.us";
  await pueblo(chat);
  F.updateChat(chat, { monedas: 0 });
  assert.equal(P.puebloActivo(chat), false);
  assert.equal(P.registrarHecho(chat, "coima", { usuario: ANA }), false);
  F.updateChat(chat, { monedas: 1 });
});

test("pueblo: los hechos mueven los números y los que son noticia se guardan", async () => {
  const chat = "hechos@g.us";
  await pueblo(chat);
  const antes = fila(chat).seguridad;
  for (let i = 0; i < 4; i++) assert.equal(P.registrarHecho(chat, "coima", { usuario: ANA }), true);
  assert.equal(fila(chat).seguridad, antes - 6);
  P.registrarHecho(chat, "facturacion", { monto: 500 });
  assert.equal(fila(chat).prosperidad, 52);
  // facturacion is no news: it moves the numbers and isn't kept.
  const tipos = P.hechosDesde(chat, 0).map((h) => h.tipo);
  assert.deepEqual([...new Set(tipos)], ["coima"]);
  assert.equal(P.hechosDesde(chat, 0)[0].datos.usuario, ANA);
  // Numbers stay between 0 and 100.
  for (let i = 0; i < 100; i++) P.registrarHecho(chat, "coima", { usuario: ANA });
  assert.equal(fila(chat).seguridad, 0);
});

test("pueblo: con poca seguridad hay robos, y la prosperidad mueve sueldos y precios", async () => {
  const chat = "robos@g.us";
  await pueblo(chat);
  assert.equal(P.modificador(chat, "robo"), 0);
  fijar(chat, { seguridad: 25 });
  assert.equal(P.modificador(chat, "robo"), 10);
  fijar(chat, { seguridad: 0 });
  assert.equal(P.modificador(chat, "robo"), P.PUEBLO.ROBO_MAX);
  P._dep.azar = () => 5;
  assert.equal(P.huboRobo(chat), true);
  P._dep.azar = () => 50;
  assert.equal(P.huboRobo(chat), false);
  fijar(chat, { prosperidad: 100 });
  assert.equal(P.modificador(chat, "sueldo:mozo"), 1.15);
  assert.equal(P.modificador(chat, "precios"), 1.15);
  fijar(chat, { prosperidad: 0 });
  assert.equal(P.modificador(chat, "empresa:tambero"), 0.85);
});

test("pueblo: un evento sale, se anuncia y cambia lo que paga cada oficio por unos días", async () => {
  const chat = "fiesta@g.us";
  await pueblo(chat);
  const ahora = new Date();
  const id = await P.lanzarEvento(client, chat, ahora, "fiesta");
  assert.ok(id);
  assert.match(textoDe(ultimo()), /FIESTA DEL PUEBLO EN/);
  assert.match(textoDe(ultimo()), /cobran más: mozo/);
  assert.equal(P.eventosActivos(chat).length, 1);
  assert.ok(P.modificador(chat, "sueldo:mozo") > 1.3);
  assert.equal(P.modificador(chat, "sueldo:camionero"), 1 * P.modificador(chat, "precios"));
  assert.equal(P.modificador(chat, "changa:casamiento"), 1.5);
  assert.ok(P.modificador(chat, "encargo") >= 1);
  assert.equal(P.hechosDesde(chat, 0)[0].tipo, "evento");
  assert.ok(fila(chat).humor > 50);
  // Its end is scheduled; once it's gone by, it's over.
  const fin = db.prepare(`SELECT * FROM pendientes WHERE chat = ? AND tipo = 'pueblo_evento_fin'`).get(chat);
  assert.ok(fin);
  assert.equal(P.eventosActivos(chat, Date.now() + 3 * DIA).length, 0);
  assert.equal(await P.terminarEvento(id, Date.now() + 3 * DIA), null);
  assert.equal(P.eventosActivos(chat).length, 0);
});

test("pueblo: un evento no sale a un grupo callado, ni fuera de hora, ni más de los que entran", async () => {
  const chat = "callado@g.us";
  await pueblo(chat);
  db.prepare(`DELETE FROM actividad_horaria WHERE chat = ?`).run(chat);
  assert.equal(await P.lanzarEvento(client, chat, new Date(), "paro"), null);
  grupo(chat);
  P.PUEBLO.DESDE_HORA = 25;
  assert.equal(await P.lanzarEvento(client, chat, new Date(), "paro"), null);
  P.PUEBLO.DESDE_HORA = 0;
  assert.ok(await P.lanzarEvento(client, chat, new Date(), "paro"));
  assert.ok(await P.lanzarEvento(client, chat, new Date(), "temporal"));
  assert.equal(await P.lanzarEvento(client, chat, new Date(), "seca"), null, "ya hay dos corriendo");
  // The temporal sets the weather.
  assert.equal(P.estadoDe(chat).clima.texto, "temporal");
});

test("pueblo: el campeonato abre apuestas y al terminar se decide por los futbolistas", async () => {
  const chat = "campeonato@g.us";
  await pueblo(chat);
  oficio(chat, BETO, "futbolista", 40);
  const id = await P.lanzarEvento(client, chat, new Date(), "campeonato");
  const ev = db.prepare(`SELECT * FROM pueblo_eventos WHERE id = ?`).get(id);
  assert.ok(ev.mercado, "abrió un mercado");
  fijarSaldo(F, chat, CARLA, 100);
  const M = await import("../lib/mercados.js");
  assert.equal(M.jugar(chat, CARLA, ev.mercado, "1", 50).ok, true);
  assert.match(M.resolver(chat, ANA, ev.mercado, "1").error, /campeonato del pueblo/);
  assert.ok(P.chanceDeCampeonato(chat) > 30);
  P._dep.azar = () => 0; // under any chance: champions
  const r = await P.terminarEvento(id, Date.now() + 4 * DIA);
  assert.match(r.texto, /CAMPEÓN/);
  assert.equal(F.getSaldoCoins(chat, CARLA), 100, "nadie más apostó: recupera lo suyo");
  const [ultimoHecho] = P.hechosDesde(chat, 0, Infinity);
  assert.equal(ultimoHecho.tipo, "campeonato");
  assert.equal(ultimoHecho.datos.ganado, true);
});

test("pueblo: al apagarlo, el campeonato que corre devuelve las apuestas", async () => {
  const chat = "apagar@g.us";
  await pueblo(chat);
  await P.lanzarEvento(client, chat, new Date(), "campeonato");
  const ev = db.prepare(`SELECT * FROM pueblo_eventos WHERE chat = ?`).get(chat);
  fijarSaldo(F, chat, CARLA, 100);
  const M = await import("../lib/mercados.js");
  M.jugar(chat, CARLA, ev.mercado, "2", 40);
  assert.equal(F.getSaldoCoins(chat, CARLA), 60);
  await comando(chat, ANA, "pueblo off", { isAdmin: true });
  assert.equal(F.getSaldoCoins(chat, CARLA), 100);
  assert.match(textoDe(ultimo()), /anulado/);
});

test("pueblo: el día lleva los números hacia su reposo, una vez por día", async () => {
  const chat = "dia@g.us";
  await pueblo(chat);
  fijar(chat, { prosperidad: 90, humor: 10, dia: "2000-01-01" });
  assert.equal(P.diaDelPueblo(chat), true);
  const f = fila(chat);
  assert.ok(f.prosperidad < 90 && f.prosperidad > 50);
  assert.ok(f.humor > 10 && f.humor < 50);
  assert.equal(P.diaDelPueblo(chat), false, "una vez por día");
});

test("pueblo: el intendente ya no es automático; el electo fija el impuesto, una vez por semana", async () => {
  const chat = "intendente@g.us";
  await pueblo(chat);
  assert.equal(P.estadoDe(chat).intendente.persona, false);
  // The político of the highest level doesn't take over any more: the group elects (lib/elecciones.js).
  oficio(chat, BETO, "politico", 10); // nivel 3
  fijar(chat, { dia: "2000-01-01" });
  P.diaDelPueblo(chat);
  assert.equal(P.estadoDe(chat).intendente.persona, false, "nadie asume sin elecciones");
  assert.equal(P.evaluarIntendente, undefined);
  assert.match(await comando(chat, BETO, "impuesto 15"), /lo elige el grupo una vez por mes: \.elecciones/);
  fijar(chat, { intendente: BETO, mandatos: 1 });
  assert.equal(P.estadoDe(chat).intendente.usuario, BETO);
  // Only the intendente, within the limits, and once a week.
  assert.match(await comando(chat, ANA, "impuesto 5"), /lo fija @/);
  fijar(chat, { impuesto_fijado: 0 });
  assert.match(await comando(chat, BETO, "impuesto 40"), /va de 0 a 25/);
  assert.match(await comando(chat, BETO, "impuesto 15"), /subió el impuesto municipal de 10 % a \*15 %\*/);
  assert.equal(P.modificador(chat, "impuesto"), 0.15);
  assert.match(await comando(chat, BETO, "impuesto 5"), /una vez por semana/);
  assert.equal(P.cobrarImpuesto(chat, 200), 30);
  assert.equal(fila(chat).arcas, 30);
  // Out of the trade, still intendente: only a count or a juicio político take it away.
  oficio(chat, BETO, "mozo", 0);
  fijar(chat, { dia: "2000-01-01" });
  P.diaDelPueblo(chat);
  assert.equal(P.estadoDe(chat).intendente.usuario, BETO);
});

test("pueblo: con plata en las arcas, la intendencia hace obra y sube lo que está más bajo", async () => {
  const chat = "obra@g.us";
  await pueblo(chat);
  fijar(chat, { arcas: 450, seguridad: 20, dia: "2000-01-01" });
  P.diaDelPueblo(chat);
  const f = fila(chat);
  assert.equal(f.arcas, 50);
  const obra = P.hechosDesde(chat, 0).find((h) => h.tipo === "obra");
  assert.ok(obra);
  assert.equal(obra.datos.cual, "seguridad");
});

test("pueblo: los personajes se acuerdan", async () => {
  const chat = "memoria@g.us";
  await pueblo(chat);
  assert.equal(P.memoriaDe(chat, "comisario", ANA).veces, 0);
  P.recordar(chat, "comisario", ANA, "coima");
  P.recordar(chat, "comisario", ANA, "coima");
  P.recordar(chat, "comisario", BETO, "saboteo");
  assert.deepEqual(P.memoriaDe(chat, "comisario", ANA), { veces: 2, motivo: "coima" });
  assert.deepEqual(P.memoriasDe(chat, "comisario").map((m) => m.usuario), [ANA, BETO]);
  assert.match(await comando(chat, CARLA, "pueblo"), /tiene junados a/);
});

test("pueblo: el evento se agenda una vez por día, solo donde el grupo habló el día anterior", async () => {
  const chat = "agenda@g.us";
  await pueblo(chat);
  const ahora = new Date();
  ahora.setHours(9, 0, 0, 0);
  const ayer = new Date(ahora.getTime() - DIA);
  P._dep.azar = () => 0;
  const pendientes = () => db.prepare(`SELECT COUNT(*) AS n FROM pendientes WHERE chat = ? AND tipo = 'pueblo_evento'`).get(chat).n;
  P.chequearPueblos(ahora);
  assert.equal(pendientes(), 0, "el grupo no habló ayer");
  const otroDia = new Date(ahora.getTime() + DIA);
  for (let i = 0; i < 40; i++) F.sumarMensajeDiario(chat, ANA, A.claveDia(ahora));
  P.chequearPueblos(otroDia);
  assert.equal(pendientes(), 1);
  P.chequearPueblos(otroDia);
  assert.equal(pendientes(), 1, "una vez por día");
  assert.ok(ayer);
});

test("pueblo: la estación es la real, la del hemisferio sur", () => {
  assert.equal(P.estacionDe(new Date(2026, 0, 15)), "verano");
  assert.equal(P.estacionDe(new Date(2026, 3, 15)), "otoño");
  assert.equal(P.estacionDe(new Date(2026, 6, 15)), "invierno");
  assert.equal(P.estacionDe(new Date(2026, 10, 26)), "primavera");
  assert.equal(P.estacionDe(new Date(2026, 11, 1)), "verano");
});

test("pueblo: cada evento tiene lo que necesita, y los oficios y changas que nombra existen", async () => {
  const { OFICIOS } = await import("../lib/laburos.js");
  const { CHANGAS } = await import("../lib/changas.js");
  const { EMPRESAS } = await import("../lib/empresas.js");
  const changas = new Set(CHANGAS.map((c) => c.clave));
  for (const [clave, ev] of Object.entries(P.EVENTOS)) {
    assert.ok(ev.emoji && ev.nombre && ev.dias > 0 && typeof ev.anuncio === "function" && typeof ev.peso === "function", clave);
    for (const k of Object.keys(ev.sueldo || {})) assert.ok(k === "*" || OFICIOS[k], `${clave}: oficio ${k}`);
    for (const k of Object.keys(ev.empresa || {})) assert.ok(k === "*" || EMPRESAS[k], `${clave}: empresa ${k}`);
    for (const k of Object.keys(ev.changa || {})) assert.ok(changas.has(k), `${clave}: changa ${k}`);
  }
});
