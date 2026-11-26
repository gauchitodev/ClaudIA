import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, fijarSaldo } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";

// What the town (lib/pueblo.js) does to the other modules and what they tell it: the wages of the trades, the payday
// scenes and the comisario, the companies (billing, tax, robberies, prices), the changas, the urgent errands and the
// secret missions. Each with the town on; with it off, their own tests keep the numbers they always had.
let F, P, L, ES, EM, CH, EN, SP, client;
const ANA = "300000000000061@lid";
const BETO = "300000000000062@lid";
const CARLA = "300000000000063@lid";
const DANI = "300000000000064@lid";
const DIA = 24 * 60 * 60 * 1000;

before(async () => {
  ({ F } = await prepararBase("pueblo-cruces"));
  P = await import("../lib/pueblo.js");
  L = await import("../lib/laburos.js");
  ES = await import("../lib/escenas.js");
  EM = await import("../lib/empresas.js");
  CH = await import("../lib/changas.js");
  EN = await import("../lib/encargos.js");
  SP = await import("../lib/espias.js");
});
beforeEach(() => {
  client = clienteFalso();
  conexion.client = client;
  P._dep.azar = () => 0;
});

const oficio = (chat, quien, laburo, cobros = 0) => db.prepare(`INSERT OR REPLACE INTO laburos (chat, usuario, laburo, desde, ultimo_cobro, cobros) VALUES (?, ?, ?, ?, '', ?)`).run(chat, quien, laburo, Date.now() - 30 * DIA, cobros);
const fijar = (chat, datos) => db.prepare(`UPDATE pueblos SET ${Object.keys(datos).map((k) => `${k} = ?`).join(", ")} WHERE chat = ?`).run(...Object.values(datos), chat);
const fila = (chat) => db.prepare(`SELECT * FROM pueblos WHERE chat = ?`).get(chat);
const hechos = (chat) => P.hechosDesde(chat, 0, Infinity);
// An event running right now, with no announcement.
const evento = (chat, clave) => db.prepare(`INSERT INTO pueblo_eventos (chat, clave, desde, hasta, estado) VALUES (?, ?, ?, ?, 'activo')`).run(chat, clave, Date.now() - 1000, Date.now() + DIA);

function grupo(chat, { conPueblo = true } = {}) {
  for (const [quien, nombre] of [[ANA, "Ana"], [BETO, "Beto"], [CARLA, "Carla"], [DANI, "Dani"]]) F.initDataDB({ chat, sender: quien, senderJid: "", pushName: nombre });
  if (conPueblo) {
    P.nacer(chat);
    F.updateChat(chat, { pueblo: 1 });
  }
}

test("laburos: el sueldo sigue al pueblo, y el cobro dice por qué", () => {
  const chat = "sueldo@g.us";
  grupo(chat, { conPueblo: false });
  oficio(chat, ANA, "mozo");
  const sinPueblo = L.jornalDe(chat, ANA, L.laburoDe(chat, ANA)).jornal;
  grupo(chat);
  evento(chat, "fiesta");
  const conFiesta = L.jornalDe(chat, ANA, L.laburoDe(chat, ANA));
  assert.ok(Math.abs(conFiesta.jornal - sinPueblo * 1.4) < 1e-9);
  const r = L.cobrar(chat, ANA);
  assert.match(r.mensaje, /🏘️ En el pueblo hoy tu oficio cobra \+40 % \(fiesta del pueblo\)/);
});

test("escenas: coimear donde controlan baja la seguridad, el comisario se acuerda y después te tiene junado", () => {
  const chat = "coima@g.us";
  grupo(chat);
  oficio(chat, ANA, "camionero", 5);
  const abrir = () => db.prepare(`INSERT OR REPLACE INTO laburos_escenas (chat, usuario, escena, jornal, mensaje_id, vence) VALUES (?, ?, 'camionero/caminera', 30, '', ?)`).run(chat, ANA, Date.now() + 600000);
  const seguridad = fila(chat).seguridad;
  ES._dep.azar = () => 0;
  abrir();
  assert.equal(ES.elegirEnEscena(chat, ANA, 1).ok, true); // Coimear
  assert.equal(fila(chat).seguridad, seguridad - 1.5);
  assert.equal(hechos(chat)[0].tipo, "coima");
  assert.equal(P.memoriaDe(chat, "comisario", ANA).veces, 1);
  abrir();
  ES.elegirEnEscena(chat, ANA, 1);
  assert.equal(P.memoriaDe(chat, "comisario", ANA).veces, 2);
  // Now he knows her: the crooked option loses COMISARIO_CASTIGO points. Coimear is 50 %: a 45 used to go well.
  ES._dep.azar = () => 45;
  abrir();
  const r = ES.elegirEnEscena(chat, ANA, 1);
  assert.equal(r.salioBien, false);
  // The straight option where somebody inspects makes the town safer.
  const antes = fila(chat).seguridad;
  abrir();
  ES.elegirEnEscena(chat, ANA, 3);
  assert.equal(fila(chat).seguridad, antes + 0.5);
});

test("escenas: el comisario aparece en el mensaje de la escena de control para el que tiene junado", () => {
  const chat = "junado@g.us";
  grupo(chat);
  oficio(chat, ANA, "camionero", 5);
  P.recordar(chat, "comisario", ANA, "coima");
  P.recordar(chat, "comisario", ANA, "coima");
  // The dice: a scene (0 < CHANCE), and then the first of the weighted list, the trade's caminera (control).
  ES._dep.azar = () => 0;
  const r = ES.cobrarConEscena(chat, ANA);
  assert.equal(r.escena, true);
  assert.match(r.mensaje, /el comisario \w+, que ya te tiene junado/);
});

async function empresa(chat) {
  oficio(chat, ANA, "camionero", L.cobrosParaNivel(10));
  fijarSaldo(F, chat, ANA, 2000);
  assert.equal(EM.fundar(chat, ANA, "Fletes Ana").ok, true);
  return EM.empresaDe(chat, ANA);
}

test("empresas: fundar es noticia, la jornada paga impuesto municipal y la prosperidad sube", async () => {
  const chat = "empresa@g.us";
  grupo(chat);
  await empresa(chat);
  assert.equal(hechos(chat)[0].tipo, "empresa_fundada");
  assert.equal(hechos(chat)[0].datos.nombre, "Fletes Ana");
  EM._dep.azar = (n) => n - 1; // nothing breaks
  const prosperidad = fila(chat).prosperidad;
  const r = EM.jornadaDelPatron(chat, ANA);
  assert.match(r.mensaje, /de impuesto municipal\)/);
  const e = EM.empresaDe(chat, ANA);
  const impuesto = fila(chat).arcas;
  assert.ok(impuesto > 0);
  assert.equal(e.caja + impuesto, e.facturado, "a la caja va lo facturado menos el impuesto");
  assert.ok(fila(chat).prosperidad > prosperidad);
});

test("empresas: sin pueblo, la jornada factura entera y no hay impuesto", async () => {
  const chat = "sinpueblo@g.us";
  grupo(chat, { conPueblo: false });
  await empresa(chat);
  EM._dep.azar = (n) => n - 1; // nothing breaks
  const r = EM.jornadaDelPatron(chat, ANA);
  assert.doesNotMatch(r.mensaje, /impuesto/);
  const e = EM.empresaDe(chat, ANA);
  assert.equal(e.caja, e.facturado);
});

test("empresas: con la seguridad por el piso roban, y los precios siguen a la prosperidad", async () => {
  const chat = "robo@g.us";
  grupo(chat);
  await empresa(chat);
  db.prepare(`UPDATE empresas SET caja = 1000 WHERE patron = ? AND chat = ?`).run(ANA, chat);
  fijar(chat, { seguridad: 0, impuesto: 0 });
  EM._dep.azar = (n) => n - 1; // nothing breaks
  P._dep.azar = () => 0;
  const r = EM.jornadaDelPatron(chat, ANA);
  // What the shift billed goes in first, and a robbery takes ROBO_EMPRESA of the cash box.
  const robado = Math.floor((1000 + r.monto) * P.PUEBLO.ROBO_EMPRESA);
  assert.match(r.mensaje, new RegExp(`entraron a robar a \\*Fletes Ana\\*: se llevaron \\*${robado}\\*`));
  assert.equal(EM.empresaDe(chat, ANA).caja, 1000 + r.monto - robado);
  assert.ok(hechos(chat).some((h) => h.tipo === "robo_empresa" && h.datos.monto === robado));
  fijar(chat, { prosperidad: 100 });
  assert.match(EM.textoBienes(EM.empresaDe(chat, ANA)), /Semirremolque\* — 2530/);
});

test("changas: la seca hace pagar más la cosecha, y la changa hecha o vacía es noticia", () => {
  const chat = "changa@g.us";
  grupo(chat);
  evento(chat, "seca");
  const crear = (clave) => Number(db.prepare(`INSERT INTO changas (chat, creador, clave, titulo, cupos, paga, mensaje_id, vence, estado, creada) VALUES (?, '', ?, 'Cosecha', 2, 100, '', ?, 'abierta', ?)`).run(chat, clave, Date.now() + 600000, Date.now()).lastInsertRowid);
  CH._dep.azar = () => 99; // no event on the job
  crear("papas");
  CH.anotarse(chat, BETO);
  const r = CH.anotarse(chat, CARLA);
  assert.ok(r.hecha);
  assert.equal(r.hecha.pagas.get(BETO), 150);
  assert.match(r.texto, /Con seca en el pueblo, pagó 50 % más/);
  assert.equal(hechos(chat)[0].tipo, "changa_hecha");
  const id = crear("mudanza");
  assert.ok(CH.vencerChanga(id, Date.now() + DIA));
  assert.equal(hechos(chat)[0].tipo, "changa_vacia");
});

test("encargos: el temporal baja la chance, a la vuelta pueden robar el premio y queda en el diario", () => {
  const chat = "encargo@g.us";
  grupo(chat);
  evento(chat, "temporal");
  const clave = EN.todasLasClaves()[0];
  const encargo = EN.buscarEncargo(clave);
  const id = Number(db.prepare(`INSERT INTO encargos (chat, usuario, clave, camino, creada, vence) VALUES (?, ?, ?, 1, ?, ?)`).run(chat, ANA, clave, Date.now() - 3600000, Date.now() - 1).lastInsertRowid);
  fijar(chat, { seguridad: 0 });
  EN._dep.azar = () => 0; // it goes well
  P._dep.azar = () => 0; // and it's robbed
  const r = EN.vencerEncargo(id);
  assert.equal(r.salioBien, true);
  const puntos = P.modificador(chat, "encargo");
  assert.ok(puntos <= -5);
  assert.equal(r.chance, Math.max(5, encargo.caminos[0].chance + puntos));
  assert.match(r.texto, /por temporal/);
  assert.equal(r.robado, Math.floor(encargo.caminos[0].premio * 0.5));
  assert.match(r.texto, /le arrebataron/);
  assert.equal(r.premio, encargo.caminos[0].premio - r.robado);
  const tipos = hechos(chat).map((h) => h.tipo);
  assert.ok(tipos.includes("cumplio_encargo") && tipos.includes("robo_encargo"));
});

test("encargos: al saboteador que pescan lo anota el comisario", () => {
  const chat = "saboteo@g.us";
  grupo(chat);
  const clave = EN.todasLasClaves()[0];
  const id = Number(db.prepare(`INSERT INTO encargos (chat, usuario, clave, camino, creada, vence) VALUES (?, ?, ?, 1, ?, ?)`).run(chat, ANA, clave, Date.now() - 3600000, Date.now() - 1).lastInsertRowid);
  db.prepare(`INSERT INTO encargos_aportes (encargo, usuario, tipo, cantidad) VALUES (?, ?, 'sabotaje', 20)`).run(id, BETO);
  EN._dep.azar = () => 0;
  P._dep.azar = () => 99;
  EN.vencerEncargo(id);
  assert.equal(P.memoriaDe(chat, "comisario", BETO).motivo, "sabotaje");
  assert.ok(hechos(chat).some((h) => h.tipo === "saboteador" && h.usuario === BETO));
});

test("espías: el espía descubierto es noticia y el comisario lo anota", () => {
  const chat = "espia@g.us";
  grupo(chat);
  fijarSaldo(F, chat, CARLA, 100);
  db.prepare(`INSERT INTO espias_misiones (chat, agente, emoji, objetivo, tipo, palabra, premio, publicada, vence, estado, abierta) VALUES (?, ?, '🦊', ?, 'palabra', 'chorizo', 150, ?, ?, 'abierta', 1)`).run(chat, ANA, BETO, Date.now(), Date.now() + 3600000);
  const r = SP.denunciar(chat, CARLA, ANA);
  assert.equal(r.acerto, true);
  assert.equal(hechos(chat)[0].tipo, "espia_descubierto");
  assert.equal(P.memoriaDe(chat, "comisario", ANA).motivo, "espía");
});
