// Weeks of a town with its Banco Central, to see that the economy holds (lib/banco.js): node scripts/simular-banco.mjs
// [semanas] [escenario]. It runs on a database of its own, in a temp folder, with a group of players of different
// kinds: a worker who saves, a saver who locks all he can for 180 days, a boss who borrows to buy a semi for his
// company, a gambler who loses in the timba and borrows from a neighbour, a lender, a deadbeat who borrows and spends
// it all, the political intendente who leans the rate down whenever he can, and someone who barely plays. With
// heredero, an heir too, who comes in with a fortune and founds a company with it: the money he puts in its caja waits
// its days before it counts for the category (lib/empresas.js), and the category it gave him goes when he takes it
// out. Each day they
// earn what the game pays (a wage by their trade's level and the town, and what the chat, the games and the streak
// give), spend in the shop and the timba, and use the bank as their kind does; the town lives its days and the bank its
// rounds. Every week it prints the money of the town, the inflation, the rate, the deposits and the debts, and at the
// end what the bank minted and destroyed, and checks the economy's limits: nobody under zero, the rate in its bounds,
// no money printed out of nothing beyond the deposits' interest, nobody broke for good, and the heir's category by what
// his company is worth neither early nor kept once the worth is gone.
// Escenarios: "normal" (the default), "boom" (everyone earns three times as much: the rate has to climb) and
// "recesion" (they earn a third and gamble more: it has to come down). The test (test/banco-simulacion.test.mjs) runs
// the three, shorter, and checks the same limits; and the three again with the heir, apart, so the runs the bank was
// tuned with stay as they were (his money moves the town, and with it everyone's dice). From the command line, a third
// word "heredero" runs them with him: node scripts/simular-banco.mjs 10 normal heredero
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { db, loadDatabase, initDataDB, moverCoins, updateChat, getSaldoCoins, ganarCoins, gastarCoins } from "../database-functions.js";
import * as B from "../lib/banco.js";
import * as P from "../lib/pueblo.js";
import * as L from "../lib/laburos.js";
import * as E from "../lib/empresas.js";
import * as T from "../lib/tienda.js";

const DIA = 24 * 60 * 60 * 1000;
const INICIO = new Date(2026, 0, 5, 15, 0, 0).getTime(); // a Monday at 15:00, in the bank's hours

// A seeded die, so a run can be repeated.
function dado(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The kinds of player: their trade and level to start with, what the chat and the games give them a day, what they
// spend a day in the shop (and how often), and what they lose in the timba (a day, on average, with its swing).
const PERFILES = [
  { nombre: "laburante", oficio: "tambero", nivel: 3, charla: 45, tienda: 0.05, timba: 10 },
  { nombre: "ahorrista", oficio: "oficinista", nivel: 6, charla: 30, tienda: 0.03, timba: 0 },
  { nombre: "patron", oficio: "camionero", nivel: 10, charla: 40, tienda: 0.05, timba: 10, empresa: true },
  { nombre: "timbero", oficio: "dj", nivel: 4, charla: 60, tienda: 0.02, timba: 60 },
  { nombre: "prestamista", oficio: "mecanico", nivel: 7, charla: 35, tienda: 0.04, timba: 5 },
  { nombre: "moroso", oficio: "taxista", nivel: 4, charla: 40, tienda: 0.1, timba: 40 },
  { nombre: "politico", oficio: "politico", nivel: 5, charla: 50, tienda: 0.04, timba: 10 },
  { nombre: "casual", oficio: "mozo", nivel: 1, charla: 10, tienda: 0.02, timba: 0 },
];
// The heir: a camionero of level 10 with a fortune, who puts most of it into his company's caja the first day, buys
// the big trucks once the category lets him, works them with two of Claudia's drivers, and on diaRetiro takes out all
// but dejar of the caja. He plays nothing else and rolls no dice of his own.
const HEREDERO = { nombre: "heredero", oficio: "camionero", nivel: 10, herencia: 20000, deposito: 17000, diaRetiro: 10, dejar: 1000 };

const ESCENARIOS = {
  normal: { ingresos: 1, timba: 1 },
  boom: { ingresos: 3, timba: 1 },
  recesion: { ingresos: 0.35, timba: 1.6 },
};

// Runs the weeks on the database already open (database-functions.js's), in its own group. Returns { semanas
// (one report a week), final, problemas }. With heredero, the heir plays too.
export async function simular({ semanas = 8, escenario = "normal", semilla = 7, heredero: conHeredero = false, chat = `sim-${escenario}${conHeredero ? "-heredero" : ""}@g.us`, log = () => {} } = {}) {
  const azar = dado(semilla);
  const entero = (n) => Math.floor(azar() * n);
  B._dep.azar = entero;
  P._dep.azar = entero;
  const esc = ESCENARIOS[escenario] || ESCENARIOS.normal;

  // The group, its town and its people.
  const gente = PERFILES.map((p, i) => ({ ...p, id: `3000000000009${String(i).padStart(2, "0")}@lid` }));
  for (const g of gente) {
    initDataDB({ chat, sender: g.id, senderJid: "", pushName: g.nombre });
    moverCoins(chat, g.id, 300, "test_carga");
    db.prepare(`INSERT OR REPLACE INTO laburos (chat, usuario, laburo, desde, ultimo_cobro, cobros) VALUES (?, ?, ?, ?, '', ?)`).run(chat, g.id, g.oficio, INICIO - 90 * DIA, L.cobrosParaNivel(g.nivel));
  }
  P.nacer(chat, "Villa Simulación", INICIO - DIA);
  updateChat(chat, { pueblo: 1 });
  // The deadbeat has a pickup truck: the bank has something to seize.
  T.fijarEscalon(chat, gente.find((g) => g.nombre === "moroso").id, "auto", 2);
  const patron = gente.find((g) => g.empresa);
  db.prepare(`INSERT INTO empresas (chat, patron, tipo, nombre, caja, fundada, visto) VALUES (?, ?, 'camionero', 'Fletes Sim', 0, ?, ?)`).run(chat, patron.id, INICIO, Date.now());
  const empresaId = db.prepare(`SELECT id FROM empresas WHERE chat = ? AND patron = ?`).get(chat, patron.id).id;
  db.prepare(`INSERT INTO empresas_bienes (empresa, bien, comprado) VALUES (?, 'camion', ?)`).run(empresaId, INICIO);

  // The heir and his company, founded and filled the first day.
  const heredero = conHeredero ? { ...HEREDERO, id: "300000000000999@lid" } : null;
  let herencia = null;
  if (heredero) {
    initDataDB({ chat, sender: heredero.id, senderJid: "", pushName: heredero.nombre });
    moverCoins(chat, heredero.id, heredero.herencia, "test_carga");
    db.prepare(`INSERT OR REPLACE INTO laburos (chat, usuario, laburo, desde, ultimo_cobro, cobros) VALUES (?, ?, ?, ?, '', ?)`).run(chat, heredero.id, heredero.oficio, INICIO - 90 * DIA, L.cobrosParaNivel(heredero.nivel));
    db.prepare(`INSERT INTO empresas (chat, patron, tipo, nombre, caja, fundada, visto, categoria, categoria_max) VALUES (?, ?, 'camionero', 'Fletes Herencia', 0, ?, ?, 0, 0)`).run(chat, heredero.id, INICIO, Date.now());
    herencia = db.prepare(`SELECT id FROM empresas WHERE chat = ? AND patron = ?`).get(chat, heredero.id).id;
    db.prepare(`INSERT INTO empresas_bienes (empresa, bien, comprado) VALUES (?, 'camion', ?)`).run(herencia, INICIO);
  }
  const saldo = (g) => getSaldoCoins(chat, g.id);
  const de = (nombre) => gente.find((g) => g.nombre === nombre);
  const cuenta = { ingresos: 0, timba: 0, tienda: 0, facturado: 0, impuesto: 0, remates: 0, embargos: 0, presiones: 0, rebotes: 0, p2p: 0, prestamos: 0, herencia: 0, herederoSubio: null, herederoBajo: null };
  const problemas = [];
  if (heredero && !E.depositar(chat, heredero.id, heredero.deposito, INICIO).ok) problemas.push("el heredero no pudo depositar");
  const reportes = [];
  let masaInicial = null;
  let minimo = Infinity;

  for (let d = 0; d < semanas * 7; d++) {
    const ahora = INICIO + d * DIA;
    P.diaDelPueblo(chat, ahora);
    // Now and then an event, as the town would roll them; a dollar crisis in the third week for sure.
    if (d === 15 || (d % 9 === 4 && azar() < 0.5)) {
      const clave = d === 15 ? "dolar" : P.sortearEvento(chat, ahora);
      const def = P.EVENTOS[clave];
      if (def && P.eventosActivos(chat, ahora).length < P.PUEBLO.EVENTOS_MAX) db.prepare(`INSERT INTO pueblo_eventos (chat, clave, desde, hasta, estado) VALUES (?, ?, ?, ?, 'activo')`).run(chat, clave, ahora - 1000, ahora + def.dias * DIA);
    }

    for (const g of gente) {
      // The wage, by the trade's level and the town (lib/laburos.js's numbers), and its level going up.
      const fila = L.laburoDe(chat, g.id);
      const sueldo = L.sueldoActual(fila.laburo) * L.factorNivel(L.nivelDe(fila.cobros)) * P.modificador(chat, `sueldo:${fila.laburo}`, ahora);
      const suerte = [0.5, 1, 1, 1, 1.5, 2][entero(6)];
      const gana = Math.round((sueldo * suerte + g.charla * (0.5 + azar())) * esc.ingresos);
      ganarCoins(chat, g.id, gana, "test_ingreso");
      cuenta.ingresos += gana;
      db.prepare(`UPDATE laburos SET cobros = cobros + 1 WHERE chat = ? AND usuario = ?`).run(chat, g.id);
      // The timba: the house keeps its share in the long run, with a swing.
      if (g.timba) {
        const pierde = Math.round(g.timba * esc.timba * (azar() * 2.4 - 0.4));
        if (pierde > 0) cuenta.timba += Math.min(pierde, saldo(g));
        if (pierde > 0) gastarCoins(chat, g.id, Math.min(pierde, saldo(g)), "test_timba");
        else ganarCoins(chat, g.id, -pierde, "test_timba");
      }
      // The shop: a house, a car, a pet, a status item now and then, at the town's prices.
      if (azar() < g.tienda) {
        const gasto = Math.round([60, 120, 150, 400, 450][entero(5)] * P.modificador(chat, "precios", ahora));
        if (gastarCoins(chat, g.id, gasto, "test_tienda")) cuenta.tienda += gasto;
      }
    }

    // The boss's company: its shift bills into the caja, less the town's tax.
    const e = E.empresaDe(chat, patron.id);
    const rinde = E.bienesDe(e).filter((b) => b.def.rinde).reduce((s, b) => s + b.def.rinde, 0);
    const factura = Math.round(rinde * 1.45 * P.modificador(chat, "empresa:camionero", ahora) * esc.ingresos);
    const impuesto = P.cobrarImpuesto(chat, factura);
    db.prepare(`UPDATE empresas SET caja = caja + ?, facturado = facturado + ? WHERE id = ?`).run(factura - impuesto, factura, empresaId);
    P.registrarHecho(chat, "facturacion", { monto: factura }, ahora);
    cuenta.facturado += factura;
    cuenta.impuesto += impuesto;

    // The heir's company: never a step for money that hasn't waited its days, never one kept once the worth is gone.
    // Once the category lets him he buys the big trucks; it bills what they yield (his own shift, and two of Claudia's
    // drivers at their share and wage), and on diaRetiro he takes money out, paying the DGI.
    if (heredero) {
      const h = E.empresaDe(chat, heredero.id);
      const categoria = E.categoriaEmpresa(h, ahora);
      const porFacturado = E.categoriaDe(h.facturado);
      const valor = E.valorDeEmpresa(h, ahora).total;
      if (d < E.EMPRESA.DEPOSITO_DIAS && categoria > porFacturado) problemas.push(`día ${d}: la plata depositada del heredero contó antes de tiempo (${E.CATEGORIAS[categoria].nombre})`);
      if (categoria > porFacturado && cuenta.herederoSubio === null) cuenta.herederoSubio = d;
      const tiene = new Set(E.bienesDe(h).map((b) => b.bien));
      for (const clave of ["bitren", "semi"]) {
        const def = E.EMPRESAS.camionero.bienes[clave];
        const precio = Math.round(def.precio * P.modificador(chat, "precios", ahora));
        if (!tiene.has(clave) && def.categoria <= categoria && h.caja >= precio) {
          db.prepare(`UPDATE empresas SET caja = caja - ? WHERE id = ?`).run(precio, herencia);
          db.prepare(`INSERT INTO empresas_bienes (empresa, bien, comprado) VALUES (?, ?, ?)`).run(herencia, clave, ahora);
          h.caja -= precio;
          log(`  día ${d}: el heredero compró ${def.nombre} (${E.CATEGORIAS[categoria].nombre}, vale ${valor})`);
        }
      }
      const rindes = E.bienesDe(h).filter((b) => b.def.rinde).map((b) => b.def.rinde).sort((a, b) => b - a);
      const choferes = rindes.slice(1, 3);
      const sueldos = choferes.length * Math.ceil(E.EMPRESAS.camionero.puestos.chofer.sueldo * E.EMPRESA.NPC_SUELDO);
      const factura = Math.round(((rindes[0] || 0) * 1.45 + choferes.reduce((s, r) => s + r * E.EMPRESA.NPC_RINDE, 0)) * P.modificador(chat, "empresa:camionero", ahora) * esc.ingresos);
      const impuesto = P.cobrarImpuesto(chat, factura);
      db.prepare(`UPDATE empresas SET caja = MAX(0, caja + ? - ?), facturado = facturado + ? WHERE id = ?`).run(factura - impuesto, sueldos, factura, herencia);
      P.registrarHecho(chat, "facturacion", { monto: factura }, ahora);
      cuenta.herencia += factura;
      if (d === heredero.diaRetiro) {
        const antes = E.categoriaEmpresa(E.empresaDe(chat, heredero.id), ahora);
        const retiro = Math.max(0, E.empresaDe(chat, heredero.id).caja - heredero.dejar);
        db.prepare(`UPDATE empresas SET caja = caja - ? WHERE id = ?`).run(retiro, herencia);
        ganarCoins(chat, heredero.id, Math.round(retiro * (1 - E.EMPRESA.IMPUESTO_RETIRO)), "test_retiro");
        const despues = E.empresaDe(chat, heredero.id);
        const ahoraEs = E.categoriaEmpresa(despues, ahora);
        const vale = E.valorDeEmpresa(despues, ahora).total;
        log(`  día ${d}: el heredero retiró ${retiro}: de ${E.CATEGORIAS[antes].nombre} a ${E.CATEGORIAS[ahoraEs].nombre} (facturó ${despues.facturado}, vale ${vale})`);
        if (ahoraEs > Math.max(E.categoriaDe(despues.facturado), E.categoriaPorValor(vale))) problemas.push(`día ${d}: el heredero sacó la plata y se quedó con la categoría`);
        cuenta.herederoBajo = ahoraEs < antes;
      }
    }

    // What each one does with the bank.
    const yo = (n) => de(n).id;
    // The worker: a 30-day deposit with what's over 400.
    if (d % 7 === 2 && saldo(de("laburante")) > 600) B.hacerPlazoFijo(chat, yo("laburante"), Math.min(saldo(de("laburante")) - 400, 3000), 30, ahora);
    // The saver: all he can, for 180 days.
    if (saldo(de("ahorrista")) > 300) {
      const tope = B.topeDepositos(chat, yo("ahorrista")) - B.depositosDe(chat, yo("ahorrista")).reduce((s, x) => s + x.monto, 0);
      const monto = Math.min(saldo(de("ahorrista")) - 100, tope);
      if (monto >= B.BANCO.DEPOSITO_MIN) B.hacerPlazoFijo(chat, yo("ahorrista"), monto, 180, ahora);
    }
    // The boss: a loan to the caja to buy a semi, then pays it from the company; once paid, another one if he can.
    const enCaja = db.prepare(`SELECT caja FROM empresas WHERE id = ?`).get(empresaId).caja;
    const semi = Math.round(E.EMPRESAS.camionero.bienes.semi.precio * P.modificador(chat, "precios", ahora));
    if (!db.prepare(`SELECT 1 FROM banco_prestamos WHERE chat = ? AND deudor = ? AND acreedor = '' AND estado = 'activo'`).get(chat, patron.id)) {
      const l = B.limiteDe(chat, patron.id, ahora).limite;
      if (enCaja < semi && enCaja + l >= semi && E.bienesDe(e).length < 3) {
        if (B.pedirPrestamo(chat, patron.id, Math.max(B.BANCO.PRESTAMO_MIN, Math.ceil((semi - enCaja) / 10) * 10), 8, "caja", ahora).ok) cuenta.prestamos++;
      }
    }
    const caja2 = db.prepare(`SELECT caja, facturado FROM empresas WHERE id = ?`).get(empresaId);
    if (caja2.caja >= semi && E.bienesDe(e).length < 2) {
      db.prepare(`UPDATE empresas SET caja = caja - ? WHERE id = ?`).run(semi, empresaId);
      db.prepare(`INSERT INTO empresas_bienes (empresa, bien, comprado) VALUES (?, 'semi', ?)`).run(empresaId, ahora);
      log(`  día ${d}: el patrón compró un semirremolque`);
    }
    // The deadbeat: borrows all he can and spends it in the timba and the shop.
    const moroso = de("moroso");
    if (d % 10 === 3 && !db.prepare(`SELECT 1 FROM banco_prestamos WHERE chat = ? AND deudor = ? AND acreedor = '' AND estado = 'activo'`).get(chat, moroso.id)) {
      const l = B.limiteDe(chat, moroso.id, ahora).limite;
      if (l >= B.BANCO.PRESTAMO_MIN && B.pedirPrestamo(chat, moroso.id, l, 4, "bolsillo", ahora).ok) {
        cuenta.prestamos++;
        const fundido = saldo(moroso);
        gastarCoins(chat, moroso.id, fundido, "test_timba");
        cuenta.timba += fundido;
      }
    }
    // The gambler, short of money, asks the lender; the lender lends at 15 % for a week.
    const timbero = de("timbero");
    if (saldo(timbero) < 100 && saldo(de("prestamista")) > 600 && !B.contratosDe(chat, timbero.id).length) {
      const o = B.ofrecerPrestamo(chat, yo("prestamista"), timbero.id, 300, 15, 7, ahora);
      if (o.ok && B.firmarPrestamo(chat, timbero.id, yo("prestamista"), ahora).ok) cuenta.p2p++;
    }
    // The intendente leans the rate down whenever he can.
    const p = P.estadoDe(chat, ahora);
    if (p.intendente.persona && B.presionarTasa(chat, p.intendente.usuario, "baja", ahora).ok) cuenta.presiones++;

    // The bank's round, and the auctions that closed (with a bid now and then from someone who can take it).
    const r = B.rondaDelBanco(chat, ahora);
    if (r) {
      for (const l of r.lineas) if (/EMBARGO|rebota/.test(l)) log(`  día ${d}: ${l.split("\n")[0].slice(0, 110)}`);
      cuenta.embargos += r.lineas.filter((l) => l.includes("EMBARGO")).length;
      cuenta.rebotes += r.lineas.filter((l) => l.startsWith("💥")).length;
    }
    for (const rem of B.rematesAbiertos(chat)) {
      for (const g of gente) if (g.id !== rem.deudor && azar() < 0.3) B.ofertar(chat, g.id, rem.base + 10 * entero(10), null, ahora);
      if (rem.cierra <= ahora + DIA) {
        const c = B.cerrarRemate(rem.id, rem.cierra);
        if (c) {
          cuenta.remates++;
          log(`  día ${d}: ${c.texto.slice(0, 110)}`);
        }
      }
    }

    // The limits, every day.
    for (const g of gente) {
      const s = saldo(g);
      minimo = Math.min(minimo, s);
      if (s < 0) problemas.push(`día ${d}: ${g.nombre} quedó en ${s}`);
    }
    const tasa = B.tasaDe(chat, ahora);
    if (tasa < B.BANCO.TASA_MIN || tasa > B.BANCO.TASA_MAX) problemas.push(`día ${d}: la tasa salió de sus límites (${tasa})`);

    if (d % 7 === 6) {
      const masa = B.masaMonetaria(chat).total;
      if (masaInicial === null) masaInicial = masa;
      const banco = B.estadoBanco(chat);
      const depositos = db.prepare(`SELECT COALESCE(SUM(monto), 0) AS n FROM banco_depositos WHERE chat = ? AND estado = 'abierto'`).get(chat).n;
      const deuda = db.prepare(`SELECT COALESCE(SUM(saldo), 0) AS n FROM banco_prestamos WHERE chat = ? AND estado = 'activo' AND acreedor = ''`).get(chat).n;
      const p2p = db.prepare(`SELECT COALESCE(SUM(saldo), 0) AS n FROM banco_prestamos WHERE chat = ? AND estado = 'activo' AND acreedor != ''`).get(chat).n;
      const clearing = B.enElClearing(chat, ahora);
      const pueblo = P.estadoDe(chat, ahora);
      const reporte = {
        semana: (d + 1) / 7,
        masa,
        inflacion: banco.inflacion,
        tasa,
        precios: Math.round(P.modificador(chat, "precios", ahora) * 100) / 100,
        prosperidad: pueblo.prosperidad,
        depositos,
        deuda,
        p2p,
        intereses: banco.intereses,
        morosos: clearing.filter((x) => x.estado === "moroso").length,
        atrasados: clearing.filter((x) => x.estado === "atrasado").length,
        promedio: Math.round(gente.reduce((s, g) => s + saldo(g), 0) / gente.length),
        eventos: pueblo.eventos.map((x) => x.clave).join(",") || "-",
        heredero: heredero ? E.CATEGORIAS[E.categoriaEmpresa(E.empresaDe(chat, heredero.id), ahora)].nombre : "-",
      };
      reportes.push(reporte);
      log(
        `sem ${String(reporte.semana).padStart(2)} | masa ${String(masa).padStart(6)} | infl ${String(reporte.inflacion ?? "-").padStart(5)} % | tasa ${String(tasa).padStart(3)} % | precios x${reporte.precios.toFixed(2)} | prosp ${String(reporte.prosperidad).padStart(3)} | plazos fijos ${String(depositos).padStart(5)} | deuda banco ${String(deuda).padStart(5)} | entre vecinos ${String(p2p).padStart(4)} | intereses pagados ${String(reporte.intereses).padStart(4)} | clearing ${reporte.morosos}M/${reporte.atrasados}A | saldo medio ${String(reporte.promedio).padStart(5)} | heredero ${reporte.heredero} | ${reporte.eventos}`,
      );
    }
  }

  // What the bank put into the town and took out of it, against everything the town earned.
  const banco = B.estadoBanco(chat);
  const final = {
    escenario,
    ...cuenta,
    prestado: banco.prestado,
    cobrado: banco.cobrado,
    intereses: banco.intereses,
    // money the bank created and didn't get back yet (loans still owed), and what deposits minted
    pendienteDeCobro: db.prepare(`SELECT COALESCE(SUM(saldo), 0) AS n FROM banco_prestamos WHERE chat = ? AND estado = 'activo' AND acreedor = ''`).get(chat).n,
    interesesSobreIngresos: Math.round((banco.intereses / Math.max(1, cuenta.ingresos + cuenta.facturado)) * 1000) / 10,
    minimo,
    morososAlFinal: B.enElClearing(chat, INICIO + semanas * 7 * DIA).filter((x) => x.estado === "moroso").map((x) => gente.find((g) => g.id === x.usuario)?.nombre),
  };
  // The deposits' interest is the bank's only faucet: it must stay a small share of what the town earns.
  if (final.interesesSobreIngresos > 8) problemas.push(`los plazos fijos pagaron ${final.interesesSobreIngresos} % de lo que ganó el pueblo`);
  // What the bank lent is bounded: no debt runs away.
  const deudaMax = Math.max(0, ...db.prepare(`SELECT total + recargos AS n FROM banco_prestamos WHERE chat = ?`).all(chat).map((x) => x.n));
  if (deudaMax > B.BANCO.LIMITE_MAX * 2) problemas.push(`una deuda llegó a ${deudaMax}`);
  return { semanas: reportes, final, problemas };
}

// Run as a script: a database of its own in a temp folder.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const semanas = Number(process.argv[2]) || 8;
  const escenarios = process.argv[3] && ESCENARIOS[process.argv[3]] ? [process.argv[3]] : Object.keys(ESCENARIOS);
  const heredero = process.argv.slice(3).includes("heredero");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-sim-banco-"));
  process.chdir(dir);
  loadDatabase();
  for (const escenario of escenarios) {
    console.log(`\n=== ${escenario.toUpperCase()}: ${semanas} semanas, ${PERFILES.length} jugadores${heredero ? " y el heredero" : ""} ===`);
    const r = await simular({ semanas, escenario, heredero, log: (l) => console.log(l) });
    console.log("final:", JSON.stringify(r.final));
    console.log(r.problemas.length ? `⚠️ problemas:\n${r.problemas.join("\n")}` : "✅ sin problemas: nadie bajo cero, la tasa en sus límites, ni plata de la nada ni deudas que se disparan");
  }
  fs.rmSync(dir, { recursive: true, force: true });
}
