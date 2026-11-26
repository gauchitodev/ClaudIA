import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, fijarSaldo } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";

// The Banco Central of each town (lib/banco.js, plugins/coins-banco.js): the rate that moves by itself and what moves
// it (the money, the prosperity, the events, the intendente), the fixed-term deposits, the bank's loans with their
// instalments, misses, seizure and auction, the loans between people, the clearing, and the bank in the town's board,
// its paper and Claudia's prompt. And nothing of it where the group isn't a town.
let F, B, P, L, D, T, Plugin, client;
const ANA = "300000000000081@lid";
const BETO = "300000000000082@lid";
const CARLA = "300000000000083@lid";
const DIA = 24 * 60 * 60 * 1000;
// A fixed moment, at 15:00 (the bank's hours are 10 to 21), so nothing depends on when the tests run.
const QUINCE = new Date(2026, 10, 25, 15, 0, 0).getTime();

before(async () => {
  ({ F } = await prepararBase("banco"));
  B = await import("../lib/banco.js");
  P = await import("../lib/pueblo.js");
  L = await import("../lib/laburos.js");
  D = await import("../lib/pueblo-diario.js");
  T = await import("../lib/tienda.js");
  Plugin = (await import("../plugins/coins-banco.js")).default;
});
beforeEach(() => {
  client = clienteFalso();
  conexion.client = client;
  B._dep.azar = () => 99;
  P._dep.azar = () => 0;
});

const saldo = (chat, u) => F.getSaldoCoins(chat, u);
const fijarPueblo = (chat, datos) => db.prepare(`UPDATE pueblos SET ${Object.keys(datos).map((k) => `${k} = ?`).join(", ")} WHERE chat = ?`).run(...Object.values(datos), chat);
const oficio = (chat, quien, laburo, nivel) => db.prepare(`INSERT OR REPLACE INTO laburos (chat, usuario, laburo, desde, ultimo_cobro, cobros) VALUES (?, ?, ?, ?, '', ?)`).run(chat, quien, laburo, QUINCE - 60 * DIA, L.cobrosParaNivel(nivel));
const prestamo = (chat, u) => db.prepare(`SELECT * FROM banco_prestamos WHERE chat = ? AND deudor = ? ORDER BY id DESC LIMIT 1`).get(chat, u);
const ronda = (chat, ahora) => B.rondaDelBanco(chat, ahora);

function grupo(chat, { conPueblo = true, plata = 1000 } = {}) {
  for (const [quien, nombre] of [[ANA, "Ana"], [BETO, "Beto"], [CARLA, "Carla"]]) {
    F.initDataDB({ chat, sender: quien, senderJid: "", pushName: nombre });
    fijarSaldo(F, chat, quien, plata);
  }
  if (conPueblo) {
    P.nacer(chat, "", QUINCE - 30 * DIA);
    F.updateChat(chat, { pueblo: 1 });
  }
}

// A company of the group, with its goods: [clave, ...] of the trade's.
function empresa(chat, patron, tipo, bienes, caja = 0) {
  const id = Number(db.prepare(`INSERT INTO empresas (chat, patron, tipo, nombre, caja, fundada, visto) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(chat, patron, tipo, "Fletes Ana", caja, QUINCE, Date.now()).lastInsertRowid);
  for (const b of bienes) db.prepare(`INSERT INTO empresas_bienes (empresa, bien, comprado) VALUES (?, ?, ?)`).run(id, b, QUINCE);
  return id;
}

async function comando(chat, quien, texto, { mencion = null } = {}) {
  const [command, ...args] = texto.split(/\s+/);
  const m = { chat, sender: quien, senderJid: "", text: `.${texto}`, isGroup: true, message: {}, mentionedJid: mencion ? [mencion] : [] };
  await Plugin.run(m, { client, command, args, text: args.join(" "), participants: [ANA, BETO, CARLA].map((id) => ({ id })) });
  return globalThis.enviados.at(-1)?.msg?.text || "";
}

test("banco: sin pueblo no hay banco, y nada se cobra ni se paga", async () => {
  const chat = "sinpueblo@g.us";
  grupo(chat, { conPueblo: false });
  assert.match(B.hacerPlazoFijo(chat, ANA, 500, 30, QUINCE).error, /Acá no hay banco/);
  assert.match(B.pedirPrestamo(chat, ANA, 500, 4, "bolsillo", QUINCE).error, /donde el grupo es un pueblo/);
  assert.match(B.ofrecerPrestamo(chat, ANA, BETO, 100, 10, 7, QUINCE).error, /Acá no hay banco/);
  assert.equal(ronda(chat, QUINCE), null);
  assert.equal(B.bancoParaPrompt(chat, ANA), "");
  assert.equal(B.lineaBancoPueblo(chat), "");
  assert.match(await comando(chat, ANA, "banco"), /Acá no hay banco/);
  assert.equal(saldo(chat, ANA), 1000);
});

test("plazo fijo: más plazo, más tasa; tope por nivel; vence solo con su interés, y romperlo antes lo pierde", () => {
  const chat = "plazos@g.us";
  grupo(chat, { plata: 5000 });
  const t30 = B.tasaPlazo(chat, 30, QUINCE);
  const t90 = B.tasaPlazo(chat, 90, QUINCE);
  const t180 = B.tasaPlazo(chat, 180, QUINCE);
  assert.ok(t30 < t90 && t90 < t180, `${t30} < ${t90} < ${t180}`);
  assert.equal(t180, B.BANCO.TASA_NEUTRA);
  assert.equal(B.tasaPlazo(chat, 45, QUINCE), null);
  assert.match(B.hacerPlazoFijo(chat, ANA, 500, 45, QUINCE).error, /30, 90, 180/);
  assert.match(B.hacerPlazoFijo(chat, ANA, 50, 30, QUINCE).error, /menos de 100/);
  // With no trade, a level 1's cap; with level 3, three times it.
  assert.match(B.hacerPlazoFijo(chat, ANA, B.BANCO.DEPOSITO_POR_NIVEL + 10, 30, QUINCE).error, /hasta 1000 UruCoins/);
  oficio(chat, ANA, "tambero", 3);
  const r = B.hacerPlazoFijo(chat, ANA, 1000, 30, QUINCE);
  assert.ok(r.ok, r.error);
  assert.equal(saldo(chat, ANA), 4000);
  const interes = B.interesDe(1000, t30, 30);
  assert.ok(interes > 0);
  assert.match(r.mensaje, new RegExp(`te vuelven \\*${1000 + interes}\\*`));
  assert.ok(B.hacerPlazoFijo(chat, ANA, 500, 180, QUINCE).ok);
  assert.match(B.hacerPlazoFijo(chat, ANA, 1700, 90, QUINCE).error, /podés poner 1500 más/);
  // Broken early: what went in, no interest.
  assert.match(B.romperPlazoFijo(chat, ANA, null, QUINCE).error, /Decime cuál/);
  assert.match(B.romperPlazoFijo(chat, ANA, 2, QUINCE + DIA).mensaje, /te vuelven los \*500\*/);
  assert.equal(saldo(chat, ANA), 4000);
  // The first one's term is up: the bank's round pays it, with its interest, and tells the group.
  assert.equal(ronda(chat, QUINCE + 29 * DIA)?.lineas.some((l) => l.includes("Venció el plazo fijo")) || false, false);
  const pago = ronda(chat, QUINCE + 30 * DIA + 60000);
  assert.ok(pago.lineas.some((l) => l.includes(`Venció el plazo fijo de @${ANA.split("@")[0]}`) && l.includes(`*${interes}* de interés`)));
  assert.equal(saldo(chat, ANA), 5000 + interes);
  assert.deepEqual(B.depositosDe(chat, ANA), []);
  assert.equal(B.estadoBanco(chat).intereses, interes);
});

test("la tasa: sube con la plata que crece y la prosperidad, baja en recesión, con los eventos y de a pasos", () => {
  const chat = "tasa@g.us";
  grupo(chat, { plata: 2000 });
  // A week of measures with the money steady: on target, the rate barely moves.
  for (let d = 0; d < 7; d++) B.moverTasa(chat, QUINCE + d * DIA);
  const quieta = B.estadoBanco(chat);
  assert.ok(Math.abs(quieta.inflacion) < 1, `inflación ${quieta.inflacion}`);
  // The money grows 30 % in a week: inflation, and the rate climbs, PASO_DIA a day at most.
  for (const u of [ANA, BETO, CARLA]) fijarSaldo(F, chat, u, 2600);
  B.moverTasa(chat, QUINCE + 7 * DIA);
  const e = B.estadoBanco(chat);
  assert.ok(e.inflacion >= 20, `inflación ${e.inflacion}`);
  assert.equal(e.tasa, quieta.tasa + B.BANCO.PASO_DIA);
  // The prices of the town follow it (lib/pueblo.js).
  assert.ok(P.modificador(chat, "precios") > 1.05);
  for (let d = 8; d < 30; d++) B.moverTasa(chat, QUINCE + d * DIA);
  assert.ok(B.estadoBanco(chat).tasa <= B.BANCO.TASA_MAX);
  // The group was told when it moved far, and the paper has it.
  assert.ok(P.hechosDesde(chat, 0, Infinity).some((h) => h.tipo === "tasa"));
  // A recession: the money shrinks, and the rate comes down.
  const alta = B.estadoBanco(chat).tasa;
  for (const u of [ANA, BETO, CARLA]) fijarSaldo(F, chat, u, 1200);
  for (let d = 30; d < 34; d++) B.moverTasa(chat, QUINCE + d * DIA);
  assert.ok(B.estadoBanco(chat).inflacion < 0, `inflación ${B.estadoBanco(chat).inflacion}`);
  assert.ok(B.estadoBanco(chat).tasa < alta);
  assert.ok(P.modificador(chat, "precios") < 1);
  // The objective: prosperity pushes it up, a dollar crisis adds its points.
  fijarPueblo(chat, { prosperidad: 50 });
  const base = B.objetivoTasa(chat, 0, QUINCE + 40 * DIA);
  assert.equal(base, B.BANCO.TASA_NEUTRA);
  fijarPueblo(chat, { prosperidad: 90 });
  assert.equal(B.objetivoTasa(chat, 0, QUINCE + 40 * DIA), base + 40 * B.BANCO.SENSIBILIDAD_PROSPERIDAD);
  fijarPueblo(chat, { prosperidad: 50 });
  db.prepare(`INSERT INTO pueblo_eventos (chat, clave, desde, hasta) VALUES (?, 'dolar', ?, ?)`).run(chat, QUINCE + 40 * DIA - 1000, QUINCE + 43 * DIA);
  assert.equal(B.objetivoTasa(chat, 0, QUINCE + 40 * DIA), base + P.EVENTOS.dolar.tasa);
  assert.match(B.textoBanco(chat, ANA, QUINCE + 40 * DIA).texto, /Crisis del dólar: \+15 puntos/);
  // Never out of its bounds, however wild the town.
  assert.equal(B.objetivoTasa(chat, 60, QUINCE + 40 * DIA), B.BANCO.TASA_MAX);
  assert.equal(B.objetivoTasa(chat, -40, QUINCE + 50 * DIA), B.BANCO.TASA_MIN);
});

test("el intendente aprieta al banco: solo él, una vez cada dos semanas, y la tasa barata puede rebotar", () => {
  const chat = "presion@g.us";
  grupo(chat);
  B.estadoBanco(chat);
  assert.match(B.presionarTasa(chat, ANA, "baja", QUINCE).error, /Para ser intendente/);
  fijarPueblo(chat, { intendente: ANA });
  assert.match(B.presionarTasa(chat, BETO, "baja", QUINCE).error, /ese es @/);
  assert.match(B.presionarTasa(chat, ANA, "costado", QUINCE).error, /¿Para dónde\?/);
  const antes = B.tasaDe(chat, QUINCE);
  const r = B.presionarTasa(chat, ANA, "baja", QUINCE);
  assert.ok(r.ok, r.error);
  assert.equal(B.tasaDe(chat, QUINCE), antes - B.BANCO.PRESION_PUNTOS);
  assert.deepEqual(r.mentions, [ANA]);
  assert.ok(P.hechosDesde(chat, 0, Infinity).some((h) => h.tipo === "tasa_presion"));
  assert.match(B.presionarTasa(chat, ANA, "sube", QUINCE + DIA).error, /Ya lo estás apretando/);
  // The market takes fright: the cheap rate is over and it bounces up.
  B._dep.azar = () => 0;
  const lineas = B.moverTasa(chat, QUINCE + DIA);
  assert.ok(lineas.some((l) => l.startsWith("💥")));
  assert.ok(B.tasaDe(chat, QUINCE + DIA) >= antes + B.BANCO.REBOTE_PUNTOS - B.BANCO.PASO_DIA);
  assert.ok(P.hechosDesde(chat, 0, Infinity).some((h) => h.tipo === "tasa_rebote"));
  assert.match(B.presionarTasa(chat, ANA, "baja", QUINCE + 2 * DIA).error, /ofendido/);
  assert.match(B.presionarTasa(chat, ANA, "sube", QUINCE + 9 * DIA).error, /una vez cada 14 días/);
  // Up: no risk, and the rate is higher for some days.
  const r2 = B.presionarTasa(chat, ANA, "sube", QUINCE + 15 * DIA);
  assert.ok(r2.ok, r2.error);
  assert.match(r2.mensaje, /enfríe el pueblo/);
  assert.equal(B.tasaDe(chat, QUINCE + 23 * DIA), Math.round(B.estadoBanco(chat).tasa), "a la semana se terminó");
});

test("préstamo del banco: límite por nivel, bienes e historial; cuotas solas; al día sube el límite", () => {
  const chat = "prestamo@g.us";
  grupo(chat, { plata: 0 });
  assert.match(B.limiteDe(chat, ANA, QUINCE).motivo, /gente con laburo/);
  oficio(chat, ANA, "camionero", 1);
  assert.match(B.limiteDe(chat, ANA, QUINCE).motivo, /desde el nivel 2/);
  oficio(chat, ANA, "camionero", 4);
  const solo = B.limiteDe(chat, ANA, QUINCE).limite;
  assert.equal(solo, 4 * B.BANCO.LIMITE_POR_NIVEL);
  // What one owns counts: a car and a company's goods.
  T.fijarEscalon(chat, ANA, "auto", 2);
  empresa(chat, ANA, "camionero", ["camion"], 0);
  const conBienes = B.limiteDe(chat, ANA, QUINCE);
  assert.ok(conBienes.limite > solo);
  assert.ok(conBienes.patrimonio >= 400 + 900);
  assert.match(B.textoCondiciones(chat, ANA, QUINCE), /te presta hasta/);
  assert.match(B.pedirPrestamo(chat, ANA, conBienes.limite + 10, 2, "bolsillo", QUINCE).error, /te presta hasta/);
  assert.match(B.pedirPrestamo(chat, ANA, 500, 9, "bolsillo", QUINCE).error, /de 1 a 8/);
  // To the company's caja, paid back from it.
  const r = B.pedirPrestamo(chat, ANA, 600, 2, "caja", QUINCE);
  assert.ok(r.ok, r.error);
  assert.equal(db.prepare(`SELECT caja FROM empresas WHERE patron = ?`).get(ANA).caja, 600);
  assert.match(B.pedirPrestamo(chat, ANA, 100, 2, "bolsillo", QUINCE).error, /de a uno/);
  const p = prestamo(chat, ANA);
  assert.ok(p.total > 600 && p.tna === Math.round(B.BANCO.TASA_NEUTRA * B.BANCO.PRESTAMO_FACTOR));
  assert.equal(p.cuota, Math.ceil(p.total / 2));
  // A week: the first instalment goes on its own.
  ronda(chat, QUINCE + 7 * DIA + 1000);
  assert.equal(prestamo(chat, ANA).saldo, p.total - p.cuota);
  assert.equal(db.prepare(`SELECT caja FROM empresas WHERE patron = ?`).get(ANA).caja, 600 - p.cuota);
  // Paid ahead with .pagar: clean, the record grows and so does the limit.
  fijarSaldo(F, chat, ANA, 1000);
  assert.match(B.pagarPrestamo(chat, ANA, null, QUINCE + 8 * DIA).mensaje, /cancelaste el préstamo/);
  assert.equal(prestamo(chat, ANA).estado, "pagado");
  assert.equal(B.limiteDe(chat, ANA, QUINCE + 8 * DIA).limpios, 1);
  assert.ok(B.limiteDe(chat, ANA, QUINCE + 8 * DIA).limite > conBienes.limite);
  assert.equal(B.calificacionDe(chat, ANA, QUINCE + 8 * DIA), "al_dia");
  assert.equal(B.estadoBanco(chat).prestado, 600);
  assert.equal(B.estadoBanco(chat).cobrado, p.total);
});

test("el que no paga: recargo y atrasado, después embargo, moroso, remate en el grupo y sale en el diario", () => {
  const chat = "embargo@g.us";
  grupo(chat, { plata: 0 });
  oficio(chat, ANA, "tambero", 5);
  oficio(chat, ANA, "tambero", 5);
  T.fijarEscalon(chat, ANA, "casa", 2); // a chalet
  fijarSaldo(F, chat, ANA, 0);
  assert.ok(B.pedirPrestamo(chat, ANA, 500, 2, "bolsillo", QUINCE).ok);
  assert.ok(B.hacerPlazoFijo(chat, ANA, 100, 30, QUINCE).ok);
  fijarSaldo(F, chat, ANA, 0); // spent it all
  const p0 = prestamo(chat, ANA);
  // The first instalment, missed.
  const r1 = ronda(chat, QUINCE + 7 * DIA + 1000);
  assert.ok(r1.lineas.some((l) => /no había para la cuota del banco/.test(l) && /Una más sin pagar y te embargan/.test(l)));
  const p1 = prestamo(chat, ANA);
  assert.equal(p1.fallas, 1);
  assert.ok(p1.recargos > 0 && p1.saldo === p0.total + p1.recargos);
  assert.equal(B.calificacionDe(chat, ANA, QUINCE + 8 * DIA), "atrasado");
  assert.ok(B.tasaPrestamo(chat, ANA, QUINCE + 8 * DIA) > Math.round(B.tasaDe(chat, QUINCE + 8 * DIA) * B.BANCO.PRESTAMO_FACTOR));
  // The second: seizure. Deposits broken into the debt, the chalet up for auction.
  const r2 = ronda(chat, QUINCE + 14 * DIA + 1000);
  assert.ok(r2.lineas.some((l) => l.includes("EMBARGO") && l.includes("moroso")));
  assert.ok(r2.lineas.some((l) => /REMATE N° \d+/.test(l) && l.includes("Chalet")));
  assert.equal(B.calificacionDe(chat, ANA, QUINCE + 14 * DIA), "moroso");
  assert.equal(T.escalonDe(chat, ANA, "casa").nombre, "Rancho", "le queda el escalón de abajo");
  assert.deepEqual(B.depositosDe(chat, ANA), []);
  const deuda = prestamo(chat, ANA).saldo;
  assert.ok(P.hechosDesde(chat, 0, Infinity).some((h) => h.tipo === "moroso" && h.usuario === ANA));
  // A moroso borrows nothing, deposits nothing and signs nothing.
  assert.match(B.limiteDe(chat, ANA, QUINCE + 14 * DIA).motivo, /moroso/);
  assert.match(B.hacerPlazoFijo(chat, ANA, 100, 30, QUINCE + 14 * DIA).error, /moroso/);
  // The auction: the debtor can't bid, a bid under the base doesn't go, the best one that can pay wins.
  const [remate] = B.rematesAbiertos(chat);
  assert.equal(remate.base, 225);
  assert.match(B.ofertar(chat, ANA, 300, null, QUINCE + 14 * DIA).error, /tu propio remate/);
  assert.match(B.ofertar(chat, BETO, 100, null, QUINCE + 14 * DIA).error, /La base es 225/);
  fijarSaldo(F, chat, BETO, 1000);
  fijarSaldo(F, chat, CARLA, 1000);
  assert.ok(B.ofertar(chat, BETO, 300, null, QUINCE + 14 * DIA).ok);
  assert.match(B.ofertar(chat, CARLA, 305, null, QUINCE + 14 * DIA).error, /310 o más/);
  assert.ok(B.ofertar(chat, CARLA, 400, null, QUINCE + 14 * DIA).ok);
  assert.match(B.textoRemates(chat, QUINCE + 14 * DIA), /va ganando Carla con 400/);
  fijarSaldo(F, chat, CARLA, 10); // Carla spent it: Beto takes it
  const cierre = B.cerrarRemate(remate.id, QUINCE + 15 * DIA);
  assert.match(cierre.texto, /Vendido.+Chalet.+por \*300\*/);
  assert.equal(T.escalonDe(chat, BETO, "casa").nombre, "Chalet");
  assert.equal(saldo(chat, BETO), 700);
  assert.equal(prestamo(chat, ANA).saldo, deuda - 300);
  assert.ok(P.hechosDesde(chat, 0, Infinity).some((h) => h.tipo === "remate"));
  assert.equal(B.cerrarRemate(remate.id, QUINCE + 15 * DIA), null, "se cierra una vez");
  // What's left is taken from what she earns, half of it a day: nobody is broke for good.
  fijarSaldo(F, chat, ANA, 100);
  const quedaba = prestamo(chat, ANA).saldo;
  ronda(chat, QUINCE + 16 * DIA);
  assert.equal(saldo(chat, ANA), 50);
  assert.equal(prestamo(chat, ANA).saldo, quedaba - 50);
  // The paper has a headline for each of the bank's facts.
  for (const tipo of ["tasa", "tasa_presion", "tasa_rebote", "moroso", "remate", "prestamo"]) assert.ok(D.TITULARES[tipo], tipo);
  assert.match(B.textoClearing(chat, QUINCE + 16 * DIA).texto, /🚨 Ana: moroso/);
  // Paid up, the stain lasts its days and goes.
  fijarSaldo(F, chat, ANA, 5000);
  assert.ok(B.pagarPrestamo(chat, ANA, null, QUINCE + 17 * DIA).ok);
  assert.equal(B.calificacionDe(chat, ANA, QUINCE + 18 * DIA), "moroso");
  assert.equal(B.calificacionDe(chat, ANA, QUINCE + 17 * DIA + (B.BANCO.MOROSO_DIAS + 1) * DIA), "al_dia");
});

test("embargo: a la empresa le dejan el último bien con que trabajar, y sin ofertas va al chatarrero", () => {
  const chat = "chatarra@g.us";
  grupo(chat, { plata: 0 });
  oficio(chat, ANA, "camionero", 10);
  const id = empresa(chat, ANA, "camionero", ["camion", "galpon"], 0);
  assert.ok(B.pedirPrestamo(chat, ANA, 1000, 2, "caja", QUINCE).ok);
  db.prepare(`UPDATE empresas SET caja = 0 WHERE patron = ?`).run(ANA);
  ronda(chat, QUINCE + 7 * DIA + 1000);
  const r = ronda(chat, QUINCE + 14 * DIA + 1000);
  assert.ok(r.lineas.some((l) => l.includes("Galpón")), "embargan el galpón, no el camión");
  const bienes = db.prepare(`SELECT bien FROM empresas_bienes WHERE empresa = ?`).all(id).map((b) => b.bien);
  assert.deepEqual(bienes, ["camion"]);
  const [remate] = B.rematesAbiertos(chat);
  // Beto has no company of the rubro: he can't bid.
  fijarSaldo(F, chat, BETO, 2000);
  assert.match(B.ofertar(chat, BETO, remate.base, null, QUINCE + 14 * DIA).error, /empresa de transportista/);
  const deuda = prestamo(chat, ANA).saldo;
  const cierre = B.cerrarRemate(remate.id, QUINCE + 15 * DIA);
  assert.match(cierre.texto, /chatarrero/);
  assert.equal(prestamo(chat, ANA).saldo, deuda - Math.ceil(remate.valor * B.BANCO.REMATE_CHATARRA));
});

test("préstamo entre vecinos: oferta, firma, se cobra solo al vencer; sin plata, clearing y al diario", () => {
  const chat = "p2p@g.us";
  grupo(chat, { plata: 1000 });
  assert.match(B.ofrecerPrestamo(chat, ANA, BETO, 100, 60, 7, QUINCE).error, /de 0 a 50 %/);
  assert.match(B.ofrecerPrestamo(chat, ANA, BETO, 5000, 10, 7, QUINCE).error, /hay que tenerlos/);
  assert.match(B.ofrecerPrestamo(chat, ANA, ANA, 100, 10, 7, QUINCE).error, /a vos mismo/);
  const o = B.ofrecerPrestamo(chat, ANA, BETO, 400, 10, 5, QUINCE);
  assert.ok(o.ok, o.error);
  assert.match(o.mensaje, /devuelve \*440\*/);
  assert.equal(saldo(chat, ANA), 1000, "la plata se mueve al firmar");
  assert.match(B.firmarPrestamo(chat, CARLA, null, QUINCE).error, /ningún contrato/);
  assert.ok(B.firmarPrestamo(chat, BETO, null, QUINCE + 1000).ok);
  assert.equal(saldo(chat, ANA), 600);
  assert.equal(saldo(chat, BETO), 1400);
  // Paid at its date, from the pocket to the lender, on its own.
  ronda(chat, QUINCE + 5 * DIA + 2000);
  assert.equal(saldo(chat, ANA), 1040);
  assert.equal(saldo(chat, BETO), 960);
  assert.equal(B.calificacionDe(chat, BETO, QUINCE + 6 * DIA), "al_dia");
  // Another one, and Beto spends it all.
  assert.ok(B.ofrecerPrestamo(chat, ANA, BETO, 300, 0, 3, QUINCE + 6 * DIA).ok);
  assert.ok(B.firmarPrestamo(chat, BETO, ANA, QUINCE + 6 * DIA).ok);
  fijarSaldo(F, chat, BETO, 0);
  const r = ronda(chat, QUINCE + 9 * DIA + 1000);
  assert.ok(r.lineas.some((l) => l.includes("no había con qué") && l.includes("atrasado")));
  assert.equal(B.calificacionDe(chat, BETO, QUINCE + 10 * DIA), "atrasado");
  // A week overdue: moroso, in the paper.
  for (let d = 10; d <= 17; d++) ronda(chat, QUINCE + d * DIA + 1000);
  assert.equal(B.calificacionDe(chat, BETO, QUINCE + 17 * DIA), "moroso");
  assert.ok(P.hechosDesde(chat, 0, Infinity).some((h) => h.tipo === "moroso" && h.datos.acreedor === ANA));
  assert.match(B.ofrecerPrestamo(chat, CARLA, BETO, 100, 0, 3, QUINCE + 17 * DIA).error, /moroso/);
  // He pays with .pagar @Ana, and it's over.
  fijarSaldo(F, chat, BETO, 500);
  const antes = saldo(chat, ANA);
  assert.match(B.pagarAPersona(chat, BETO, ANA, null, QUINCE + 17 * DIA).mensaje, /cancelado/);
  assert.equal(saldo(chat, ANA), antes + 300);
});

test("el tablero, el del pueblo y lo que se le cuenta a Claudia", async () => {
  const chat = "tablero@g.us";
  grupo(chat, { plata: 2000 });
  oficio(chat, ANA, "tambero", 3);
  B.hacerPlazoFijo(chat, ANA, 500, 90, Date.now());
  const t = B.textoBanco(chat, ANA).texto;
  assert.match(t, /BANCO CENTRAL DEL PUEBLO/);
  assert.match(t, /Tasa de referencia: \*50 % anual\* · inflación: todavía la estamos midiendo/);
  assert.match(t, /1\) 500 a 90 días/);
  assert.match(t, /calificación: al día/);
  assert.match((await P.textoPueblo(chat)).texto, /🏦 El Banco Central: tasa 50 % anual \(\.banco\)/);
  assert.match(B.bancoParaPrompt(chat, ANA), /tasa de referencia 50 % anual/);
  assert.ok(P.hablaDelPueblo("che, ¿cómo está la tasa del banco?"));
  assert.ok(P.hablaDelPueblo("me prestás 100?"));
  // The commands.
  assert.match(await comando(chat, ANA, "banco"), /Lo tuyo/);
  assert.match(await comando(chat, ANA, "prestamo"), /te presta hasta/);
  assert.match(await comando(chat, ANA, "plazofijo 1.000 30"), /podés poner 1300 más|Plazo fijo hecho/);
  assert.match(await comando(chat, ANA, `prestar @${BETO.split("@")[0]} 200 10 14`, { mencion: BETO }), /Contrato a la firma/);
  assert.match(await comando(chat, BETO, "firmarprestamo"), /Firmado/);
  assert.match(await comando(chat, BETO, `pagar @${ANA.split("@")[0]} 100`, { mencion: ANA }), /Todavía le debés 120/);
  assert.match(await comando(chat, ANA, "tasa"), /50 % anual/);
  assert.match(await comando(chat, ANA, "clearing"), /limpito/);
  assert.match(await comando(chat, ANA, "remate"), /No hay remates abiertos/);
});

// Claudia's manual says the bank's numbers as they are (lib/manual-claudia.js is written by hand), and she's told it
// when someone asks how the bank works.
test("el manual de Claudia dice los números del banco como están, y se lo cuento cuando preguntan", async () => {
  const { MANUAL, conocimientoPara } = await import("../lib/manual-claudia.js");
  const { MUNDO } = await import("../lib/mundo.js");
  const K = B.BANCO;
  const dichos = [
    MUNDO.BANCO,
    `bienvenida a ${MUNDO.NOMBRE}`,
    `entre ${K.TASA_MIN} y ${K.TASA_MAX} %`,
    `descansa en ${K.TASA_NEUTRA}`,
    `de a ${K.PASO_DIA} puntos por día`,
    `${K.META_INFLACION} % por semana`,
    `crisis del dólar +${P.EVENTOS.dolar.tasa}`,
    `${K.PRESION_PUNTOS} puntos menos por ${K.PRESION_DIAS} días`,
    `hay ${K.PRESION_RIESGO} % de que la plaza se asuste y la tasa rebote ${K.REBOTE_PUNTOS} puntos`,
    `una vez cada ${K.PRESION_CADA_DIAS} días`,
    `pagan ${Object.values(K.PLAZOS).map((x) => Math.round(x * 100)).join(", ").replace(/, (\d+)$/, " y $1")} % de la tasa`,
    `Mínimo ${K.DEPOSITO_MIN}, hasta ${K.DEPOSITO_POR_NIVEL} por cada nivel`,
    `${K.DEPOSITOS_ABIERTOS} abiertos`,
    `desde el nivel ${K.NIVEL_MIN} del oficio: ${K.LIMITE_POR_NIVEL} por nivel más el ${Math.round(K.PATRIMONIO_PARTE * 100)} %`,
    `${Math.round(K.HISTORIAL_BONUS * 100)} % más por cada préstamo pagado sin atrasos (hasta ${K.HISTORIAL_MAX})`,
    `hasta ${K.LIMITE_MAX}; uno a la vez`,
    `Cuesta ${String(K.PRESTAMO_FACTOR).replace(".", ",")} veces la tasa (más ${K.ATRASADO_PUNTOS} puntos`,
    `(de 1 a ${K.SEMANAS_MAX})`,
    `${Math.round(K.RECARGO * 100)} % de recargo`,
    `(${K.ATRASADO_DIAS} atrasado, ${K.MOROSO_DIAS} moroso)`,
    `(de 0 a ${K.P2P_INTERES_MAX})`,
    `(de 1 a ${K.P2P_DIAS_MAX})`,
    `dentro de ${K.P2P_OFERTA_HORAS} horas`,
    `Hasta ${K.P2P_ABIERTOS} contratos`,
  ];
  for (const d of dichos) assert.ok(MANUAL.includes(d), `el manual no dice «${d}»`);
  assert.ok(MANUAL.includes(`entre −${-P.PUEBLO.PRECIOS_INFLACION_MIN} y +${P.PUEBLO.PRECIOS_INFLACION_MAX} %`), "los precios");
  for (const pregunta of ["¿cómo pido un préstamo?", "che claudia qué es el clearing", "cómo hago un plazo fijo"]) assert.match(conocimientoPara(pregunta) || "", /EL BANCO CENTRAL DEL PUEBLO/, pregunta);
});

// What a review found (lib/banco.js): a stain whose days were up didn't come back worse; a backlog after a gap was
// charged as misses in a few rounds; and an overdue contract was taken from twice a day.
test("la mancha vencida no vuelve agravada, un atraso de días no se cobra de golpe, y lo vencido se cobra una vez por día", () => {
  const chat = "revision@g.us";
  grupo(chat, { plata: 0 });
  // An old moroso whose stain is up, who misses one instalment now: atrasado, not moroso.
  db.prepare(`INSERT INTO banco_clientes (chat, usuario, estado, hasta) VALUES (?, ?, 'moroso', ?)`).run(chat, ANA, QUINCE - DIA);
  oficio(chat, ANA, "tambero", 4);
  assert.ok(B.pedirPrestamo(chat, ANA, 300, 4, "bolsillo", QUINCE).ok);
  fijarSaldo(F, chat, ANA, 0);
  ronda(chat, QUINCE + 7 * DIA + 1000);
  assert.equal(B.calificacionDe(chat, ANA, QUINCE + 7 * DIA + 2000), "atrasado");
  // The bot was off three weeks: the dates gone by count as one miss, not as a seizure in two rounds.
  const antes = prestamo(chat, ANA);
  ronda(chat, QUINCE + 30 * DIA);
  ronda(chat, QUINCE + 30 * DIA + 5 * 60 * 1000);
  const despues = prestamo(chat, ANA);
  assert.equal(despues.fallas, antes.fallas + 1);
  assert.ok(despues.proxima > QUINCE + 30 * DIA);
  // A contract overdue: half of the pocket a day, not twice.
  fijarSaldo(F, chat, BETO, 500);
  assert.ok(B.ofrecerPrestamo(chat, BETO, CARLA, 400, 0, 1, QUINCE).ok);
  assert.ok(B.firmarPrestamo(chat, CARLA, BETO, QUINCE).ok);
  fijarSaldo(F, chat, CARLA, 0);
  ronda(chat, QUINCE + DIA + 1000); // due: nothing there, overdue
  fijarSaldo(F, chat, CARLA, 400);
  const dia2 = new Date(QUINCE + 2 * DIA);
  ronda(chat, dia2.setHours(10, 0, 0, 0)); // the day's first round
  ronda(chat, QUINCE + 2 * DIA + 2000); // the contract's hour
  assert.equal(saldo(chat, CARLA), 200);
});
