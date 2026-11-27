import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, ultimoEnviado } from "./helpers.mjs";

// "Modo patrón" (lib/empresas.js): founding a company at the top level of a trade, its cash box apart from the
// pocket, goods that wear out and need a service, and categories by what it has billed. And its staff: people of the
// group, paid from the company's cash box with their own .cobrar, and Claudia's own.
let F, L, E;
before(async () => {
  ({ F } = await prepararBase("empresas"));
  L = await import("../lib/laburos.js");
  E = await import("../lib/empresas.js");
  E._dep.azar = () => 0; // the first text of each list, and a good with its service overdue always breaks
  // No payday comes as a scene here (lib/escenas.js): these tests read what a plain .cobrar answers.
  (await import("../lib/escenas.js")).ESCENA.CHANCE = 0;
  // The two the texts name; the rest are "alguien".
  for (const [quien, nombre] of [["ana@lid", "Ana"], ["beto@lid", "Beto"]]) F.initDataDB({ chat: "nombres@g.us", sender: quien, senderJid: "", pushName: nombre });
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
  assert.match(E.comprarBien(G, "ana@lid", "semi").error, /Semirremolque es para una PyME y \*Fletes Ana\* todavía es Changarín: le falta facturar 2000 o valer 5000 \(hoy vale 900\)\./, "lo depositado recién no cuenta para el valor");

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
  db.prepare(`UPDATE empresas SET facturado = 1900, categoria = 0 WHERE id = ?`).run(e.id);
  const r = E.jornadaDelPatron(G, "ana@lid");
  assert.equal(r.monto, 160, "110 del semirremolque por el +45 %");
  assert.equal(E.bienesDe(E.empresaDe(G, "ana@lid")).find((b) => b.bien === "semi").estado, 97);
  assert.match(r.mensaje, /🏆 \*Fletes Ana\* subió de categoría/, "pasó los 2000 con la jornada");

  const texto = E.textoBienes(E.empresaDe(G, "ana@lid"));
  assert.match(texto, /🚚 \*Bitren\* — 4500 · rinde 190 por jornada 🔒 desde Empresa · \.comprar bitren/);
  assert.match(texto, /🏚️ \*Galpón\* — 1500 · mejora: todo se gasta menos · \.comprar galpon/);
  assert.match(texto, /Changarín \(de entrada: 2 puestos, 3 bienes\) → PyME \(desde 2000 facturados o 5000 de valor: 4 puestos, 5 bienes\)/);

  // A tambo's cold tank adds 10 % to what it bills.
  const t = patron(G, "tita@lid", "tambero", "Tambo Tita", 2000);
  db.prepare(`UPDATE empresas SET facturado = 2000, caja = 1400 WHERE id = ?`).run(t.id);
  assert.match(E.comprarBien(G, "tita@lid", "tanque").mensaje, /rinde 10 % más/);
  assert.equal(E.jornadaDelPatron(G, "tita@lid").monto, 88, "55 × 1,45 × 1,10");
});

test("el tablero y la lista de empresas del grupo", () => {
  const G = "tablero@g.us";
  assert.match(E.textoEmpresas(G), /todavía no hay ni un patrón\. Con nivel 10 de camionero, tambero, dj y 1500 UruCoins/);
  const a = patron(G, "ana@lid", "dj", "Boliche El Aguante");
  const b = patron(G, "beto@lid", "tambero", "Tambo Beto");
  db.prepare(`UPDATE empresas SET facturado = 2500, caja = 40 WHERE id = ?`).run(b.id);
  db.prepare(`UPDATE empresas SET facturado = 100, novedades = 'algo pasó' WHERE id = ?`).run(a.id);
  assert.equal(E.textoEmpresas(G), "🏭 *Empresas del grupo*\n1. 🐄 *Tambo Beto* — Beto · PyME · facturó 2500\n2. 🪩 *Boliche El Aguante* — Ana · Changarín · facturó 100\nPara laburar en una, que su patrón te haga una oferta (.contratar): las tuyas están en .ofertas");

  const ajeno = E.textoEmpresa(E.empresaDe(G, "ana@lid"));
  assert.equal(ajeno, "🪩 *Boliche El Aguante* — boliche de Ana\n🏷️ Changarín · facturó 100 · vale 1000 (para PyME: facturar 2000 o valer 5000)\n💰 Caja: 0 UruCoins\n\n🔩 *Bienes* (1 de 3)\n1. 🔊 Equipo de sonido — 100 % · rinde 65\n\n👥 *Personal* (0 de 2 puestos)\nNadie todavía: el patrón solo, como en los comienzos.");
  assert.equal(fila(a).novedades, "algo pasó", "las novedades son para su patrón");
  const propio = E.textoEmpresa(E.empresaDe(G, "ana@lid"), { propio: true });
  assert.match(propio, /📋 \*Novedades\*\nalgo pasó\n\n_\.bienes: qué comprar/);
  assert.equal(fila(a).novedades, "", "leídas, no se repiten");
  db.prepare(`UPDATE empresas SET facturado = 40000 WHERE id = ?`).run(b.id);
  assert.match(E.textoEmpresa(E.empresaDe(G, "beto@lid")), /🏷️ Grupo empresarial · facturó 40000 · vale 840, lo más alto que hay/);
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

// ---------- the staff ----------
const DIA = 24 * 3600e3;
const hace = (n) => E.claveDia(new Date(Date.now() - n * DIA));
// Someone taken on: offered and signed.
function contratado(chat, jefe, quien, puesto, sueldo) {
  const o = E.ofrecer(chat, jefe, quien, puesto, sueldo);
  assert.ok(o.ok, o.error);
  const f = E.firmar(chat, quien);
  assert.ok(f.ok, f.error);
  return f;
}
const personal = (chat, jefe) => E.empleadosDe(E.empresaDe(chat, jefe));

test("contratar: la oferta, lo que la frena, y firmar", () => {
  const G = "contratar@g.us";
  const e = patron(G, "ana@lid");
  assert.match(E.ofrecer(G, "beto@lid", "ana@lid", "chofer", 30).error, /Para contratar hay que ser patrón/);
  assert.match(E.ofrecer(G, "ana@lid", "beto@lid", "ordeñador", 30).error, /Ese puesto no existe en \*Transportes Feijó\*\. Los que hay: chofer, mecanico, despachante, gerente, contador/);
  assert.match(E.ofrecer(G, "ana@lid", "ana@lid", "chofer", 30).error, /No te podés contratar/);
  assert.match(E.ofrecer(G, "ana@lid", "beto@lid", "chofer", null).error, /Falta el sueldo por día: \.contratar @persona chofer 30/);
  assert.match(E.ofrecer(G, "ana@lid", "beto@lid", "chofer", 301).error, /se paga hasta 300 por día/);
  patron(G, "otra@lid", "tambero", "Tambo Otra");
  assert.match(E.ofrecer(G, "ana@lid", "otra@lid", "chofer", 30).error, /@otra es patrón de \*Tambo Otra\*: no labura para nadie\./);

  assert.match(E.firmar(G, "beto@lid").error, /No tenés ninguna oferta de laburo/);
  const o = E.ofrecer(G, "ana@lid", "beto@lid", "Chofer", 40);
  assert.match(o.mensaje, /^🤝 @ana le ofrece a @beto el puesto de \*chofer\* en \*Transportes Feijó\*, por 40 UruCoins por día \(el sueldo de plaza anda en 30\)\.\n@beto: \.firmar acepta, \.contraoferta 50 regatea y \.rechazaroferta la tira abajo\. Vale 24 horas\.$/);
  assert.deepEqual(o.mentions, ["ana@lid", "beto@lid"]);
  assert.equal(personal(G, "ana@lid").length, 0, "ofrecer no es contratar");
  assert.match(E.textoEmpresa(E.empresaDe(G, "ana@lid")), /_Ofertas en el aire: Beto \(chofer, le ofrecieron 40\)_/);
  assert.match(E.textoOfertas(G, "beto@lid"), /📨 \*Te ofrecieron\*\n• \*Transportes Feijó\* \(Ana\): chofer por 40 por día\n/);
  assert.match(E.textoOfertas(G, "ana@lid"), /📤 \*Ofreciste\*\n• Beto: chofer por 40/);
  assert.match(E.textoOfertas(G, "nadie@lid"), /No tenés ofertas/);

  // Offering again replaces it; signing takes the last one.
  assert.ok(E.ofrecer(G, "ana@lid", "beto@lid", "chofer", 45).ok);
  const f = E.firmar(G, "beto@lid");
  assert.match(f.mensaje, /^✍️ Firmado: @beto es \*chofer\* de \*Transportes Feijó\* por 45 UruCoins por día\.\nDesde ahora su \.cobrar lo paga la caja de la empresa \(no yo\) y su jornada le factura a @ana\./);
  assert.deepEqual(personal(G, "ana@lid").map((x) => [x.usuario, x.puesto, x.sueldo, x.npc, x.nivel]), [["beto@lid", "chofer", 45, false, 1]]);
  assert.equal(E.empleoDe(G, "beto@lid").empresa.id, e.id);
  assert.equal(E.empleoDe("otro@g.us", "beto@lid"), null);
  assert.match(E.textoOfertas(G, "beto@lid"), /No tenés ofertas/, "firmada, la oferta se va");

  // Employed, nobody else takes them, and they can't found.
  assert.match(E.ofrecer(G, "ana@lid", "beto@lid", "gerente", 40).error, /@beto ya labura para vos, de chofer\./);
  assert.match(E.ofrecer(G, "otra@lid", "beto@lid", "ordeñador", 40).error, /@beto ya labura en \*Transportes Feijó\*/);
  laburante(G, "beto@lid", "dj", { coins: 2000 });
  assert.match(E.fundar(G, "beto@lid", "Boliche").error, /no se puede ser patrón y empleado a la vez/);

  // An offer lapses in 24 hours.
  assert.ok(E.ofrecer(G, "ana@lid", "caro@lid", "chofer", 30).ok);
  db.prepare(`UPDATE empresas_ofertas SET fecha = ? WHERE usuario = ?`).run(Date.now() - 25 * 3600e3, "caro@lid");
  assert.match(E.firmar(G, "caro@lid").error, /No tenés ninguna oferta/);
});

test("puestos: los que da la categoría, y de gerente, contador y los de apoyo, uno solo", () => {
  const G = "puestos@g.us";
  const e = patron(G, "ana@lid", "tambero", "Tambo Ana");
  assert.deepEqual(Object.keys(E.puestosDe(e)), ["ordenador", "veterinario", "quesero", "gerente", "contador"]);
  assert.deepEqual(["Ordeñadora", "tambero", "vete", "Contadora", "chofer"].map((t) => E.buscarPuesto(e, t)), ["ordenador", "ordenador", "veterinario", "contador", null]);
  for (const def of Object.values(E.EMPRESAS)) assert.equal(Object.values(def.puestos).filter((p) => p.tipo === "operario").length, 1, "un puesto que trabaja los bienes por empresa");

  contratado(G, "ana@lid", "g1@lid", "gerente", 40);
  assert.match(E.ofrecer(G, "ana@lid", "g2@lid", "gerente", 40).error, /\*Tambo Ana\* ya tiene quien haga de gerente: de ese puesto hay uno solo\./);
  assert.match(E.contratarNPC(G, "ana@lid", "gerente").error, /ya tiene quien haga de gerente/);
  // Two offers for the last post: the first to sign gets it.
  assert.ok(E.ofrecer(G, "ana@lid", "o1@lid", "ordeñador", 26).ok);
  assert.ok(E.ofrecer(G, "ana@lid", "o2@lid", "ordeñador", 26).ok);
  assert.ok(E.firmar(G, "o1@lid").ok);
  assert.match(E.firmar(G, "o2@lid").error, /No hay puestos libres: una Changarín tiene 2\./);
  assert.match(E.contratarNPC(G, "ana@lid", "ordeñador").error, /No hay puestos libres/);
  db.prepare(`UPDATE empresas SET facturado = 2000 WHERE id = ?`).run(e.id);
  assert.ok(E.firmar(G, "o2@lid").ok, "la PyME tiene 4");
  assert.match(E.textoEmpresa(E.empresaDe(G, "ana@lid")), /👥 \*Personal\* \(3 de 4 puestos\)\n1\. alguien — gerente nv\.1 · 40\/día\n2\. alguien — ordeñador nv\.1 · 26\/día\n3\. /);

  const texto = E.textoPuestos(E.empresaDe(G, "ana@lid"));
  assert.match(texto, /^👥 \*Puestos de Tambo Ana\* \(3 de 4 ocupados, por ser PyME\)/);
  assert.match(texto, /\*Ordeñador\* — trabaja un bien por día y le factura a la empresa lo que rinde, más con cada nivel\. Sueldo de plaza: 26; de los de Claudia, 34 · \.contratar @persona ordenador 26/);
  assert.match(texto, /\*Contador\* — la DGI se queda 10 % de lo que retirás de la caja, en vez de 20 %\./);
  assert.match(texto, /rinde el 70 %, cobra 30 % más que el sueldo de plaza y no sube de nivel/);
  assert.match(texto, /un sueldo, más uno cada 5 jornadas, hasta 6\./);
});

test("el empleado cobra de la caja del patrón, le factura a la empresa y sube de nivel en el puesto", () => {
  const G = "sueldo@g.us";
  const e = patron(G, "ana@lid", "camionero", "Fletes Ana", 500);
  E.depositar(G, "ana@lid", 500);
  assert.equal(E.cobrarComoEmpleado(G, "beto@lid"), null, "sin puesto, cobra su oficio como siempre");
  laburante(G, "beto@lid", "mozo", { cobros: 0 });
  contratado(G, "ana@lid", "beto@lid", "chofer", 40);

  const r = E.cobrarComoEmpleado(G, "beto@lid");
  assert.ok(r.ok, r.error);
  assert.equal(r.mensaje, "🚛 Jornada de chofer en *Fletes Ana*: 🛻 Camión chico hizo un flete de soja a Nueva Palmira (+60).\n🪙 Cobraste *40 UruCoins* de sueldo, de la caja de @ana. Tenés 40.");
  assert.deepEqual(r.mentions, ["ana@lid"]);
  assert.deepEqual([fila(e).caja, fila(e).facturado], [500 - 40 + 60, 60], "el sueldo sale de la caja y lo facturado entra");
  assert.equal(F.getSaldoCoins(G, "ana@lid"), 0, "al bolsillo del patrón no lo toca nadie");
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM urucoins_log WHERE chat = ? AND motivo = 'sueldo_laburo'`).get(G).n, 0, "el bot no pagó ningún sueldo");
  assert.equal(L.laburoDe(G, "beto@lid").cobros, 0, "la experiencia es del puesto, no del oficio");
  assert.match(E.cobrarComoEmpleado(G, "beto@lid").error, /Ya cobraste hoy\. El sueldo es una vez por día, chofer\./);
  assert.match(L.cobrar(G, "beto@lid").error, /Ya cobraste hoy/, "y tampoco cobra el oficio el mismo día");
  assert.equal(fila(e).novedades, "👷 Beto (chofer) facturó 60 y cobró 40.");

  // The owner's shift the same day finds the only truck used.
  assert.match(E.jornadaDelPatron(G, "ana@lid").mensaje, /No había camión libre.*\n💰 Caja: 535\.\n📋 Mientras no estabas:\n👷 Beto \(chofer\) facturó 60 y cobró 40\./);

  // Level 2 at 3 shifts: this one, the third, is still paid as level 1 and announces the level.
  const otroDia = () => {
    db.prepare(`UPDATE empresas_experiencia SET ultimo_cobro = '' WHERE chat = ?`).run(G);
    db.prepare(`UPDATE laburos SET ultimo_cobro = '' WHERE chat = ?`).run(G);
    db.prepare(`UPDATE empresas_bienes SET usado = '' WHERE empresa = ?`).run(e.id);
  };
  db.prepare(`UPDATE empresas_experiencia SET cobros = 2 WHERE chat = ? AND usuario = ?`).run(G, "beto@lid");
  otroDia();
  const tercera = E.cobrarComoEmpleado(G, "beto@lid");
  assert.equal(tercera.monto, 60);
  assert.match(tercera.mensaje, /⬆️ Subiste a nivel 2 de chofer: rendís \+5 %\. Buen momento para pedir aumento\./);
  otroDia();
  const cuarta = E.cobrarComoEmpleado(G, "beto@lid");
  assert.equal(cuarta.monto, 63, "60 por el +5 % del nivel 2");
  assert.match(cuarta.mensaje, /^🚛 Jornada de chofer nv\.2 en/);
  assert.equal(personal(G, "ana@lid")[0].nivel, 2);

  // Without money in the caja for the wage: nothing moves, and the owner gets the news once.
  otroDia();
  db.prepare(`UPDATE empresas SET caja = 39, novedades = '' WHERE id = ?`).run(e.id);
  for (let i = 0; i < 2; i++) {
    const sin = E.cobrarComoEmpleado(G, "beto@lid");
    assert.deepEqual([sin.ok, sin.sinCaja, sin.mentions], [false, true, ["ana@lid"]]);
    assert.match(sin.aviso, /En la caja de \*Fletes Ana\* no hay para tu sueldo de chofer \(40\): @ana, poné plata/);
  }
  assert.equal(fila(e).caja, 39);
  assert.equal(fila(e).novedades, "⚠️ Beto (chofer) vino a laburar y no había caja para su sueldo (40).");

  // Quitting: no severance, and the level goes with them to the next company.
  const renuncia = E.renunciarAlPuesto(G, "beto@lid");
  assert.match(renuncia.mensaje, /^🚪 @beto renunció a su puesto de chofer en \*Fletes Ana\*\. Indemnización no hay \(te fuiste vos\), pero la experiencia te la llevás: nivel 2 de chofer\./);
  assert.equal(E.renunciarAlPuesto(G, "beto@lid"), null);
  assert.equal(personal(G, "ana@lid").length, 0);
  assert.match(fila(e).novedades, /🚪 Beto renunció: ya no es chofer\.$/);
  patron(G, "caro@lid", "camionero", "Fletes Caro");
  assert.match(E.ofrecer(G, "caro@lid", "beto@lid", "chofer", 50).mensaje, /Ya es nivel 2 en eso\./);
  assert.match(E.firmar(G, "beto@lid").mensaje, /y arranca de nivel 2 por lo que ya traía/);
});

test("contraoferta: el empleado pide, el patrón firma, mejora o corta; y rechazar", () => {
  const G = "regateo@g.us";
  patron(G, "ana@lid");
  patron(G, "caro@lid", "tambero", "Tambo Caro");
  assert.match(E.contraofertar(G, "beto@lid", 50).error, /No tenés ninguna oferta de laburo a la que contestarle/);
  assert.ok(E.ofrecer(G, "ana@lid", "beto@lid", "chofer", 40).ok);
  assert.match(E.contraofertar(G, "beto@lid", null).error, /Decime cuánto querés/);
  assert.match(E.contraofertar(G, "beto@lid", 40).error, /lo mismo que te ofrecieron/);
  assert.match(E.contraofertar(G, "beto@lid", 5000).error, /se paga hasta 300/);
  const c = E.contraofertar(G, "beto@lid", 60);
  assert.equal(c.mensaje, "💬 @beto regatea: quiere 60 por día para ser chofer de *Transportes Feijó* (le habían ofrecido 40).\n@ana: .firmar @beto acepta, .contratar @beto chofer 50 le ofrece otra cosa y .rechazaroferta @beto corta la charla.");
  assert.deepEqual(c.mentions, ["beto@lid", "ana@lid"]);
  assert.match(E.firmar(G, "beto@lid").error, /Tu contraoferta a \*Transportes Feijó\* está en manos del patrón: le toca firmar a @ana\./);
  assert.match(E.textoOfertas(G, "ana@lid"), /• Beto: chofer por 60 — es lo que pide: \.firmar @persona acepta/);

  // The owner answers with another offer, the other one asks again, and the owner signs that.
  assert.ok(E.ofrecer(G, "ana@lid", "beto@lid", "chofer", 50).ok);
  assert.ok(E.contraofertar(G, "beto@lid", 55).ok);
  assert.match(E.firmar(G, "ana@lid", "nadie@lid").error, /No tenés ninguna oferta/);
  assert.match(E.firmar(G, "ana@lid").mensaje, /@beto es \*chofer\* de \*Transportes Feijó\* por 55 UruCoins por día/);
  assert.equal(personal(G, "ana@lid")[0].sueldo, 55);

  // Two offers at once: which one has to be said; hired by one, the other falls.
  assert.ok(E.ofrecer(G, "ana@lid", "dani@lid", "gerente", 40).ok);
  assert.ok(E.ofrecer(G, "caro@lid", "dani@lid", "ordeñador", 30).ok);
  assert.match(E.firmar(G, "dani@lid").error, /Tenés 2 ofertas, qué momento\. Decime cuál firmás, con \.firmar @patrón:\n• \*Transportes Feijó\* \(@ana\): gerente por 40\n• \*Tambo Caro\* \(@caro\): ordeñador por 30/);
  assert.match(E.contraofertar(G, "dani@lid", 45).error, /Tenés 2 ofertas/);
  assert.ok(E.contraofertar(G, "dani@lid", 45, "caro@lid").ok);
  assert.match(E.firmar(G, "dani@lid", "ana@lid").mensaje, /@dani es \*gerente\*/);
  assert.match(E.textoOfertas(G, "caro@lid"), /No tenés ofertas/, "contratado por otra, la contraoferta se cae");

  // Turning down: the offered one, all of theirs; an owner, the one they made.
  assert.match(E.rechazarOferta(G, "eli@lid").error, /No hay ninguna oferta de laburo que rechazar/);
  assert.ok(E.ofrecer(G, "caro@lid", "eli@lid", "ordeñador", 30).ok);
  assert.match(E.rechazarOferta(G, "eli@lid").mensaje, /^🙅 @eli no firma: la oferta de \*Tambo Caro\* quedó en nada\. @caro, a seguir buscando\.$/);
  assert.ok(E.ofrecer(G, "caro@lid", "eli@lid", "ordeñador", 30).ok);
  assert.match(E.rechazarOferta(G, "caro@lid", "eli@lid").mensaje, /\*Tambo Caro\* bajó la oferta: @eli, no fue esta vez\./);
  assert.match(E.firmar(G, "eli@lid").error, /No tenés ninguna oferta/);
});

test("los empleados de Claudia: más caros, rinden menos, no suben de nivel y rinden cuentas al otro día", () => {
  const G = "npc@g.us";
  const e = patron(G, "ana@lid", "camionero", "Fletes Ana", 5000);
  E.depositar(G, "ana@lid", 5000);
  db.prepare(`UPDATE empresas SET facturado = 2000 WHERE id = ?`).run(e.id);
  assert.match(E.contratarNPC(G, "nadie@lid", "chofer").error, /hay que ser patrón/);
  assert.match(E.contratarNPC(G, "ana@lid", "").error, /Decime para qué puesto: \.contratar claudia chofer/);
  const r = E.contratarNPC(G, "ana@lid", "chofer");
  assert.match(r.mensaje, /^🤖 Te mando a el Cacho, de los míos, de \*chofer\* en \*Fletes Ana\*: cobra 39 por día de la caja, rinde el 70 % de una persona, no sube de nivel/);
  assert.ok(E.contratarNPC(G, "ana@lid", "chofer").ok);
  assert.deepEqual(personal(G, "ana@lid").map((x) => [x.como, x.npc, x.sueldo, x.nivel]), [["el Cacho", true, 39, 1], ["la Yoli", true, 39, 1]], "cada uno con su nombre");
  assert.ok(E.comprarBien(G, "ana@lid", "semi").ok);
  const caja = fila(e).caja;

  // Hired today: nothing to settle yet.
  assert.match(E.textoEmpresa(E.empresaDe(G, "ana@lid"), { propio: true }), /1\. 🤖 el Cacho — chofer · 39\/día \(de Claudia\)/);
  assert.deepEqual([fila(e).caja, fila(e).facturado], [caja, 2000]);

  // Three days later: yesterday's and the two before are settled, with a truck each (the first one, the worst).
  db.prepare(`UPDATE empresas_empleados SET desde = ? WHERE empresa = ?`).run(Date.now() - 3 * DIA, e.id);
  const texto = E.textoEmpresa(E.empresaDe(G, "ana@lid"), { propio: true });
  // 3 days × (60 × 0,7 = 42) and 3 × (110 × 0,7 = 77), minus 6 wages of 39
  assert.match(texto, /📋 \*Novedades\*\n🤖 el Cacho \(chofer\): 3 jornadas, facturó 126 y cobró 117\.\n🤖 la Yoli \(chofer\): 3 jornadas, facturó 231 y cobró 117\./);
  assert.deepEqual([fila(e).caja, fila(e).facturado], [caja + 357 - 234, 2357]);
  assert.deepEqual(E.bienesDe(e).map((b) => [b.bien, b.estado, b.usado]), [["camion", 88, hace(1)], ["semi", 88, hace(1)]]);
  assert.deepEqual(personal(G, "ana@lid").map((x) => [x.cobros, x.ultimo_cobro, x.nivel]), [[3, hace(1), 1], [3, hace(1), 1]]);
  // Settled once: asking again changes nothing, and today's trucks are free for people.
  E.textoEmpresa(E.empresaDe(G, "ana@lid"), { propio: true });
  assert.equal(fila(e).facturado, 2357);
  assert.equal(E.jornadaDelPatron(G, "ana@lid").monto, 160, "el patrón trabaja hoy con el semi");

  // No money for the wages: those days aren't worked, and they aren't made up later.
  db.prepare(`UPDATE empresas SET caja = 40 WHERE id = ?`).run(e.id);
  db.prepare(`UPDATE empresas_empleados SET ultimo_cobro = ? WHERE empresa = ?`).run(hace(3), e.id);
  db.prepare(`UPDATE empresas_bienes SET usado = ? WHERE empresa = ?`).run(hace(3), e.id);
  const sinCaja = E.textoEmpresa(E.empresaDe(G, "ana@lid"), { propio: true });
  // Day −2: Cacho is paid (40 − 39) and bills 42; Yoli isn't (1 + 42 = 43 ≥ 39: she is). Day −1: 46 + 77 ...
  assert.match(sinCaja, /🤖 el Cacho \(chofer\): 2 jornadas, facturó 84 y cobró 78\./);
  db.prepare(`UPDATE empresas SET caja = 0 WHERE id = ?`).run(e.id);
  db.prepare(`UPDATE empresas_empleados SET ultimo_cobro = ? WHERE empresa = ?`).run(hace(3), e.id);
  db.prepare(`UPDATE empresas_bienes SET usado = ? WHERE empresa = ?`).run(hace(3), e.id);
  const seco = E.textoEmpresa(E.empresaDe(G, "ana@lid"), { propio: true });
  assert.match(seco, /🤖 el Cacho \(chofer\) no laburó 2 días: no había caja para su sueldo \(39\)\.\n🤖 la Yoli \(chofer\) no laburó 2 días/);
  assert.equal(fila(e).caja, 0);
  db.prepare(`UPDATE empresas SET caja = 1000 WHERE id = ?`).run(e.id);
  assert.doesNotMatch(E.textoEmpresa(E.empresaDe(G, "ana@lid"), { propio: true }), /Novedades/, "los días sin caja no se recuperan");

  // Away for a month: only the last 7 days are settled.
  db.prepare(`UPDATE empresas_empleados SET ultimo_cobro = ?, cobros = 0, desde = 0 WHERE empresa = ?`).run(hace(30), e.id);
  db.prepare(`UPDATE empresas_bienes SET usado = '', estado = 100 WHERE empresa = ?`).run(e.id);
  db.prepare(`UPDATE empresas SET caja = 5000 WHERE id = ?`).run(e.id);
  E.textoEmpresa(E.empresaDe(G, "ana@lid"), { propio: true });
  assert.deepEqual(personal(G, "ana@lid").map((x) => x.cobros), [7, 7]);
});

test("despedir: indemnización por antigüedad, de la caja; a los de Claudia, por su número", () => {
  const G = "despedir@g.us";
  const e = patron(G, "ana@lid", "camionero", "Fletes Ana", 1000);
  assert.match(E.despedir(G, "beto@lid", { usuario: "ana@lid" }).error, /No tenés empresa/);
  assert.match(E.despedir(G, "ana@lid", { usuario: "beto@lid" }).error, /@beto no labura en \*Fletes Ana\*\./);
  assert.match(E.despedir(G, "ana@lid", { numero: null }).error, /No sé a quién: \.despedir @persona, o \.despedir 2/);
  contratado(G, "ana@lid", "beto@lid", "chofer", 40);
  assert.ok(E.contratarNPC(G, "ana@lid", "gerente").ok);
  assert.deepEqual([0, 4, 5, 12, 25, 400].map((cobros) => E.indemnizacionDe({ sueldo: 40, cobros })), [40, 40, 80, 120, 240, 240]);

  db.prepare(`UPDATE empresas_empleados SET cobros = 12 WHERE usuario = ?`).run("beto@lid");
  assert.match(E.despedir(G, "ana@lid", { usuario: "beto@lid" }).error, /Despedir a @beto sale 120 de indemnización \(12 jornadas en la empresa\) y en la caja hay 0\. Echar sale caro: \.caja depositar 120/);
  assert.equal(personal(G, "ana@lid").length, 2);
  E.depositar(G, "ana@lid", 1000);
  const r = E.despedir(G, "ana@lid", { usuario: "beto@lid" });
  assert.equal(r.mensaje, "📦 @beto, estás despedido: ya no sos chofer de *Fletes Ana*. Te llevás 120 UruCoins de indemnización (por 12 jornadas) y lo que aprendiste. Caja de la empresa: 880.");
  assert.deepEqual(r.mentions, ["beto@lid"]);
  assert.deepEqual([F.getSaldoCoins(G, "beto@lid"), fila(e).caja], [120, 880]);
  assert.equal(E.empleoDe(G, "beto@lid"), null);

  // Claudia's own is number 1 now: 52 a day (40 × 1,3), with no shifts yet.
  assert.match(E.despedir(G, "ana@lid", { numero: 1 }).mensaje, /^📦 el Cacho dejó de ser gerente de \*Fletes Ana\*\. Se llevó 52 de indemnización .* Caja: 828\.$/);
  assert.equal(personal(G, "ana@lid").length, 0);
});

test("gerente, contador y los puestos de apoyo: lo que cambian mientras alguien los ocupa y viene", () => {
  const G = "apoyo@g.us";
  const e = patron(G, "ana@lid", "camionero", "Fletes Ana", 6000);
  E.depositar(G, "ana@lid", 6000);
  db.prepare(`UPDATE empresas SET facturado = 10000 WHERE id = ?`).run(e.id);
  laburante(G, "beto@lid", "mozo", { cobros: 0 });
  contratado(G, "ana@lid", "beto@lid", "chofer", 30);
  const otroDia = () => {
    db.prepare(`UPDATE empresas_experiencia SET ultimo_cobro = '' WHERE chat = ?`).run(G);
    db.prepare(`UPDATE laburos SET ultimo_cobro = '' WHERE chat = ?`).run(G);
    db.prepare(`UPDATE empresas_bienes SET usado = '', estado = 100 WHERE empresa = ?`).run(e.id);
    db.prepare(`UPDATE empresas SET ultima_jornada = '' WHERE id = ?`).run(e.id);
  };
  const seFue = (dias) => db.prepare(`UPDATE empresas SET visto = ? WHERE id = ?`).run(Date.now() - dias * DIA, e.id);

  // The owner gone for three days and no manager: half.
  seFue(3);
  assert.equal(E.sinPatron(E.empresaDe(G, "ana@lid")), true);
  const mitad = E.cobrarComoEmpleado(G, "beto@lid");
  assert.equal(mitad.monto, 30, "la mitad de 60");
  assert.match(mitad.mensaje, /😴 @ana no aparece hace días y no hay gerente: la empresa factura la mitad\./);
  assert.match(E.textoEmpresa(E.empresaDe(G, "ana@lid")), /😴 El patrón no aparece hace más de 2 días y no hay gerente: la empresa factura la mitad\./);
  seFue(1.9);
  assert.equal(E.sinPatron(E.empresaDe(G, "ana@lid")), false, "dos días no es ausencia");

  // With a manager who shows up, it bills whole; one who stopped coming doesn't count.
  contratado(G, "ana@lid", "gabi@lid", "gerente", 40);
  seFue(3);
  otroDia();
  assert.equal(E.cobrarComoEmpleado(G, "beto@lid").monto, 60);
  const gerente = E.cobrarComoEmpleado(G, "gabi@lid");
  assert.match(gerente.mensaje, /^🚛 Jornada de gerente en \*Fletes Ana\*: Tuviste la empresa andando, esté o no esté el patrón\.\n🪙 Cobraste \*40 UruCoins\*/);
  assert.equal(gerente.monto, 0);
  db.prepare(`UPDATE empresas_empleados SET ultimo_cobro = ?, desde = 0 WHERE usuario = ?`).run(hace(4), "gabi@lid");
  seFue(3);
  assert.equal(E.sinPatron(E.empresaDe(G, "ana@lid")), true, "un gerente que no viene no gerencia");
  assert.match(E.textoEmpresa(E.empresaDe(G, "ana@lid")), /— gerente nv\.1 · 40\/día 💤 hace días que no viene/);
  db.prepare(`UPDATE empresas_empleados SET ultimo_cobro = ? WHERE usuario = ?`).run(hace(2), "gabi@lid");
  assert.equal(E.sinPatron(E.empresaDe(G, "ana@lid")), false);

  // The accountant: 10 % instead of 20 %; Claudia's, 13 %.
  assert.match(E.retirar(G, "ana@lid", 100).mensaje, /80 al bolsillo y 20 para la DGI \(20 %\)/);
  contratado(G, "ana@lid", "coni@lid", "contador", 35);
  assert.match(E.retirar(G, "ana@lid", 100).mensaje, /90 al bolsillo y 10 para la DGI \(10 %\)/);
  assert.ok(E.despedir(G, "ana@lid", { usuario: "coni@lid" }).ok);
  assert.ok(E.contratarNPC(G, "ana@lid", "contador").ok);
  assert.match(E.retirar(G, "ana@lid", 100).mensaje, /87 al bolsillo y 13 para la DGI \(13 %\)/);

  // The mechanic: services 30 % cheaper. 900 × 12 % × half the wear = 54 → 37,8
  db.prepare(`UPDATE empresas_bienes SET estado = 50 WHERE empresa = ?`).run(e.id);
  const camion = () => E.bienesDe(E.empresaDe(G, "ana@lid"))[0];
  assert.equal(E.costoService(E.empresaDe(G, "ana@lid"), camion()), 54);
  contratado(G, "ana@lid", "meca@lid", "mecánico", 28);
  assert.equal(E.costoService(E.empresaDe(G, "ana@lid"), camion()), 38);

  // The dispatcher: +10 % on what's billed, and more by their level (level 3: +11 %).
  otroDia();
  contratado(G, "ana@lid", "desi@lid", "despachante", 32);
  assert.equal(E.cobrarComoEmpleado(G, "beto@lid").monto, 66, "60 × 1,10");
  db.prepare(`INSERT INTO empresas_experiencia (chat, usuario, puesto, cobros) VALUES (?, ?, 'despachante', 7)`).run(G, "desi@lid");
  otroDia();
  assert.equal(E.cobrarComoEmpleado(G, "beto@lid").monto, 70, "60 × 1,05 (Beto ya es chofer nivel 2) × 1,11");
  assert.match(E.cobrarComoEmpleado(G, "desi@lid").mensaje, /Jornada de despachante nv\.3 en \*Fletes Ana\*: Moviste contactos todo el día/);
});

test("los comandos del personal: .contratar, .firmar, .contraoferta, .despedir, y .cobrar y .renunciar de un empleado", async () => {
  const G = "personal@g.us";
  const client = clienteFalso();
  const plugin = async (archivo) => (await import(`../plugins/${archivo}.js`)).default;
  const [Empresa, Empleados, Laburos] = [await plugin("coins-empresa"), await plugin("coins-empleados"), await plugin("coins-laburos")];
  const [ANA, BETO] = ["300000000000071@lid", "300000000000072@lid"];
  const participants = [{ id: ANA, admin: null }, { id: BETO, admin: null }];
  for (const [quien, nombre] of [[ANA, "Ana"], [BETO, "Beto"]]) F.initDataDB({ chat: G, sender: quien, senderJid: "", pushName: nombre });
  const correr = async (p, sender, texto, mencionados = []) => {
    const [command, ...args] = texto.slice(1).split(/\s+/);
    await p.run({ chat: G, sender, isGroup: true, text: texto, mentionedJid: mencionados }, { client, command, args, text: args.join(" "), participants });
    return ultimoEnviado().msg;
  };
  const aBeto = `@${BETO.split("@")[0]}`;
  const e = patron(G, ANA, "camionero", "Fletes Ana", 200);
  E.depositar(G, ANA, 200);
  laburante(G, BETO, "mozo", { cobros: 0 });

  assert.match((await correr(Empleados, ANA, ".contratar")).text, /^Uso: \.contratar @persona chofer 40/);
  const oferta = await correr(Empleados, ANA, `.contratar ${aBeto} chofer 40`, [BETO]);
  assert.match(oferta.text, /^🤝 .* el puesto de \*chofer\* en \*Fletes Ana\*, por 40 UruCoins por día/);
  assert.deepEqual(oferta.mentions, [ANA, BETO]);
  assert.match((await correr(Empleados, BETO, ".ofertas")).text, /\*Fletes Ana\* \(Ana\): chofer por 40 por día/);
  assert.match((await correr(Empleados, BETO, ".contraoferta 1.000")).text, /^❌ Soñar es gratis/);
  assert.match((await correr(Empleados, BETO, ".contraoferta 50")).text, /regatea: quiere 50 por día/);
  assert.match((await correr(Empleados, ANA, `.firmar ${aBeto}`, [BETO])).text, /^✍️ Firmado: .* por 50 UruCoins por día/);
  assert.match((await correr(Empresa, BETO, ".empresa")).text, /^🚛 \*Fletes Ana\* — transportista de Ana[^]*1\. Beto — chofer nv\.1 · 50\/día[^]*_Laburás acá: \.cobrar cobra el sueldo/);
  assert.match((await correr(Empresa, BETO, ".puestos")).text, /^👥 \*Puestos de Fletes Ana\*/);

  // .cobrar: from the company's caja.
  const cobro = await correr(Laburos, BETO, ".cobrar");
  assert.match(cobro.text, /^🚛 Jornada de chofer en \*Fletes Ana\*: .*\(\+60\)\.\n🪙 Cobraste \*50 UruCoins\* de sueldo/);
  assert.deepEqual(cobro.mentions, [ANA]);
  assert.equal(fila(e).caja, 210);
  assert.match((await correr(Laburos, BETO, ".cobrar")).text, /^❌ Ya cobraste hoy\. El sueldo es una vez por día, chofer\./);

  // .renunciar leaves the post and keeps the trade; paid today by the company, the trade's wage waits.
  assert.match((await correr(Laburos, BETO, ".renunciar")).text, /^🚪 .* renunció a su puesto de chofer/);
  assert.equal(L.laburoDe(G, BETO).laburo, "mozo");
  assert.match((await correr(Laburos, BETO, ".cobrar")).text, /^❌ Ya cobraste hoy/);
  assert.match((await correr(Laburos, BETO, ".renunciar")).text, /^Renunciaste a mozo/);

  // With an empty caja the employee collects their own trade's wage, and the owner is told.
  db.prepare(`UPDATE empresas_experiencia SET ultimo_cobro = '' WHERE chat = ?`).run(G);
  db.prepare(`UPDATE laburos SET ultimo_cobro = '', desde = 0 WHERE chat = ?`).run(G);
  laburante(G, BETO, "dj", { cobros: 0 });
  await correr(Empleados, ANA, `.contratar ${aBeto} chofer 40`, [BETO]);
  assert.match((await correr(Empleados, BETO, ".firmar")).text, /^✍️ Firmado/);
  db.prepare(`UPDATE empresas SET caja = 0 WHERE id = ?`).run(e.id);
  const sinCaja = await correr(Laburos, BETO, ".cobrar");
  assert.match(sinCaja.text, /^😬 En la caja de \*Fletes Ana\* no hay para tu sueldo de chofer \(40\)[^]*\n\n🎧 [^]*Cobraste \*\d+ UruCoins\*/);
  assert.deepEqual(sinCaja.mentions, [ANA]);
  assert.equal(fila(e).facturado, 60, "ese día la empresa no facturó");

  // Claudia's own, and firing by number or by mention.
  db.prepare(`UPDATE empresas SET caja = 500 WHERE id = ?`).run(e.id);
  assert.match((await correr(Empleados, ANA, ".contratar claudia gerente")).text, /^🤖 Te mando a el Cacho, de los míos, de \*gerente\*/);
  assert.match((await correr(Empleados, ANA, ".despedir")).text, /^❌ No sé a quién/);
  assert.match((await correr(Empleados, ANA, ".despedir 2")).text, /^📦 el Cacho dejó de ser gerente/);
  const despido = await correr(Empleados, ANA, `.despedir ${aBeto}`, [BETO]);
  assert.match(despido.text, /^📦 .*, estás despedido: ya no sos chofer de \*Fletes Ana\*\. Te llevás 40 UruCoins/);
  assert.deepEqual(despido.mentions, [BETO]);
  assert.match((await correr(Empleados, BETO, ".rechazaroferta")).text, /^❌ No hay ninguna oferta/);
});

test("categoría por valor: la plata depositada cuenta a los días, las deudas se restan y se pierde si el valor baja", () => {
  const G = "valor@g.us";
  const DIA = 24 * 3600e3;
  assert.deepEqual([0, 4999, 5000, 14999, 15000, 50000].map(E.categoriaPorValor), [0, 0, 1, 1, 2, 3]);
  assert.ok(E.CATEGORIAS.every((c, i) => !i || (c.valor > E.CATEGORIAS[i - 1].valor && c.valor >= c.desde)), "el valor pide más que lo facturado");
  const e = patron(G, "ana@lid", "camionero", "Fletes Ana", 30000);

  // Put in today: it doesn't count, not even turned into a truck right away.
  assert.match(E.depositar(G, "ana@lid", 15000).mensaje, /cuenta en 3 días/);
  assert.equal(E.categoriaEmpresa(E.empresaDe(G, "ana@lid")), 0);
  assert.ok(E.comprarBien(G, "ana@lid", "camion").ok);
  assert.equal(E.valorDeEmpresa(E.empresaDe(G, "ana@lid")).total, 14100 + 1800 - 15000, "la caja y dos camiones, menos lo depositado entero");
  assert.match(E.comprarBien(G, "ana@lid", "semi").error, /le falta facturar 2000 o valer 5000 \(hoy vale 900\)/);
  const propio = E.textoEmpresa(E.empresaDe(G, "ana@lid"), { propio: true });
  assert.match(propio, /🏷️ Changarín · facturó 0 · vale 900 \(para PyME: facturar 2000 o valer 5000\)\n⏳ 15000 que pusiste en la caja cuentan para el valor desde el \w+ \d+ a las \d\d:\d\d/);
  assert.doesNotMatch(E.textoEmpresa(E.empresaDe(G, "ana@lid")), /⏳/, "eso lo ve su patrón nomás");

  // Three days later it counts: an Empresa by what it's worth, said once, and news for the paper once.
  db.prepare(`UPDATE empresas_depositos SET fecha = fecha - ? WHERE empresa = ?`).run(3 * DIA + 1000, e.id);
  const ahora = E.textoEmpresa(E.empresaDe(G, "ana@lid"), { propio: true });
  assert.match(ahora, /🏷️ Empresa \(por lo que vale\) · facturó 0 · vale 15900 \(para Grupo empresarial: facturar 40000 o valer 50000\)/);
  assert.match(ahora, /🏆 \*Fletes Ana\* subió de categoría por lo que vale: ahora es \*Empresa\* \(7 puestos/);
  assert.deepEqual([fila(e).categoria, fila(e).categoria_max], [2, 2], "la más alta que tuvo: para el diario del pueblo, una vez");
  assert.doesNotMatch(E.textoEmpresa(E.empresaDe(G, "ana@lid"), { propio: true }), /🏆/, "se dice una vez");
  assert.ok(E.comprarBien(G, "ana@lid", "bitren").ok, "con la categoría, los bienes grandes");

  // A loan isn't worth: what the owner owes comes off.
  db.prepare(`INSERT INTO banco_prestamos (chat, deudor, monto, total, saldo, cuota, cuotas, creado) VALUES (?, 'ana@lid', 6000, 6500, 6500, 900, 8, ?)`).run(G, Date.now());
  assert.equal(E.valorDeEmpresa(E.empresaDe(G, "ana@lid")).total, 15900 - 6500);
  assert.match(E.textoEmpresa(E.empresaDe(G, "ana@lid"), { propio: true }), /🏦 Al valor se le descuentan 6500 que debe Ana[^]*📉 \*Fletes Ana\* bajó a \*PyME\*/);
  db.prepare(`DELETE FROM banco_prestamos WHERE chat = ?`).run(G);
  assert.match(E.textoEmpresa(E.empresaDe(G, "ana@lid"), { propio: true }), /🏆 \*Fletes Ana\* subió de categoría por lo que vale: ahora es \*Empresa\*/, "paga y vuelve");

  // Taking the money out takes the category down; what it has stays, and nothing new of the bigger ones comes in.
  for (let i = 0; i < 3; i++) assert.ok(E.contratarNPC(G, "ana@lid", "chofer").ok);
  const retiro = E.retirar(G, "ana@lid", 9000);
  assert.match(retiro.mensaje, /📉 \*Fletes Ana\* bajó a \*PyME\*: lo que vale ya no le da para Empresa, y lo facturado tampoco\. Los bienes y la gente que ya tiene se quedan/);
  assert.equal(E.empleadosDe(E.empresaDe(G, "ana@lid")).length, 3);
  assert.match(E.comprarBien(G, "ana@lid", "bitren").error, /es para una Empresa y \*Fletes Ana\* todavía es PyME/);
  // Back up to where it was: told again (the paper already had it: it hears of the highest one it never had).
  assert.ok(E.depositar(G, "ana@lid", 9000, Date.now() - 4 * DIA).ok);
  assert.deepEqual([fila(e).categoria, fila(e).categoria_max], [1, 2]);
  assert.match(E.textoEmpresa(E.empresaDe(G, "ana@lid"), { propio: true }), /🏆 \*Fletes Ana\* subió de categoría por lo que vale: ahora es \*Empresa\*/);

  // A company from before the column is noted the first time, with nothing to say.
  db.prepare(`UPDATE empresas SET categoria = -1, categoria_max = -1 WHERE id = ?`).run(e.id);
  assert.doesNotMatch(E.textoEmpresa(E.empresaDe(G, "ana@lid"), { propio: true }), /🏆|📉/);
  assert.deepEqual([fila(e).categoria, fila(e).categoria_max], [2, 2]);
});

test("el manual de Claudia dice las categorías con los números de CATEGORIAS", async () => {
  const { MANUAL } = await import("../lib/manual-claudia.js");
  const [, pyme, empresa, grupo] = E.CATEGORIAS;
  assert.ok(MANUAL.includes(`${pyme.nombre} (${pyme.desde} facturados o ${pyme.valor} de valor, ${pyme.puestos} puestos)`));
  for (const c of [empresa, grupo]) assert.ok(MANUAL.includes(`${c.nombre} (${c.desde} facturados o ${c.valor} de valor, ${c.puestos})`), c.nombre);
  assert.ok(MANUAL.includes(`cuenta para el valor recién a los ${E.EMPRESA.DEPOSITO_DIAS} días`));
});
