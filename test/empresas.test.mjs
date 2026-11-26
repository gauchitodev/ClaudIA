import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, ultimoEnviado } from "./helpers.mjs";

// "Modo patrón" (lib/empresas.js): founding a company at the top level of a trade, its cash box apart from the
// pocket, goods that wear out and need a service, and categories by what it has billed.
let F, L, E;
before(async () => {
  ({ F } = await prepararBase("empresas"));
  L = await import("../lib/laburos.js");
  E = await import("../lib/empresas.js");
  E._dep.azar = () => 0; // the first text of each list, and a good with its service overdue always breaks
});

const TOPE = () => L.cobrosParaNivel(L.LABURO.NIVEL_MAX);
// Someone with a trade at a level (by its paydays) and coins in the pocket.
function laburante(chat, quien, oficio, { cobros = TOPE(), coins = 0 } = {}) {
  assert.ok(L.tomarLaburo(chat, quien, oficio).ok);
  db.prepare(`UPDATE laburos SET cobros = ? WHERE chat = ? AND usuario = ?`).run(cobros, chat, quien);
  if (coins) F.moverCoins(chat, quien, coins, "test_carga");
}
// A company owner with their company founded.
function patron(chat, quien, oficio = "camionero", nombre = "Transportes Feijó", coins = 0) {
  laburante(chat, quien, oficio, { coins: E.EMPRESA.COSTO_FUNDAR + coins });
  const r = E.fundar(chat, quien, nombre);
  assert.ok(r.ok, r.error);
  return E.empresaDe(chat, quien);
}
const fila = (e) => db.prepare(`SELECT * FROM empresas WHERE id = ?`).get(e.id);
const ayer = () => E.claveDia(new Date(Date.now() - 24 * 3600e3));

test("fundar: pide el oficio con empresa, nivel 10, la plata y un nombre; una por persona", () => {
  const G = "fundar@g.us";
  assert.match(E.fundar(G, "nadie@lid", "Algo").error, /primero hay que saber laburar/);
  laburante(G, "mozo@lid", "mozo", { coins: 5000 });
  assert.match(E.fundar(G, "mozo@lid", "La Fonda").error, /Todavía no hay empresa para mozo\. Por ahora fundan: camionero \(Transportista\), tambero \(Tambo\), dj \(Boliche\)\./);
  laburante(G, "nuevo@lid", "camionero", { cobros: TOPE() - 1, coins: 5000 });
  assert.match(E.fundar(G, "nuevo@lid", "Fletes").error, /nivel 10 y vos vas por el 9/);
  laburante(G, "pobre@lid", "camionero", { coins: E.EMPRESA.COSTO_FUNDAR - 1 });
  assert.match(E.fundar(G, "pobre@lid", "Fletes").error, /Fundar sale 1500 UruCoins .* y tenés 1499\./);
  assert.equal(F.getSaldoCoins(G, "pobre@lid"), 1499, "sin plata no se cobra nada");

  laburante(G, "franco@lid", "camionero", { coins: 2000 });
  assert.match(E.fundar(G, "franco@lid", "   ").error, /Ponele nombre/);
  assert.match(E.fundar(G, "franco@lid", "x".repeat(41)).error, /hasta 40 letras/);
  assert.match(E.fundar(G, "franco@lid", "Fletes @123").error, /sin arrobas/);
  const r = E.fundar(G, "franco@lid", "  Transportes *Feijó*\n ");
  assert.ok(r.ok, r.error);
  assert.match(r.mensaje, /Nació \*Transportes Feijó\*, transportista de @franco\./);
  assert.deepEqual(r.mentions, ["franco@lid"]);
  assert.equal(F.getSaldoCoins(G, "franco@lid"), 500, "fundar sale del bolsillo");
  const e = E.empresaDe(G, "franco@lid");
  assert.deepEqual([e.nombre, e.tipo, e.caja, e.facturado], ["Transportes Feijó", "camionero", 0, 0]);
  assert.deepEqual(E.bienesDe(e).map((b) => [b.bien, b.estado, b.numero]), [["camion", 100, 1]], "arranca con un bien básico");
  assert.match(E.fundar(G, "franco@lid", "Otra").error, /Ya sos patrón: tenés \*Transportes Feijó\*/);
  assert.equal(E.empresaDe("otro@g.us", "franco@lid"), null, "la empresa es de ese grupo");
});

test("cada oficio con empresa tiene su bien inicial, bienes para cada categoría y sus textos", () => {
  assert.deepEqual(Object.keys(E.EMPRESAS).sort(), ["camionero", "dj", "tambero"]);
  for (const [oficio, def] of Object.entries(E.EMPRESAS)) {
    assert.ok(L.OFICIOS[oficio], `${oficio} es un oficio`);
    assert.equal(def.bienes[def.inicial].categoria, 0, `${oficio}: el bien inicial es de la primera categoría`);
    assert.ok(def.bienes[def.inicial].rinde > 0);
    assert.ok(def.hecho.length && def.sinBien && def.roto);
    for (const [clave, b] of Object.entries(def.bienes)) {
      assert.ok(b.precio > 0 && b.categoria < E.CATEGORIAS.length && Boolean(b.rinde) !== Boolean(b.mejora), `${oficio}.${clave}`);
      assert.equal(E.buscarBien(oficio, b.nombre), clave, `${b.nombre} se encuentra por su nombre`);
    }
  }
  assert.equal(E.buscarBien("camionero", "Semirremolque"), "semi");
  assert.equal(E.buscarBien("tambero", "tanque de frío"), "tanque");
  assert.equal(E.buscarBien("dj", "camion"), null, "los bienes son del rubro");
  assert.deepEqual([0, 1999, 2000, 9999, 10000, 40000, 1e9].map(E.categoriaDe), [0, 0, 1, 1, 2, 3, 3]);
});

test("la caja va aparte del bolsillo: depositar es gratis y retirar paga a la DGI", () => {
  const G = "caja@g.us";
  const e = patron(G, "ana@lid", "tambero", "Tambo La Porfiada", 300);
  assert.match(E.depositar(G, "ana@lid", 301).error, /No te alcanza: tenés 300/);
  assert.match(E.depositar(G, "ana@lid", null).error, /Decime cuánto/);
  assert.match(E.depositar(G, "ana@lid", 200).mensaje, /Pusiste 200 en la caja de \*Tambo La Porfiada\*: ahora tiene 200\. A vos te quedan 100\./);
  assert.deepEqual([fila(e).caja, F.getSaldoCoins(G, "ana@lid")], [200, 100]);
  assert.equal(fila(e).facturado, 0, "depositar no es facturar");

  assert.match(E.retirar(G, "ana@lid", 201).error, /hay 200/);
  assert.match(E.retirar(G, "ana@lid", 1).error, /se lo lleva todo la DGI/);
  assert.match(E.retirar(G, "ana@lid", 101).mensaje, /Retiraste 101 de \*Tambo La Porfiada\*: 80 al bolsillo y 21 para la DGI \(20 %\)\. Quedan 99 en la caja y vos tenés 180\./);
  assert.deepEqual([fila(e).caja, F.getSaldoCoins(G, "ana@lid")], [99, 180]);
  assert.match(E.depositar(G, "nadie@lid", 10).error, /No tenés empresa/);
  assert.match(E.retirar(G, "nadie@lid", 10).error, /No tenés empresa/);
});

test("la jornada del patrón: una por día, factura a la caja por su nivel y gasta el bien", () => {
  const G = "jornada@g.us";
  const e = patron(G, "ana@lid");
  assert.equal(E.jornadaDelPatron(G, "nadie@lid"), null, "sin empresa no hay jornada");
  const r = E.jornadaDelPatron(G, "ana@lid");
  assert.ok(r.ok);
  assert.equal(r.monto, 87, "60 del camión chico por el +45 % del nivel 10");
  assert.match(r.mensaje, /^🚛 \*Transportes Feijó\*: 🛻 Camión chico hizo un flete de soja a Nueva Palmira \(\+87\)\.\n💰 Caja: 87\.$/);
  assert.deepEqual([fila(e).caja, fila(e).facturado, fila(e).ultima_jornada], [87, 87, E.claveDia()]);
  assert.deepEqual(E.bienesDe(e).map((b) => [b.estado, b.usado]), [[96, E.claveDia()]]);
  assert.match(E.jornadaDelPatron(G, "ana@lid").error, /Hoy ya laburaste tu jornada/);
  assert.equal(fila(e).caja, 87);

  // Without the company's trade (they changed jobs), they yield as a level 1.
  db.prepare(`UPDATE laburos SET laburo = 'mozo' WHERE chat = ? AND usuario = ?`).run(G, "ana@lid");
  db.prepare(`UPDATE empresas SET ultima_jornada = ? WHERE id = ?`).run(ayer(), e.id);
  db.prepare(`UPDATE empresas_bienes SET usado = ? WHERE empresa = ?`).run(ayer(), e.id);
  assert.equal(E.jornadaDelPatron(G, "ana@lid").monto, 60);
});

test("desgaste y service: atrasado se rompe, roto no trabaja y arreglarlo sale el doble", () => {
  const G = "service@g.us";
  const e = patron(G, "ana@lid");
  const bien = () => E.bienesDe(E.empresaDe(G, "ana@lid"))[0];
  const otroDia = () => {
    db.prepare(`UPDATE empresas SET ultima_jornada = '' WHERE id = ?`).run(e.id);
    db.prepare(`UPDATE empresas_bienes SET usado = '' WHERE empresa = ?`).run(e.id);
  };
  assert.match(E.service(G, "ana@lid", "").mensaje, /está todo al 100 %/);
  assert.equal(E.costoService(e, bien()), 0);

  // Worn but not overdue: it works, and the service costs by the wear (12 % of 900 for a full one).
  db.prepare(`UPDATE empresas_bienes SET estado = 50 WHERE empresa = ?`).run(e.id);
  assert.equal(E.costoService(e, bien()), 54);
  assert.match(E.service(G, "ana@lid", "").mensaje, /1\. 🛻 Camión chico — 50 % · 54/);
  assert.match(E.service(G, "ana@lid", "1").error, /El service sale 54 y en la caja hay 0\. .*\.caja depositar 54/);
  assert.match(E.service(G, "ana@lid", "7").error, /no es de un bien gastado/);

  // At 32 it works and drops under 30: the warning. The next day, overdue, it breaks (chance set to always).
  db.prepare(`UPDATE empresas_bienes SET estado = 32 WHERE empresa = ?`).run(e.id);
  assert.match(E.jornadaDelPatron(G, "ana@lid").mensaje, /⚠️ Está al 28 %: pide \.service 1/);
  otroDia();
  const rota = E.jornadaDelPatron(G, "ana@lid");
  assert.equal(rota.monto, 0);
  assert.match(rota.mensaje, /💥 🛻 Camión chico se quedó tirado en la ruta 3, con el service vencido: no facturó nada\. Se arregla con \.service 1/);
  assert.equal(bien().roto, 1);
  assert.match(E.textoEmpresa(E.empresaDe(G, "ana@lid")), /1\. 🛻 Camión chico — roto 💥 \(\.service 1: 156\) · rinde 60/);

  // Broken, it's nobody's to work with: odd jobs.
  otroDia();
  const changa = E.jornadaDelPatron(G, "ana@lid");
  assert.equal(changa.monto, 15, "10 de changas por el +45 %");
  assert.match(changa.mensaje, /No había camión libre/);

  // 900 × 12 % × 72 % of wear × 2 for broken = 155.52
  assert.equal(E.costoService(e, bien()), 156);
  const caja = fila(e).caja;
  assert.ok(caja < 156);
  assert.match(E.service(G, "ana@lid", "todo").error, /El service sale 156/);
  F.moverCoins(G, "ana@lid", 200, "test_carga");
  assert.ok(E.depositar(G, "ana@lid", 200).ok);
  assert.match(E.service(G, "ana@lid", "todo").mensaje, new RegExp(`Service hecho: 🛻 Camión chico\\. Quedó al 100 % por 156\\. Caja: ${caja + 200 - 156}\\.`));
  assert.deepEqual([bien().estado, bien().roto], [100, 0]);

  // At 0 it's done for, whatever chance says: it bills that last shift and stays broken.
  E._dep.azar = () => 99;
  db.prepare(`UPDATE empresas_bienes SET estado = 3 WHERE empresa = ?`).run(e.id);
  otroDia();
  const ultima = E.jornadaDelPatron(G, "ana@lid");
  assert.equal(ultima.monto, 87);
  assert.match(ultima.mensaje, /se fundió/);
  assert.deepEqual([bien().estado, bien().roto], [0, 1]);
  E._dep.azar = () => 0;
});

test("comprar bienes: de la caja, por categoría, con tope, y las mejoras rinden", () => {
  const G = "bienes@g.us";
  const e = patron(G, "ana@lid", "camionero", "Fletes Ana", 20000);
  assert.ok(E.depositar(G, "ana@lid", 20000).ok);
  assert.match(E.comprarBien(G, "nadie@lid", "camion").error, /No tenés empresa/);
  assert.match(E.comprarBien(G, "ana@lid", "vacas").error, /no lo vende nadie para tu rubro/);
  assert.match(E.comprarBien(G, "ana@lid", "semi").error, /Semirremolque es para una PyME y \*Fletes Ana\* todavía es Changarín: le falta facturar 2000\./);

  // Changarín: 2 posts, so up to 3 goods.
  assert.match(E.comprarBien(G, "ana@lid", "Camión chico").mensaje, /\*Fletes Ana\* compró: Camión chico\..*\nRinde 60 por jornada, si tiene quién lo trabaje\. Quedan 19100 en la caja\./);
  assert.ok(E.comprarBien(G, "ana@lid", "camion").ok);
  assert.match(E.comprarBien(G, "ana@lid", "camion").error, /No te entran más bienes: una Changarín maneja hasta 3/);
  assert.equal(fila(e).caja, 20000 - 1800);
  assert.equal(fila(e).facturado, 0, "comprar no factura");

  // PyME opens the bigger ones and the upgrades (one of each).
  db.prepare(`UPDATE empresas SET facturado = 2000 WHERE id = ?`).run(e.id);
  assert.ok(E.comprarBien(G, "ana@lid", "semirremolque").ok);
  assert.match(E.comprarBien(G, "ana@lid", "galpon").mensaje, /Los demás bienes se gastan menos\./);
  assert.match(E.comprarBien(G, "ana@lid", "galpón").error, /Ya tenés Galpón/);
  assert.match(E.comprarBien(G, "ana@lid", "bitren").error, /es para una Empresa/);
  db.prepare(`UPDATE empresas SET caja = 10 WHERE id = ?`).run(e.id);
  db.prepare(`DELETE FROM empresas_bienes WHERE empresa = ? AND bien = 'camion'`).run(e.id);
  assert.match(E.comprarBien(G, "ana@lid", "camion").error, /Camión chico sale 900 y en la caja de \*Fletes Ana\* hay 10\. .*\.caja depositar 890/);

  // The owner works with the best one, and with the shed it wears 3 instead of 4. The shift takes it past 2000 again.
  db.prepare(`UPDATE empresas SET facturado = 1900 WHERE id = ?`).run(e.id);
  const r = E.jornadaDelPatron(G, "ana@lid");
  assert.equal(r.monto, 160, "110 del semirremolque por el +45 %");
  assert.equal(E.bienesDe(E.empresaDe(G, "ana@lid")).find((b) => b.bien === "semi").estado, 97);
  assert.match(r.mensaje, /🏆 \*Fletes Ana\* subió de categoría/, "pasó los 2000 con la jornada");

  const texto = E.textoBienes(E.empresaDe(G, "ana@lid"));
  assert.match(texto, /🚚 \*Bitren\* — 4500 · rinde 190 por jornada 🔒 desde Empresa · \.comprar bitren/);
  assert.match(texto, /🏚️ \*Galpón\* — 1500 · mejora: todo se gasta menos · \.comprar galpon/);
  assert.match(texto, /Changarín \(desde 0 facturados: 2 puestos, 3 bienes\) → PyME \(desde 2000/);

  // A tambo's cold tank adds 10 % to what it bills.
  const t = patron(G, "tita@lid", "tambero", "Tambo Tita", 2000);
  db.prepare(`UPDATE empresas SET facturado = 2000, caja = 1400 WHERE id = ?`).run(t.id);
  assert.match(E.comprarBien(G, "tita@lid", "tanque").mensaje, /rinde 10 % más/);
  assert.equal(E.jornadaDelPatron(G, "tita@lid").monto, 88, "55 × 1,45 × 1,10");
});

test("el tablero y la lista de empresas del grupo", () => {
  const G = "tablero@g.us";
  assert.match(E.textoEmpresas(G), /todavía no hay ni un patrón\. Con nivel 10 de camionero, tambero, dj y 1500 UruCoins/);
  for (const [quien, nombre] of [["ana@lid", "Ana"], ["beto@lid", "Beto"]]) F.initDataDB({ chat: G, sender: quien, senderJid: "", pushName: nombre });
  const a = patron(G, "ana@lid", "dj", "Boliche El Aguante");
  const b = patron(G, "beto@lid", "tambero", "Tambo Beto");
  db.prepare(`UPDATE empresas SET facturado = 2500, caja = 40 WHERE id = ?`).run(b.id);
  db.prepare(`UPDATE empresas SET facturado = 100, novedades = 'algo pasó' WHERE id = ?`).run(a.id);
  assert.equal(E.textoEmpresas(G), "🏭 *Empresas del grupo*\n1. 🐄 *Tambo Beto* — Beto · PyME · facturó 2500\n2. 🪩 *Boliche El Aguante* — Ana · Changarín · facturó 100");

  const ajeno = E.textoEmpresa(E.empresaDe(G, "ana@lid"));
  assert.equal(ajeno, "🪩 *Boliche El Aguante* — boliche de Ana\n🏷️ Changarín · facturó 100 (faltan 1900 para PyME)\n💰 Caja: 0 UruCoins\n\n🔩 *Bienes* (1 de 3)\n1. 🔊 Equipo de sonido — 100 % · rinde 65");
  assert.equal(fila(a).novedades, "algo pasó", "las novedades son para su patrón");
  const propio = E.textoEmpresa(E.empresaDe(G, "ana@lid"), { propio: true });
  assert.match(propio, /📋 \*Novedades\*\nalgo pasó\n\n_\.bienes: qué comprar/);
  assert.equal(fila(a).novedades, "", "leídas, no se repiten");
  db.prepare(`UPDATE empresas SET facturado = 40000 WHERE id = ?`).run(b.id);
  assert.match(E.textoEmpresa(E.empresaDe(G, "beto@lid")), /🏷️ Grupo empresarial · facturó 40000, lo más alto que hay/);
});

test("los comandos: .fundar, .empresa, .caja, .comprar un bien y la jornada con .cobrar", async () => {
  const G = "comandos@g.us";
  const client = clienteFalso();
  const plugin = async (archivo) => (await import(`../plugins/${archivo}.js`)).default;
  const [Empresa, Comprar, Laburos] = [await plugin("coins-empresa"), await plugin("coins-comprar"), await plugin("coins-laburos")];
  const m = (sender, extra = {}) => ({ chat: G, sender, isGroup: true, text: "", mentionedJid: [], ...extra });
  const correr = async (p, sender, texto) => {
    const [command, ...args] = texto.slice(1).split(/\s+/);
    await p.run(m(sender, { text: texto }), { client, command, args, text: args.join(" "), participants: [{ id: sender, admin: null }] });
    return ultimoEnviado().msg;
  };
  F.initDataDB({ chat: G, sender: "ana@lid", senderJid: "", pushName: "Ana" });
  laburante(G, "ana@lid", "camionero", { coins: 3000 });

  assert.match((await correr(Empresa, "ana@lid", ".empresa")).text, /No tenés empresa\..*\n.*\.empresas/);
  assert.match((await correr(Empresa, "ana@lid", ".fundar")).text, /Fundar una empresa\*\nHay que ser nivel 10 del oficio y tener 1500 UruCoins/);
  const fundada = await correr(Empresa, "ana@lid", ".fundar Transportes Feijó");
  assert.match(fundada.text, /Nació \*Transportes Feijó\*/);
  assert.deepEqual(fundada.mentions, ["ana@lid"]);
  assert.match((await correr(Empresa, "ana@lid", ".empresa")).text, /^🚛 \*Transportes Feijó\* — transportista de Ana/);
  assert.match((await correr(Empresa, "ana@lid", ".empresas")).text, /1\. 🚛 \*Transportes Feijó\*/);
  assert.match((await correr(Empresa, "ana@lid", ".caja")).text, /hay 0 UruCoins/);
  assert.match((await correr(Empresa, "ana@lid", ".caja depositar 1.000")).text, /Pusiste 1000/);
  assert.match((await correr(Empresa, "ana@lid", ".caja retirar 50")).text, /40 al bolsillo y 10 para la DGI/);
  assert.match((await correr(Empresa, "ana@lid", ".bienes")).text, /Bienes para transportista\* \(caja de Transportes Feijó: 950\)/);
  assert.match((await correr(Empresa, "ana@lid", ".service")).text, /todo al 100 %/);

  // .comprar is still the shop's, and for an owner also the company's goods.
  assert.match((await correr(Comprar, "ana@lid", ".comprar camión chico")).text, /compró: Camión chico/);
  assert.match((await correr(Comprar, "ana@lid", ".comprar banana")).text, /¿Qué querés comprar\?/);
  assert.match((await correr(Comprar, "beto@lid", ".comprar camion")).text, /¿Qué querés comprar\?/, "sin empresa, un bien no es nada");
  const saldo = F.getSaldoCoins(G, "ana@lid");
  assert.match((await correr(Comprar, "ana@lid", ".comprar escudo")).text, /escudo/i);
  assert.ok(F.getSaldoCoins(G, "ana@lid") < saldo, "la tienda se paga del bolsillo");

  // .cobrar pays the wage as always and adds the company's shift; the second time, the same error as ever.
  const cobro = (await correr(Laburos, "ana@lid", ".cobrar")).text;
  assert.match(cobro, /Cobraste \*\d+ UruCoins\*[^]*\n\n🚛 \*Transportes Feijó\*: 🛻 Camión chico hizo un flete/);
  assert.match((await correr(Laburos, "ana@lid", ".cobrar")).text, /^❌ Ya cobraste hoy/);
  // Without a trade, the owner still works their shift.
  assert.ok(L.renunciar(G, "ana@lid").ok);
  db.prepare(`UPDATE empresas SET ultima_jornada = '' WHERE chat = ?`).run(G);
  assert.match((await correr(Laburos, "ana@lid", ".cobrar")).text, /^🚛 \*Transportes Feijó\*: /);
});

test("economía: la plata de las empresas tiene su rubro y no cuenta como timba", async () => {
  const Ec = await import("../lib/economia.js");
  const T = await import("../lib/timba.js");
  const G = "rubro@g.us";
  patron(G, "ana@lid", "camionero", "Fletes", 100);
  E.depositar(G, "ana@lid", 100);
  E.retirar(G, "ana@lid", 50);
  const rubro = Ec.resumenEconomia(G, 1).rubros.find((r) => r.nombre === "Empresas");
  assert.deepEqual([rubro.salidas, rubro.entradas], [E.EMPRESA.COSTO_FUNDAR + 100, 40]);
  for (const motivo of ["empresa_fundar", "empresa_deposito", "empresa_retiro"]) assert.ok(T.esMotivoConocido(motivo) && !T.clasificar(motivo), motivo);
});
