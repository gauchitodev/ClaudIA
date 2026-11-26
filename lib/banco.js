// The Banco Central of each town (lib/pueblo.js): where a group is a town it has a branch, with a rate of its own that
// moves by itself. It takes fixed-term deposits, lends to the people of the group and to their companies, keeps
// everybody's standing in the clearing, and registers and collects the loans people make each other. .banco is its
// board. With the town off (or the economy off) there's no bank: nothing is collected, nothing pays, nothing moves.
//
// The rate. One reference rate per town, a yearly % (TNA), worked out internally by the day. Deposits pay a share of
// it, more for a longer term; the bank's loans cost PRESTAMO_FACTOR times it. Once a day it takes a step towards where
// the town says it should be: the bank measures the money there is (pockets, the companies' cajas and the deposits)
// and how much it grew in a week, the inflation. Growing faster than META_INFLACION, the rate goes up: saving pays
// more and borrowing costs more; shrinking (a recession), it comes down. Prosperity pushes it the same way, and some
// of the town's events add points (a dollar crisis, a bank robbery) or take them off (a multinacional). The prices of
// the town follow the inflation too (lib/pueblo.js, "precios"). The intendente can lean on it (.tasa baja, .tasa
// sube): the rate moves for some days, and leaning it down may go wrong, with the market taking fright.
//
// What keeps the economy whole (scripts/simular-banco.mjs runs weeks of a group to check it):
//   - a deposit's interest is the one thing here that mints money, so what a person can have deposited is capped by
//     the level of their trade (DEPOSITO_POR_NIVEL), and the rate by TASA_MAX;
//   - a loan always costs more than any deposit pays, so borrowing to deposit loses money;
//   - what the bank lends is capped by the person's level, what they own and their record, one loan at a time: whoever
//     never pays took that, at most, and has a good seized and auctioned for it;
//   - a debt stops growing at DEUDA_TOPE times its total, a company's last good to work with is never seized, what is
//     taken each day from someone who owes is at most COBRO_DIARIO of what they have, and the stain in the clearing
//     goes away some days after paying: nobody is broke for good;
//   - a loan between people only moves money from one pocket to another.
//
// Every number is in BANCO. The tables are in database-schema.js; the world's and the bank's names, in lib/mundo.js.
import { randomInt } from "crypto";
import { db, getChat, ganarCoins, gastarCoins, getSaldoCoins, totalEnCirculacion, chatsConOpcion, crearPendiente } from "../database-functions.js";
import { puebloActivo, estadoDe, eventosActivos, registrarHecho, recordar, npc } from "./pueblo.js";
import { laburoDe, nivelDe } from "./laburos.js";
import { empresaDe, valorDeBienes, valorDeBien, bienesEmbargables, quitarBien, sinLugarParaBien, recibirBien, EMPRESAS } from "./empresas.js";
import { escalonDe, fijarEscalon } from "./tienda.js";
import { nombreDe } from "./menciones.js";
import { claveDia } from "./actividad.js";
import { DIA_MS } from "./tiempo.js";
import { MUNDO } from "./mundo.js";

export const BANCO = {
  // The reference rate, a yearly %.
  TASA_NEUTRA: 50, // where it rests, with inflation on target, an average town and no event
  TASA_MIN: 15,
  TASA_MAX: 110,
  META_INFLACION: 4, // % the money of the town may grow in a week without the bank minding
  SENSIBILIDAD: 2, // points of rate for each point of weekly inflation off the target
  SENSIBILIDAD_PROSPERIDAD: 0.3, // points of rate for each point of prosperity off its rest (50)
  PASO_DIA: 3, // the most the rate moves in a day
  ANUNCIO_PUNTOS: 8, // the group is told once it's this far from the last rate it was told
  PISO_PERSONA: 1500, // inflation is measured over at least this much money a head: a town just born isn't Weimar
  HISTORIA_MIN_DIAS: 3, // with fewer days measured there's no inflation yet
  INFLACION_MIN: -30,
  INFLACION_MAX: 60,
  HISTORIA_DIAS: 60, // the daily measures kept
  // Fixed-term deposits: the days of each term and the share of the reference rate it pays.
  PLAZOS: { 30: 0.6, 90: 0.8, 180: 1 },
  DEPOSITO_MIN: 100,
  DEPOSITO_POR_NIVEL: 600, // all of a person's open deposits together: this much for each level of their trade
  DEPOSITOS_ABIERTOS: 4,
  // The bank's loans.
  PRESTAMO_FACTOR: 1.6, // a loan's rate, as times the reference one
  ATRASADO_PUNTOS: 20, // and these points more for whoever is "atrasado" in the clearing
  NIVEL_MIN: 2, // the level of their trade it takes to be lent to
  LIMITE_POR_NIVEL: 150, // what each level of the trade lets them borrow
  PATRIMONIO_PARTE: 0.4, // plus this share of what they own: their company's goods, their house and car, their deposits
  LIMITE_MAX: 6000,
  HISTORIAL_BONUS: 0.15, // each loan paid with no miss raises the limit this much...
  HISTORIAL_MAX: 4, // ...up to this many loans
  ATRASADO_LIMITE: 0.5, // the share of their limit an "atrasado" gets
  PRESTAMO_MIN: 100,
  SEMANAS_MAX: 8,
  CUOTA_DIAS: 7,
  RECARGO: 0.1, // a missed instalment adds this share of what went unpaid
  DEUDA_TOPE: 1.5, // the surcharges stop once the debt is this many times the loan's total
  FALLAS_EMBARGO: 2, // instalments missed in a row for the seizure, and for "moroso"
  COBRO_DIARIO: 0.5, // between due dates, what's overdue is taken from up to this share of what the person has
  // The clearing: how long the stain lasts once nothing is overdue.
  ATRASADO_DIAS: 7,
  MOROSO_DIAS: 21,
  // The auction of a seized good: its floor price and what the scrap dealer gives, as shares of what it's worth.
  REMATE_BASE: 0.5,
  REMATE_CHATARRA: 0.25,
  REMATE_HORAS: 24,
  REMATE_SUBA: 10, // a bid has to beat the best by this much at least
  // Loans between people.
  P2P_MIN: 10,
  P2P_MAX: 5000,
  P2P_INTERES_MAX: 50, // % over the whole loan: above that it's the usurero's business, not a contract
  P2P_DIAS_MAX: 30,
  P2P_OFERTA_HORAS: 24,
  P2P_ABIERTOS: 3, // contracts a person can owe at once
  P2P_MOROSO_DIAS: 7, // this long overdue, the borrower goes into the clearing as moroso
  // The intendente's pressure (.tasa baja / .tasa sube).
  PRESION_PUNTOS: 10,
  PRESION_DIAS: 7,
  PRESION_CADA_DIAS: 14,
  PRESION_RIESGO: 10, // % a day, while a pressure down lasts, of the market taking fright
  REBOTE_PUNTOS: 15,
  REBOTE_DIAS: 7,
  // The bank's hours: it collects, pays and tells the group only then.
  DESDE_HORA: 10,
  HASTA_HORA: 21,
};

// The dice, here so the tests can load them.
export const _dep = { azar: (n) => randomInt(0, n) };

const arroba = (lid) => `@${String(lid).split("@")[0]}`;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const limitar = (n, min, max) => Math.max(min, Math.min(max, n));
const mayuscula = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const SIN_BANCO = `Acá no hay banco: ${MUNDO.BANCO_CORTO} abre sucursal donde el grupo es un pueblo. Un admin lo prende con .pueblo on`;
export const CALIFICACION = { al_dia: "al día ✅", atrasado: "atrasado ⚠️", moroso: "moroso 🚨" };

// "hoy", "mañana", "el 3/12": a day as the bank's papers say it.
function dia(ms, ahora) {
  const d = new Date(ms);
  if (claveDia(d) === claveDia(new Date(ahora))) return "hoy";
  if (claveDia(d) === claveDia(new Date(ahora + DIA_MS))) return "mañana";
  return `el ${d.getDate()}/${d.getMonth() + 1}`;
}

// ---------- the bank's row ----------
// A town's bank, opened the first time it's asked for.
export function estadoBanco(chat) {
  const leer = () => db.prepare(`SELECT * FROM banco WHERE chat = ?`).get(chat);
  let fila = leer();
  if (!fila) {
    db.prepare(`INSERT OR IGNORE INTO banco (chat, tasa, tasa_anunciada) VALUES (?, ?, ?)`).run(chat, BANCO.TASA_NEUTRA, BANCO.TASA_NEUTRA);
    fila = leer();
  }
  return fila;
}
const sumarAlBanco = (chat, columna, n) => n > 0 && db.prepare(`UPDATE banco SET ${columna} = ${columna} + ? WHERE chat = ?`).run(Math.round(n), chat);

// ---------- the rate ----------
// Today's reference rate: the bank's own, plus the intendente's pressure (points, either way) and the backlash of one
// that went wrong.
export function tasaDe(chat, ahora = Date.now()) {
  const e = estadoBanco(chat);
  const presion = e.presion_hasta > ahora ? e.presion : 0;
  const rebote = e.rebote_hasta > ahora ? BANCO.REBOTE_PUNTOS : 0;
  return Math.round(limitar(e.tasa + presion + rebote, BANCO.TASA_MIN, BANCO.TASA_MAX));
}

// What a deposit for that term pays today (yearly %), or null for a term the bank doesn't offer.
export function tasaPlazo(chat, dias, ahora = Date.now()) {
  const parte = BANCO.PLAZOS[dias];
  return parte ? Math.round(tasaDe(chat, ahora) * parte) : null;
}

// What a loan from the bank costs that person today (yearly %).
export function tasaPrestamo(chat, usuario, ahora = Date.now()) {
  return Math.round(tasaDe(chat, ahora) * BANCO.PRESTAMO_FACTOR) + (calificacionDe(chat, usuario, ahora) === "atrasado" ? BANCO.ATRASADO_PUNTOS : 0);
}

// The money of the town: the pockets, the companies' cajas and what's in deposits. A loan adds to it (the bank lends
// money it makes) and paying it back takes it out again; a deposit's interest adds to it.
export function masaMonetaria(chat) {
  const { total, personas } = totalEnCirculacion(chat);
  const cajas = db.prepare(`SELECT COALESCE(SUM(caja), 0) AS n FROM empresas WHERE chat = ?`).get(chat).n;
  const depositos = db.prepare(`SELECT COALESCE(SUM(monto), 0) AS n FROM banco_depositos WHERE chat = ? AND estado = 'abierto'`).get(chat).n;
  return { total: total + cajas + depositos, personas };
}

// How much the money of the town grew in the last week, in %, from the bank's daily measures; null with too few days.
// Measured over a floor per head, so a town where nobody has a coin yet doesn't read as runaway inflation.
export function medirInflacion(chat, ahora, hoy = masaMonetaria(chat)) {
  const viejo = db.prepare(`SELECT * FROM banco_historia WHERE chat = ? AND fecha >= ? AND fecha < ? ORDER BY fecha ASC LIMIT 1`).get(chat, ahora - 7.5 * DIA_MS, ahora - 0.5 * DIA_MS);
  const dias = viejo ? (ahora - viejo.fecha) / DIA_MS : 0;
  if (dias < BANCO.HISTORIA_MIN_DIAS - 0.5) return null;
  const base = Math.max(viejo.circulante, BANCO.PISO_PERSONA * Math.max(1, hoy.personas));
  return Math.round(limitar((((hoy.total - viejo.circulante) / base) * 100 * 7) / dias, BANCO.INFLACION_MIN, BANCO.INFLACION_MAX) * 10) / 10;
}

// Where the rate should be, by the inflation, the prosperity and the events of the town.
export function objetivoTasa(chat, inflacion, ahora = Date.now()) {
  const e = estadoDe(chat, ahora);
  const porInflacion = inflacion === null ? 0 : BANCO.SENSIBILIDAD * (inflacion - BANCO.META_INFLACION);
  const porProsperidad = e ? BANCO.SENSIBILIDAD_PROSPERIDAD * (e.prosperidad - 50) : 0;
  const porEventos = eventosActivos(chat, ahora).reduce((s, x) => s + (x.def.tasa || 0), 0);
  return limitar(BANCO.TASA_NEUTRA + porInflacion + porProsperidad + porEventos, BANCO.TASA_MIN, BANCO.TASA_MAX);
}

// Why the rate went where it did, in words.
function porQue(sube, inflacion, eventos) {
  const evento = eventos.find((x) => (x.def.tasa || 0) * (sube ? 1 : -1) > 0);
  if (evento) return sube ? `con ${evento.def.nombre.toLowerCase()} nadie quiere prestar barato` : `con ${evento.def.nombre.toLowerCase()} sobra plata para prestar`;
  if (inflacion === null) return sube ? "la plaza anda nerviosa" : "la plaza anda tranquila";
  if (sube) return inflacion > BANCO.META_INFLACION ? `hay mucha plata dando vueltas (creció ${Math.round(inflacion)} % en la semana)` : "el pueblo anda acelerado";
  return inflacion < 0 ? "la plata del pueblo se está achicando" : "la plata viene tranquila";
}

// The day's move of the rate: measures the money, writes the inflation where the prices read it, and takes a step
// towards where the town says it should be. A pressure down may blow up. Returns the lines to tell the group.
export function moverTasa(chat, ahora = Date.now()) {
  const e = estadoBanco(chat);
  const hoy = masaMonetaria(chat);
  const inflacion = medirInflacion(chat, ahora, hoy);
  const objetivo = objetivoTasa(chat, inflacion, ahora);
  const tasa = e.tasa + limitar(objetivo - e.tasa, -BANCO.PASO_DIA, BANCO.PASO_DIA);
  db.prepare(`UPDATE banco SET tasa = ?, inflacion = ?, dia = ? WHERE chat = ?`).run(tasa, inflacion, claveDia(new Date(ahora)), chat);
  db.prepare(`UPDATE pueblos SET inflacion = ? WHERE chat = ?`).run(inflacion ?? 0, chat);
  db.prepare(`INSERT OR REPLACE INTO banco_historia (chat, dia, fecha, circulante, personas, tasa) VALUES (?, ?, ?, ?, ?, ?)`).run(chat, claveDia(new Date(ahora)), ahora, hoy.total, hoy.personas, tasa);
  db.prepare(`DELETE FROM banco_historia WHERE chat = ? AND fecha < ?`).run(chat, ahora - BANCO.HISTORIA_DIAS * DIA_MS);

  const lineas = [];
  if (e.presion < 0 && e.presion_hasta > ahora && _dep.azar(100) < BANCO.PRESION_RIESGO) {
    db.prepare(`UPDATE banco SET presion = 0, presion_hasta = 0, rebote_hasta = ? WHERE chat = ?`).run(ahora + BANCO.REBOTE_DIAS * DIA_MS, chat);
    const intendente = estadoDe(chat, ahora)?.intendente;
    lineas.push(`💥 De tanto apretar al banco, la plaza se asustó: se terminó la tasa barata y ahora rebota *${BANCO.REBOTE_PUNTOS} puntos para arriba* por ${BANCO.REBOTE_DIAS} días. En la intendencia dicen que fue "un fenómeno internacional".`);
    registrarHecho(chat, "tasa_rebote", { usuario: intendente?.usuario || "", puntos: BANCO.REBOTE_PUNTOS }, ahora);
  }
  const efectiva = tasaDe(chat, ahora);
  if (Math.abs(efectiva - e.tasa_anunciada) >= BANCO.ANUNCIO_PUNTOS) {
    const sube = efectiva > e.tasa_anunciada;
    db.prepare(`UPDATE banco SET tasa_anunciada = ? WHERE chat = ?`).run(efectiva, chat);
    lineas.push(`${sube ? "📈" : "📉"} ${mayuscula(MUNDO.BANCO_CORTO)} ${sube ? "subió" : "bajó"} la tasa a *${efectiva} % anual*: ${porQue(sube, inflacion, eventosActivos(chat, ahora))}. ${sube ? "Rinde más el plazo fijo y sale más caro endeudarse." : "Sale más barato pedir prestado y rinde menos el plazo fijo."}`);
    registrarHecho(chat, "tasa", { antes: e.tasa_anunciada, ahora: efectiva, inflacion }, ahora);
  }
  return lineas;
}

// .tasa baja / .tasa sube: the intendente leans on the bank, PRESION_PUNTOS for PRESION_DIAS days, once every
// PRESION_CADA_DIAS. Down, credit is cheap for everybody, and each day it lasts the market may take fright (moverTasa);
// up, it cools the town down, and nobody likes it. Returns { ok, mensaje, mentions } or { ok: false, error }.
export function presionarTasa(chat, quien, sentido, ahora = Date.now()) {
  if (!puebloActivo(chat)) return { ok: false, error: SIN_BANCO };
  const intendente = estadoDe(chat, ahora).intendente;
  const ids = [].concat(quien).filter(Boolean);
  if (!intendente.persona || !ids.includes(intendente.usuario)) return { ok: false, error: `Al presidente del banco lo llama el intendente, y ${intendente.persona ? `ese es ${intendente.como}` : `por ahora es ${intendente.nombre}, que no tiene ni teléfono`}. Para ser intendente hay que ser el político de más nivel del grupo.`, mentions: intendente.persona ? [intendente.usuario] : [] };
  if (sentido !== "baja" && sentido !== "sube") return { ok: false, error: `¿Para dónde? .tasa baja (crédito barato, con riesgo de que la plaza se asuste) o .tasa sube (enfría el pueblo). Hoy está en ${tasaDe(chat, ahora)} % anual.` };
  const e = estadoBanco(chat);
  if (e.presion_hasta > ahora) return { ok: false, error: `Ya lo estás apretando: la tasa sigue ${e.presion < 0 ? "rebajada" : "subida"} hasta ${dia(e.presion_hasta, ahora)}.` };
  if (e.rebote_hasta > ahora) return { ok: false, error: `El banco todavía está ofendido por la última vez: no te atiende el teléfono hasta ${dia(e.rebote_hasta, ahora)}.` };
  const espera = e.ultima_presion + BANCO.PRESION_CADA_DIAS * DIA_MS - ahora;
  if (espera > 0) return { ok: false, error: `Al presidente del banco se lo aprieta una vez cada ${BANCO.PRESION_CADA_DIAS} días, que si no se acostumbra. Se puede de nuevo ${dia(ahora + espera, ahora)}.` };
  const antes = tasaDe(chat, ahora);
  const puntos = sentido === "baja" ? -BANCO.PRESION_PUNTOS : BANCO.PRESION_PUNTOS;
  db.prepare(`UPDATE banco SET presion = ?, presion_hasta = ?, ultima_presion = ? WHERE chat = ?`).run(puntos, ahora + BANCO.PRESION_DIAS * DIA_MS, ahora, chat);
  const despues = tasaDe(chat, ahora);
  db.prepare(`UPDATE banco SET tasa_anunciada = ? WHERE chat = ?`).run(despues, chat);
  registrarHecho(chat, "tasa_presion", { usuario: intendente.usuario, puntos, antes, ahora: despues }, ahora);
  const yo = arroba(intendente.usuario);
  const mensaje =
    puntos < 0
      ? `🏛️☎️ ${yo} lo llamó al presidente del banco y la tasa baja de ${antes} a *${despues} % anual* por ${BANCO.PRESION_DIAS} días: préstamos más baratos para todos y plazos fijos que rinden menos. "El crédito es un derecho", declaró, sin aclarar quién lo paga.\n_Ojo: plata barata es más plata en la calle, y cada día que dure hay ${BANCO.PRESION_RIESGO} % de chance de que la plaza se asuste y la tasa rebote ${BANCO.REBOTE_PUNTOS} puntos para arriba._`
      : `🏛️☎️ ${yo} le pidió al banco que enfríe el pueblo: la tasa sube de ${antes} a *${despues} % anual* por ${BANCO.PRESION_DIAS} días. Los ahorristas aplauden, los endeudados putean y ${npc(chat, "almacenera") || "la almacenera"} ya lo anda contando.`;
  return { ok: true, mensaje, mentions: [intendente.usuario] };
}

// ---------- the clearing ----------
const filaCliente = (chat, usuario) => db.prepare(`SELECT * FROM banco_clientes WHERE chat = ? AND usuario = ?`).get(chat, usuario) || null;

// Someone's standing: "al_dia", "atrasado" or "moroso". A stain whose days are up is gone.
export function calificacionDe(chat, usuario, ahora = Date.now()) {
  const c = filaCliente(chat, usuario);
  if (!c || c.estado === "al_dia") return "al_dia";
  if (c.hasta > 0 && c.hasta <= ahora) {
    db.prepare(`UPDATE banco_clientes SET estado = 'al_dia', hasta = 0 WHERE chat = ? AND usuario = ?`).run(chat, usuario);
    return "al_dia";
  }
  return c.estado;
}
export const esMoroso = (chat, usuario, ahora = Date.now()) => puebloActivo(chat) && calificacionDe(chat, usuario, ahora) === "moroso";

// The stain: here it only gets worse, and it lasts while something is overdue (hasta 0). Returns whether it changed.
function manchar(chat, usuario, estado) {
  const actual = filaCliente(chat, usuario);
  const peor = actual?.estado === "moroso" || estado === "moroso" ? "moroso" : "atrasado";
  db.prepare(`INSERT INTO banco_clientes (chat, usuario, estado, hasta) VALUES (?, ?, ?, 0) ON CONFLICT(chat, usuario) DO UPDATE SET estado = excluded.estado, hasta = 0`).run(chat, usuario, peor);
  return peor !== (actual?.estado || "al_dia");
}

// After a payment: with nothing overdue left anywhere, the stain starts counting its days.
function revisarMancha(chat, usuario, ahora) {
  const c = filaCliente(chat, usuario);
  if (!c || c.estado === "al_dia" || c.hasta > 0) return;
  if (db.prepare(`SELECT 1 FROM banco_prestamos WHERE chat = ? AND deudor = ? AND estado = 'activo' AND vencido > 0`).get(chat, usuario)) return;
  const dias = c.estado === "moroso" ? BANCO.MOROSO_DIAS : BANCO.ATRASADO_DIAS;
  db.prepare(`UPDATE banco_clientes SET hasta = ? WHERE chat = ? AND usuario = ?`).run(ahora + dias * DIA_MS, chat, usuario);
}

const sumarLimpio = (chat, usuario) => db.prepare(`INSERT INTO banco_clientes (chat, usuario, limpios) VALUES (?, ?, 1) ON CONFLICT(chat, usuario) DO UPDATE SET limpios = limpios + 1`).run(chat, usuario);

// Whoever is in the clearing in a group: [{ usuario, estado }], the morosos first.
export function enElClearing(chat, ahora = Date.now()) {
  return db
    .prepare(`SELECT usuario FROM banco_clientes WHERE chat = ? AND estado != 'al_dia'`)
    .all(chat)
    .map((r) => ({ usuario: r.usuario, estado: calificacionDe(chat, r.usuario, ahora) }))
    .filter((r) => r.estado !== "al_dia")
    .sort((a, b) => (a.estado === b.estado ? 0 : a.estado === "moroso" ? -1 : 1));
}

// ---------- money in and out ----------
const cajaDe = (chat, usuario) => db.prepare(`SELECT id, caja, nombre FROM empresas WHERE chat = ? AND patron = ?`).get(chat, usuario) || null;

// Takes up to that much from a pocket: returns what it took.
function sacarDeBolsillo(chat, usuario, hasta, motivo) {
  const n = Math.max(0, Math.min(Math.floor(hasta), getSaldoCoins(chat, usuario)));
  if (n > 0) gastarCoins(chat, usuario, n, motivo);
  return n;
}

// The same from their company's caja.
function sacarDeCaja(chat, usuario, hasta) {
  const e = cajaDe(chat, usuario);
  const n = Math.max(0, Math.min(Math.floor(hasta), e?.caja || 0));
  if (n > 0) db.prepare(`UPDATE empresas SET caja = caja - ? WHERE id = ?`).run(n, e.id);
  return n;
}

// ---------- fixed-term deposits ----------
export const interesDe = (monto, tna, dias) => Math.floor((monto * tna * dias) / 36500);

// Someone's open deposits, the oldest first, numbered as the board shows them.
export function depositosDe(chat, usuario) {
  return db.prepare(`SELECT * FROM banco_depositos WHERE chat = ? AND usuario = ? AND estado = 'abierto' ORDER BY id ASC`).all(chat, usuario).map((d, i) => ({ ...d, numero: i + 1 }));
}

// The level of someone's trade (0 with none).
const nivelDeOficio = (chat, usuario) => {
  const l = laburoDe(chat, usuario);
  return l ? nivelDe(l.cobros) : 0;
};

// The most someone can have in deposits at once: by the level of their trade (a level 1's with no trade).
export const topeDepositos = (chat, usuario) => BANCO.DEPOSITO_POR_NIVEL * Math.max(1, nivelDeOficio(chat, usuario));

export const textoPlazos = (chat, ahora = Date.now()) => Object.keys(BANCO.PLAZOS).map((d) => `${d} días ${tasaPlazo(chat, Number(d), ahora)} %`).join(" · ");

// .plazofijo <amount> <days>: the money leaves the pocket until the term is up, and comes back on its own with its
// interest at the rate of the day it was put in.
export function hacerPlazoFijo(chat, usuario, monto, dias, ahora = Date.now()) {
  if (!puebloActivo(chat)) return { ok: false, error: SIN_BANCO };
  const tna = tasaPlazo(chat, dias, ahora);
  if (!Number.isInteger(monto) || monto <= 0 || tna === null) return { ok: false, error: `Un plazo fijo se hace así: .plazofijo 500 90 (el monto y los días: ${Object.keys(BANCO.PLAZOS).join(", ")}). Hoy paga, por año: ${textoPlazos(chat, ahora)}.` };
  if (monto < BANCO.DEPOSITO_MIN) return { ok: false, error: `El banco no abre un plazo fijo por menos de ${BANCO.DEPOSITO_MIN} UruCoins. Para eso está el frasco de la cocina.` };
  if (esMoroso(chat, usuario, ahora)) return { ok: false, error: "Estás en el clearing como moroso: antes de guardar plata en el banco, devolvé la que debés. .banco" };
  const abiertos = depositosDe(chat, usuario);
  if (abiertos.length >= BANCO.DEPOSITOS_ABIERTOS) return { ok: false, error: `Ya tenés ${BANCO.DEPOSITOS_ABIERTOS} plazos fijos abiertos, que es el máximo. Esperá a que venza alguno.` };
  const yaPuesto = abiertos.reduce((s, d) => s + d.monto, 0);
  const tope = topeDepositos(chat, usuario);
  const lugar = tope - yaPuesto;
  if (monto > lugar) return { ok: false, error: `El banco te toma hasta ${tope} UruCoins en plazos fijos (${BANCO.DEPOSITO_POR_NIVEL} por cada nivel de tu oficio)${yaPuesto ? ` y ya tenés ${yaPuesto}` : ""}: ${lugar >= BANCO.DEPOSITO_MIN ? `podés poner ${lugar} más` : "por ahora no entra más"}. Subí de nivel con .cobrar y te dejan más.` };
  const interes = interesDe(monto, tna, dias);
  const vence = ahora + dias * DIA_MS;
  const hecho = db.transaction(() => {
    if (!gastarCoins(chat, usuario, monto, "banco_plazo_fijo")) return false;
    db.prepare(`INSERT INTO banco_depositos (chat, usuario, monto, tna, dias, interes, creado, vence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(chat, usuario, monto, tna, dias, interes, ahora, vence);
    return true;
  })();
  if (!hecho) return { ok: false, error: `No te alcanza: tenés ${getSaldoCoins(chat, usuario)} UruCoins en el bolsillo.` };
  return { ok: true, mensaje: `💰 Plazo fijo hecho: *${monto} UruCoins* a ${dias} días, al ${tna} % anual. Vence ${dia(vence, ahora)} y te vuelven *${monto + interes}* solos al bolsillo.\n_Si lo rompés antes (.romperplazo) te llevás lo que pusiste y ni un peso de interés._` };
}

// .romperplazo <number>: out before its time. The money comes back as it went in, with no interest.
export function romperPlazoFijo(chat, usuario, numero = null, ahora = Date.now()) {
  if (!puebloActivo(chat)) return { ok: false, error: SIN_BANCO };
  const abiertos = depositosDe(chat, usuario);
  if (!abiertos.length) return { ok: false, error: "No tenés ningún plazo fijo abierto." };
  const d = abiertos.length === 1 && !numero ? abiertos[0] : abiertos.find((x) => x.numero === numero);
  if (!d) return { ok: false, error: `Decime cuál: .romperplazo 1. Tenés ${abiertos.map((x) => `${x.numero}) ${x.monto} a ${x.dias} días`).join(", ")}.` };
  db.transaction(() => {
    db.prepare(`UPDATE banco_depositos SET estado = 'roto' WHERE id = ?`).run(d.id);
    ganarCoins(chat, usuario, d.monto, "banco_plazo_fijo_roto");
  })();
  const faltaban = Math.max(1, Math.ceil((d.vence - ahora) / DIA_MS));
  return { ok: true, mensaje: `💔 Rompiste el plazo fijo: te vuelven los *${d.monto}* que pusiste y perdés los ${d.interes} de interés. Faltaban ${plural(faltaban, "día", "días")}. El cajero ni te miró.` };
}

// The deposits whose term is up: the money and its interest back to the pocket. Returns [{ usuario, monto, interes }].
function pagarDepositos(chat, ahora) {
  const vencidos = db.prepare(`SELECT * FROM banco_depositos WHERE chat = ? AND estado = 'abierto' AND vence <= ?`).all(chat, ahora);
  return vencidos.map((d) => {
    db.transaction(() => {
      db.prepare(`UPDATE banco_depositos SET estado = 'cobrado' WHERE id = ?`).run(d.id);
      ganarCoins(chat, d.usuario, d.monto, "banco_plazo_fijo_vence");
      ganarCoins(chat, d.usuario, d.interes, "banco_interes");
      sumarAlBanco(chat, "intereses", d.interes);
    })();
    return { usuario: d.usuario, monto: d.monto, interes: d.interes };
  });
}

// ---------- the bank's loans ----------
const prestamoDe = (chat, usuario) => db.prepare(`SELECT * FROM banco_prestamos WHERE chat = ? AND deudor = ? AND acreedor = '' AND estado = 'activo'`).get(chat, usuario) || null;

// What someone owns, as the bank counts it: their company's goods, their house and car (what each step cost), and
// their deposits.
export function patrimonioDe(chat, usuario) {
  const empresa = empresaDe(chat, usuario);
  const escalones = ["casa", "auto"].reduce((s, k) => s + (escalonDe(chat, usuario, k)?.precio || 0), 0);
  const depositos = depositosDe(chat, usuario).reduce((s, d) => s + d.monto, 0);
  return (empresa ? valorDeBienes(empresa) : 0) + escalones + depositos;
}

// How much the bank would lend someone today, and why: { limite, nivel, patrimonio, limpios, calificacion, motivo }.
// motivo is what to tell them when the answer is nothing.
export function limiteDe(chat, usuario, ahora = Date.now()) {
  const calificacion = calificacionDe(chat, usuario, ahora);
  const nivel = nivelDeOficio(chat, usuario);
  const patrimonio = patrimonioDe(chat, usuario);
  const limpios = Math.min(BANCO.HISTORIAL_MAX, filaCliente(chat, usuario)?.limpios || 0);
  const base = { nivel, patrimonio, limpios, calificacion, limite: 0 };
  if (calificacion === "moroso") return { ...base, motivo: "Estás en el clearing como moroso: el banco no te presta ni la lapicera. Pagá lo que debés y esperá a que se te limpie el nombre." };
  if (!nivel) return { ...base, motivo: "El banco le presta a gente con laburo. Agarrá un oficio con .laburos y volvé con unos recibos de sueldo." };
  if (nivel < BANCO.NIVEL_MIN) return { ...base, motivo: `El banco presta desde el nivel ${BANCO.NIVEL_MIN} del oficio y vos vas por el ${nivel}. Seguí con .cobrar: la antigüedad es lo único que le importa al gerente.` };
  const bruto = (nivel * BANCO.LIMITE_POR_NIVEL + patrimonio * BANCO.PATRIMONIO_PARTE) * (1 + limpios * BANCO.HISTORIAL_BONUS) * (calificacion === "atrasado" ? BANCO.ATRASADO_LIMITE : 1);
  return { ...base, limite: Math.min(BANCO.LIMITE_MAX, Math.floor(bruto / 10) * 10) };
}

// What a loan of that much, in that many weekly instalments, comes to at that rate: { interes, total, cuota }.
export function cuentaDelPrestamo(monto, semanas, tna) {
  const interes = Math.max(1, Math.ceil((monto * tna * semanas * BANCO.CUOTA_DIAS) / 36500));
  const total = monto + interes;
  return { interes, total, cuota: Math.ceil(total / semanas) };
}

// .prestamo alone: what the bank would lend you, and at how much.
export function textoCondiciones(chat, usuario, ahora = Date.now()) {
  if (!puebloActivo(chat)) return SIN_BANCO;
  const p = prestamoDe(chat, usuario);
  if (p) return `💳 Ya le debés ${p.saldo} al banco (cuota de ${p.cuota} ${dia(p.proxima, ahora)}). De a un préstamo: cuando lo termines, pedí otro. Se adelanta con .pagar`;
  const l = limiteDe(chat, usuario, ahora);
  if (!l.limite) return `💳 ${l.motivo}`;
  const tna = tasaPrestamo(chat, usuario, ahora);
  const ejemplo = cuentaDelPrestamo(Math.min(l.limite, 500), 4, tna);
  const porque = [`nivel ${l.nivel} de tu oficio`, l.patrimonio ? `${l.patrimonio} en bienes y plazos fijos` : "", l.limpios ? `${plural(l.limpios, "préstamo pagado", "préstamos pagados")} sin atrasos` : "", l.calificacion === "atrasado" ? "la mitad, por atrasado" : ""].filter(Boolean).join(", ");
  return `💳 Hoy el banco te presta hasta *${l.limite} UruCoins*, al *${tna} % anual* (por ${porque}). En cuotas semanales, de 1 a ${BANCO.SEMANAS_MAX}, que se descuentan solas de donde fue la plata.\nPor ejemplo, ${Math.min(l.limite, 500)} en 4 cuotas: 4 de ${ejemplo.cuota} (${ejemplo.interes} de interés).\n_.prestamo 500 4 al bolsillo · .prestamo 500 4 caja a la caja de tu empresa_`;
}

// .prestamo <amount> <weeks> [caja]: the money comes now, to the pocket or to their company's caja, and goes back in
// weekly instalments the bank takes on its own from where it went (and from the other place, if that one's empty).
export function pedirPrestamo(chat, usuario, monto, semanas, destino = "bolsillo", ahora = Date.now()) {
  if (!puebloActivo(chat)) return { ok: false, error: SIN_BANCO };
  if (!Number.isInteger(monto) || !Number.isInteger(semanas)) return { ok: false, error: "Un préstamo se pide así: .prestamo 500 4 (el monto y en cuántas cuotas semanales). Con .prestamo solo te digo cuánto te presto." };
  if (prestamoDe(chat, usuario)) return { ok: false, error: "Ya tenés un préstamo del banco: de a uno. Se adelanta con .pagar y se mira en .banco" };
  const l = limiteDe(chat, usuario, ahora);
  if (!l.limite) return { ok: false, error: l.motivo };
  if (semanas < 1 || semanas > BANCO.SEMANAS_MAX) return { ok: false, error: `Las cuotas son semanales, de 1 a ${BANCO.SEMANAS_MAX}.` };
  if (monto < BANCO.PRESTAMO_MIN) return { ok: false, error: `El banco no mueve un papel por menos de ${BANCO.PRESTAMO_MIN} UruCoins.` };
  if (monto > l.limite) return { ok: false, error: `Hoy el banco te presta hasta *${l.limite}*. Sube con el nivel de tu oficio, con lo que tengas (bienes, casa, auto, plazos fijos) y pagando en fecha.` };
  const aCaja = destino === "caja";
  const empresa = aCaja ? cajaDe(chat, usuario) : null;
  if (aCaja && !empresa) return { ok: false, error: "Para que el préstamo vaya a la caja hay que tener empresa. Sin eso, va al bolsillo: .prestamo 500 4" };
  const tna = tasaPrestamo(chat, usuario, ahora);
  const { interes, total, cuota } = cuentaDelPrestamo(monto, semanas, tna);
  const proxima = ahora + BANCO.CUOTA_DIAS * DIA_MS;
  db.transaction(() => {
    db.prepare(`INSERT INTO banco_prestamos (chat, deudor, monto, total, saldo, cuota, cuotas, destino, tna, dias, proxima, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(chat, usuario, monto, total, total, cuota, semanas, aCaja ? "caja" : "bolsillo", tna, semanas * BANCO.CUOTA_DIAS, proxima, ahora);
    if (aCaja) db.prepare(`UPDATE empresas SET caja = caja + ? WHERE id = ?`).run(monto, empresa.id);
    else ganarCoins(chat, usuario, monto, "banco_prestamo");
    estadoBanco(chat);
    sumarAlBanco(chat, "prestado", monto);
  })();
  registrarHecho(chat, "prestamo", { usuario, monto, semanas }, ahora);
  const donde = aCaja ? `la caja de *${empresa.nombre}*` : "tu bolsillo";
  return { ok: true, mensaje: `💳 Préstamo aprobado: *${monto} UruCoins* a ${donde}, al ${tna} % anual. Devolvés *${total}* (${interes} de interés) en ${plural(semanas, "cuota semanal", "cuotas semanales")} de ${cuota}: la primera ${dia(proxima, ahora)}, y se descuenta sola de ${aCaja ? "la caja" : "tu bolsillo"}.\n_Si no hay plata ese día: recargo y al clearing; con ${BANCO.FALLAS_EMBARGO} cuotas seguidas sin pagar, embargo y remate._` };
}

// A payment taken into a loan: lowers what's owed, and the overdue part first. Closes it at zero. For the bank's own it
// counts as collected, and a clean one adds to the person's record.
function aplicarPago(p, pagado, ahora) {
  if (pagado <= 0) return p;
  p.saldo = Math.max(0, p.saldo - pagado);
  p.vencido = Math.max(0, Math.min(p.saldo, p.vencido - pagado));
  if (p.vencido === 0) p.fallas = 0;
  if (p.saldo === 0) p.estado = "pagado";
  db.prepare(`UPDATE banco_prestamos SET saldo = ?, vencido = ?, fallas = ?, estado = ? WHERE id = ?`).run(p.saldo, p.vencido, p.fallas, p.estado, p.id);
  if (!p.acreedor) {
    sumarAlBanco(p.chat, "cobrado", pagado);
    if (p.estado === "pagado" && !p.manchado) sumarLimpio(p.chat, p.deudor);
  }
  revisarMancha(p.chat, p.deudor, ahora);
  return p;
}

// Takes up to that much for a loan, from where its instalments come from and then the other place. A contract
// between people is paid from the pocket only, to the lender's. Returns what it took.
function cobrarDe(p, hasta) {
  if (p.acreedor) {
    const n = sacarDeBolsillo(p.chat, p.deudor, hasta, "prestamo_pago");
    if (n > 0) ganarCoins(p.chat, p.acreedor, n, "prestamo_cobro");
    return n;
  }
  const fuentes = p.destino === "caja" ? ["caja", "bolsillo"] : ["bolsillo", "caja"];
  let tomado = 0;
  for (const fuente of fuentes) {
    if (tomado >= hasta) break;
    tomado += fuente === "caja" ? sacarDeCaja(p.chat, p.deudor, hasta - tomado) : sacarDeBolsillo(p.chat, p.deudor, hasta - tomado, p.embargado ? "banco_embargo" : "banco_cuota");
  }
  return tomado;
}

// .pagar [amount | todo]: money ahead of time into the bank's loan.
export function pagarPrestamo(chat, usuario, monto = null, ahora = Date.now()) {
  if (!puebloActivo(chat)) return { ok: false, error: SIN_BANCO };
  const p = prestamoDe(chat, usuario);
  if (!p) return { ok: false, error: "No le debés nada al banco. Lo que le debas a alguien se paga con .pagar @persona" };
  if (monto !== null && !(monto > 0)) return { ok: false, error: "Decime cuánto: .pagar 200, o .pagar todo" };
  const pagado = db.transaction(() => {
    const n = cobrarDe(p, Math.min(monto ?? p.saldo, p.saldo));
    aplicarPago(p, n, ahora);
    return n;
  })();
  if (!pagado) return { ok: false, error: "No tenés plata ni en el bolsillo ni en la caja para pagar." };
  if (p.estado === "pagado") return { ok: true, mensaje: `✅ Pagaste ${pagado} y cancelaste el préstamo. ${p.manchado ? "Quedó anotado que hubo atrasos: el nombre se te limpia con los días." : "Sin un solo atraso: el banco te sube el límite para la próxima."}` };
  return { ok: true, mensaje: `💳 Pagaste ${pagado}. Le debés ${p.saldo} al banco${p.vencido ? `, ${p.vencido} de eso vencido` : ""}; la próxima cuota es ${dia(p.proxima, ahora)}.` };
}

// ---------- loans between people ----------
const ofertasPara = (chat, usuario, ahora) => db.prepare(`SELECT * FROM banco_prestamos WHERE chat = ? AND deudor = ? AND acreedor != '' AND estado = 'oferta' AND proxima > ? ORDER BY id ASC`).all(chat, usuario, ahora);
export const contratosDe = (chat, usuario) => db.prepare(`SELECT * FROM banco_prestamos WHERE chat = ? AND acreedor != '' AND estado = 'activo' AND (deudor = ? OR acreedor = ?) ORDER BY proxima ASC`).all(chat, usuario, usuario);

// .prestar @persona <amount> <interest %> <days>: an offer, for the other one to sign. The money moves when they do.
// While it's an offer, proxima is when it lapses.
export function ofrecerPrestamo(chat, de, para, monto, interes, dias, ahora = Date.now()) {
  if (!puebloActivo(chat)) return { ok: false, error: SIN_BANCO };
  const uso = `Se presta así: .prestar @persona 200 10 14 (le prestás 200, te devuelve 10 % más, a los 14 días). Interés de 0 a ${BANCO.P2P_INTERES_MAX} %, plazo de 1 a ${BANCO.P2P_DIAS_MAX} días. El contrato lo guardo yo y lo cobro yo.`;
  if (!para || ![monto, interes, dias].every(Number.isInteger)) return { ok: false, error: uso };
  if (para === de) return { ok: false, error: "Prestarte a vos mismo es cambiar la plata de bolsillo." };
  if (monto < BANCO.P2P_MIN || monto > BANCO.P2P_MAX) return { ok: false, error: `Entre vecinos se presta de ${BANCO.P2P_MIN} a ${BANCO.P2P_MAX} UruCoins.` };
  if (interes < 0 || interes > BANCO.P2P_INTERES_MAX) return { ok: false, error: `El interés va de 0 a ${BANCO.P2P_INTERES_MAX} % sobre lo prestado. Más que eso ya es cosa de ${npc(chat, "usurero") || "el usurero"}, y ese no firma contratos.` };
  if (dias < 1 || dias > BANCO.P2P_DIAS_MAX) return { ok: false, error: `El plazo va de 1 a ${BANCO.P2P_DIAS_MAX} días.` };
  if (esMoroso(chat, de, ahora)) return { ok: false, error: "Estás en el clearing como moroso: antes de prestar, pagá lo tuyo." };
  if (esMoroso(chat, para, ahora)) return { ok: false, error: `${nombreDe(para)} está en el clearing como moroso. El contrato no lo registro: si igual le querés dar plata, es un regalo (.regalar).` };
  if (getSaldoCoins(chat, de) < monto) return { ok: false, error: `Para prestar ${monto} hay que tenerlos, y tenés ${getSaldoCoins(chat, de)}.` };
  const total = monto + Math.ceil((monto * interes) / 100);
  db.prepare(`DELETE FROM banco_prestamos WHERE chat = ? AND deudor = ? AND acreedor = ? AND estado = 'oferta'`).run(chat, para, de);
  db.prepare(`INSERT INTO banco_prestamos (chat, deudor, acreedor, monto, total, saldo, cuota, cuotas, tna, dias, proxima, creado, estado) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'oferta')`).run(chat, para, de, monto, total, total, total, interes, dias, ahora + BANCO.P2P_OFERTA_HORAS * 60 * 60 * 1000, ahora);
  return {
    ok: true,
    mentions: [de, para],
    mensaje: `🤝 *Contrato a la firma*: ${arroba(de)} le presta *${monto} UruCoins* a ${arroba(para)}, que devuelve *${total}* a los ${plural(dias, "día", "días")}${interes ? ` (${interes} % de interés)` : " (sin interés: un amigo de verdad)"}.\n${arroba(para)}: .firmarprestamo para aceptarlo o .rechazarprestamo, dentro de ${BANCO.P2P_OFERTA_HORAS} horas. Al vencer lo cobro yo de tu bolsillo; si no hay, vas al clearing.`,
  };
}

// The offer someone answers: the one from that person, or the only one they have. { oferta } or { error }.
function ofertaElegida(chat, usuario, de, ahora) {
  const ofertas = ofertasPara(chat, usuario, ahora);
  if (!ofertas.length) return { error: "No tenés ningún contrato de préstamo esperando tu firma." };
  const oferta = de ? ofertas.find((o) => o.acreedor === de) : ofertas.length === 1 ? ofertas[0] : null;
  if (!oferta) return { error: de ? "Esa persona no te ofreció ningún préstamo." : `Tenés ${ofertas.length} contratos esperando: decime de quién, .firmarprestamo @persona (${ofertas.map((o) => `${nombreDe(o.acreedor)}: ${o.monto}`).join(", ")}).` };
  return { oferta };
}

// .firmarprestamo [@persona]: the borrower signs, and the money moves.
export function firmarPrestamo(chat, usuario, de = null, ahora = Date.now()) {
  if (!puebloActivo(chat)) return { ok: false, error: SIN_BANCO };
  const { oferta, error } = ofertaElegida(chat, usuario, de, ahora);
  if (!oferta) return { ok: false, error };
  if (esMoroso(chat, usuario, ahora)) return { ok: false, error: "Estás en el clearing como moroso: no podés firmar contratos nuevos." };
  if (contratosDe(chat, usuario).filter((c) => c.deudor === usuario).length >= BANCO.P2P_ABIERTOS) return { ok: false, error: `Ya debés ${BANCO.P2P_ABIERTOS} contratos a la vez, que es el máximo. Pagá alguno (.pagar @persona).` };
  const vence = ahora + oferta.dias * DIA_MS;
  const hecho = db.transaction(() => {
    if (!gastarCoins(chat, oferta.acreedor, oferta.monto, "prestamo_dado")) return false;
    ganarCoins(chat, usuario, oferta.monto, "prestamo_recibido");
    db.prepare(`UPDATE banco_prestamos SET estado = 'activo', proxima = ?, creado = ? WHERE id = ?`).run(vence, ahora, oferta.id);
    return true;
  })();
  if (!hecho) {
    db.prepare(`DELETE FROM banco_prestamos WHERE id = ?`).run(oferta.id);
    return { ok: false, error: `${nombreDe(oferta.acreedor)} ya no tiene los ${oferta.monto} que te ofrecía. Contrato roto antes de nacer.` };
  }
  return { ok: true, mentions: [usuario, oferta.acreedor], mensaje: `✍️ Firmado. ${arroba(oferta.acreedor)} le prestó *${oferta.monto} UruCoins* a ${arroba(usuario)}, que le devuelve *${oferta.total}* ${dia(vence, ahora)}. Queda registrado en ${MUNDO.BANCO_CORTO}: ese día lo cobro yo, sola.` };
}

// .rechazarprestamo [@persona]
export function rechazarPrestamo(chat, usuario, de = null, ahora = Date.now()) {
  const { oferta, error } = ofertaElegida(chat, usuario, de, ahora);
  if (!oferta) return { ok: false, error };
  db.prepare(`DELETE FROM banco_prestamos WHERE id = ?`).run(oferta.id);
  return { ok: true, mentions: [oferta.acreedor], mensaje: `🙅 Contrato rechazado: ${arroba(oferta.acreedor)}, tu plata se queda en tu bolsillo.` };
}

// .pagar @persona [amount]: paying a contract before its date (or one that's overdue).
export function pagarAPersona(chat, usuario, acreedor, monto = null, ahora = Date.now()) {
  if (!puebloActivo(chat)) return { ok: false, error: SIN_BANCO };
  const p = db.prepare(`SELECT * FROM banco_prestamos WHERE chat = ? AND deudor = ? AND acreedor = ? AND estado = 'activo' ORDER BY proxima ASC LIMIT 1`).get(chat, usuario, acreedor);
  if (!p) return { ok: false, error: `No tenés ningún contrato de préstamo con ${nombreDe(acreedor)}.` };
  if (monto !== null && !(monto > 0)) return { ok: false, error: "Decime cuánto: .pagar @persona 100, o .pagar @persona para pagarlo entero" };
  const pagado = db.transaction(() => {
    const n = cobrarDe(p, Math.min(monto ?? p.saldo, p.saldo));
    aplicarPago(p, n, ahora);
    return n;
  })();
  if (!pagado) return { ok: false, error: "No tenés plata en el bolsillo para pagarle." };
  return { ok: true, mentions: [acreedor], mensaje: p.estado === "pagado" ? `✅ Le pagaste ${pagado} a ${arroba(acreedor)} y el contrato queda cancelado. Así da gusto.` : `🤝 Le pagaste ${pagado} a ${arroba(acreedor)}. Todavía le debés ${p.saldo}, para ${dia(p.proxima, ahora)}.` };
}

// ---------- the seizure and the auction ----------
// What could be seized from someone, each with what it's worth: their company's goods (all but the last one to work
// with) and the top step of their car and of their house.
function embargables(chat, usuario) {
  const lista = [];
  const empresa = empresaDe(chat, usuario);
  if (empresa) for (const b of bienesEmbargables(empresa)) lista.push({ origen: "empresa", clave: b.bien, ref: { id: b.id, tipo: empresa.tipo, estado: b.estado, roto: b.roto }, nombre: `${b.def.emoji} ${b.def.nombre} de ${empresa.nombre}`, valor: valorDeBien(b) });
  for (const k of ["auto", "casa"]) {
    const e = escalonDe(chat, usuario, k);
    if (e) lista.push({ origen: "tienda", clave: k, ref: { nivel: e.nivel }, nombre: `${e.emoji} ${e.nombre}`, valor: e.precio });
  }
  return lista;
}

// Which one: the cheapest whose floor price covers the debt, or else the dearest.
function elegirEmbargo(lista, deuda) {
  const ordenados = [...lista].sort((a, b) => a.valor - b.valor);
  return ordenados.find((x) => x.valor * BANCO.REMATE_BASE >= deuda) || ordenados.at(-1) || null;
}

// Takes the good away from its owner, for the auction.
function sacarBien(chat, usuario, b) {
  if (b.origen === "empresa") return quitarBien(b.ref.id);
  const nivel = b.ref.nivel;
  fijarEscalon(chat, usuario, b.clave, nivel - 1);
  return true;
}

// FALLAS_EMBARGO instalments missed in a row: the whole debt is due now and the person is moroso. The bank breaks
// their deposits (no interest) into it, and seizes a good, which goes up for auction in the group. Returns the lines
// for the group.
function embargar(p, ahora) {
  const lineas = [];
  manchar(p.chat, p.deudor, "moroso");
  p.vencido = p.saldo;
  p.embargado = 1;
  db.prepare(`UPDATE banco_prestamos SET vencido = ?, embargado = 1 WHERE id = ?`).run(p.vencido, p.id);
  let deDepositos = 0;
  for (const d of depositosDe(p.chat, p.deudor)) {
    if (p.saldo <= 0) break;
    const tomado = Math.min(d.monto, p.saldo);
    db.prepare(`UPDATE banco_depositos SET estado = 'embargado' WHERE id = ?`).run(d.id);
    if (d.monto > tomado) ganarCoins(p.chat, p.deudor, d.monto - tomado, "banco_plazo_fijo_roto");
    aplicarPago(p, tomado, ahora);
    deDepositos += tomado;
  }
  lineas.push(`🚨 *EMBARGO*: ${arroba(p.deudor)} no pagó ${plural(BANCO.FALLAS_EMBARGO, "cuota", "cuotas")} seguidas y entra al clearing como *moroso*. ${deDepositos ? `El banco le rompió los plazos fijos y se cobró ${deDepositos}. ` : ""}${p.saldo ? `Debe ${p.saldo}.` : "Con eso quedó saldado."}`);
  registrarHecho(p.chat, "moroso", { usuario: p.deudor, deuda: p.saldo, acreedor: "" }, ahora);
  recordar(p.chat, "usurero", p.deudor, "lo embargó el banco", ahora);
  if (p.saldo > 0) {
    const bien = elegirEmbargo(embargables(p.chat, p.deudor), p.saldo);
    if (bien && sacarBien(p.chat, p.deudor, bien)) {
      const base = Math.max(10, Math.ceil(bien.valor * BANCO.REMATE_BASE));
      const cierra = ahora + BANCO.REMATE_HORAS * 60 * 60 * 1000;
      const id = Number(db.prepare(`INSERT INTO banco_remates (chat, prestamo, deudor, origen, clave, ref, nombre, valor, base, cierra) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(p.chat, p.id, p.deudor, bien.origen, bien.clave, JSON.stringify(bien.ref), bien.nombre, bien.valor, base, cierra).lastInsertRowid);
      crearPendiente(p.chat, "bot", "banco_remate", { id }, cierra);
      lineas.push(`🔨 *REMATE N° ${id}*: el banco le embargó ${bien.nombre} (vale ${bien.valor}) y lo remata acá. Base: *${base}*. Se ofrece con .ofertar ${base} y cierra ${dia(cierra, ahora)} a esta hora; si nadie lo quiere, va al chatarrero por ${Math.ceil(bien.valor * BANCO.REMATE_CHATARRA)}.`);
    } else lineas.push(`No tiene nada para embargarle: el banco le va a ir descontando de lo que cobre.`);
  }
  return lineas;
}

const remate = (id) => db.prepare(`SELECT * FROM banco_remates WHERE id = ?`).get(id) || null;
export const rematesAbiertos = (chat) => db.prepare(`SELECT * FROM banco_remates WHERE chat = ? AND estado = 'abierto' ORDER BY id ASC`).all(chat);
const mejorPuja = (id) => db.prepare(`SELECT * FROM banco_pujas WHERE remate = ? ORDER BY monto DESC, fecha ASC LIMIT 1`).get(id) || null;
const leerRef = (r) => {
  try {
    return JSON.parse(r.ref || "{}");
  } catch {
    return {};
  }
};

// Whether someone can take an auctioned good: "" if so, or why not. A company's good goes to a company of its rubro
// with room for it; a house or a car, to someone whose own is a lower step.
function sinLugar(chat, usuario, r) {
  const ref = leerRef(r);
  if (r.origen === "empresa") {
    const e = empresaDe(chat, usuario);
    if (!e || e.tipo !== ref.tipo) return `es para una empresa de ${EMPRESAS[ref.tipo]?.nombre.toLowerCase() || "ese rubro"}, y vos no tenés.`;
    return sinLugarParaBien(e, r.clave);
  }
  const propio = escalonDe(chat, usuario, r.clave);
  if (propio && propio.nivel >= ref.nivel) return `ya tenés ${r.clave === "casa" ? "una casa" : "un auto"} igual o mejor.`;
  return "";
}

// .ofertar [number] <amount>: a bid. The money is taken when it closes, from whoever bid the most and can pay.
export function ofertar(chat, usuario, monto, numero = null, ahora = Date.now()) {
  if (!puebloActivo(chat)) return { ok: false, error: SIN_BANCO };
  const abiertos = rematesAbiertos(chat);
  if (!abiertos.length) return { ok: false, error: "No hay ningún remate abierto. Cuando el banco embarga algo, lo remato acá." };
  const r = numero ? abiertos.find((x) => x.id === numero) : abiertos.length === 1 ? abiertos[0] : null;
  if (!r) return { ok: false, error: `Hay ${abiertos.length} remates: decime cuál, .ofertar ${abiertos[0].id} ${abiertos[0].base} (${abiertos.map((x) => `N° ${x.id}: ${x.nombre}`).join(", ")}).` };
  if (!Number.isInteger(monto) || monto <= 0) return { ok: false, error: `Decime cuánto: .ofertar ${r.base}` };
  if (usuario === r.deudor) return { ok: false, error: "Comprarte lo tuyo en tu propio remate no se puede. Haberlo pagado." };
  const traba = sinLugar(chat, usuario, r);
  if (traba) return { ok: false, error: `No podés ofertar: ${traba}` };
  const mejor = mejorPuja(r.id);
  const minimo = mejor ? mejor.monto + BANCO.REMATE_SUBA : r.base;
  if (monto < minimo) return { ok: false, error: mejor ? `La mejor oferta es ${mejor.monto} (${nombreDe(mejor.usuario)}): hay que poner ${minimo} o más.` : `La base es ${r.base}.` };
  if (getSaldoCoins(chat, usuario) < monto) return { ok: false, error: `No tenés ${monto}: tenés ${getSaldoCoins(chat, usuario)}. Se paga al cierre, pero hay que tenerlo.` };
  db.prepare(`INSERT INTO banco_pujas (remate, usuario, monto, fecha) VALUES (?, ?, ?, ?) ON CONFLICT(remate, usuario) DO UPDATE SET monto = excluded.monto, fecha = excluded.fecha`).run(r.id, usuario, monto, ahora);
  return { ok: true, mensaje: `🔨 Remate N° ${r.id}, ${r.nombre}: ${nombreDe(usuario)} ofrece *${monto}*. ¿Quién da más? Cierra ${dia(r.cierra, ahora)}.` };
}

// The auction closes (the pending work of lib/pendientes.js): the highest bid that can still pay takes it; with none,
// the scrap dealer. What's paid goes into the debt, and what's left over to its old owner. Returns { chat, texto,
// mentions } for the group, or null.
export function cerrarRemate(id, ahora = Date.now()) {
  const r = remate(id);
  if (!r || r.estado !== "abierto") return null;
  const p = db.prepare(`SELECT * FROM banco_prestamos WHERE id = ?`).get(r.prestamo);
  const pujas = db.prepare(`SELECT * FROM banco_pujas WHERE remate = ? ORDER BY monto DESC, fecha ASC`).all(id);
  const ref = leerRef(r);
  let ganador = null;
  db.transaction(() => {
    for (const puja of pujas) {
      if (sinLugar(r.chat, puja.usuario, r)) continue;
      if (!gastarCoins(r.chat, puja.usuario, puja.monto, "banco_remate_compra")) continue;
      ganador = puja;
      if (r.origen === "empresa") recibirBien(empresaDe(r.chat, puja.usuario), r.clave, { estado: ref.estado ?? 100, roto: ref.roto ?? 0 });
      else fijarEscalon(r.chat, puja.usuario, r.clave, ref.nivel);
      break;
    }
    const debe = p && p.estado === "activo";
    // Nobody wanted it and the debt was paid meanwhile: the good goes back to its owner.
    if (!ganador && !debe) {
      const empresa = r.origen === "empresa" ? empresaDe(r.chat, r.deudor) : null;
      if (empresa && !sinLugarParaBien(empresa, r.clave)) recibirBien(empresa, r.clave, { estado: ref.estado ?? 100, roto: ref.roto ?? 0 });
      if (r.origen === "tienda" && (escalonDe(r.chat, r.deudor, r.clave)?.nivel || 0) < ref.nivel) fijarEscalon(r.chat, r.deudor, r.clave, ref.nivel);
      db.prepare(`UPDATE banco_remates SET estado = 'devuelto' WHERE id = ?`).run(id);
      r.devuelto = true;
      return;
    }
    const precio = ganador ? ganador.monto : Math.ceil(r.valor * BANCO.REMATE_CHATARRA);
    const alaDeuda = debe ? Math.min(precio, p.saldo) : 0;
    if (alaDeuda > 0) aplicarPago(p, alaDeuda, ahora);
    // The scrap dealer pays the debt and no more: the money of a bid is a person's, so what's over goes to the owner.
    const sobra = ganador ? precio - alaDeuda : 0;
    if (sobra > 0) ganarCoins(r.chat, r.deudor, sobra, "banco_remate_sobrante");
    db.prepare(`UPDATE banco_remates SET estado = ?, comprador = ?, precio = ? WHERE id = ?`).run(ganador ? "vendido" : "chatarra", ganador?.usuario || "", alaDeuda + sobra, id);
    r.alaDeuda = alaDeuda;
    r.sobra = sobra;
    r.precio = precio;
  })();
  if (r.devuelto) return { chat: r.chat, texto: `🔨 El remate N° ${id} (${r.nombre}) cerró sin ofertas, y como ${arroba(r.deudor)} ya se puso al día, el banco se lo devuelve. Susto y nada más.`, mentions: [r.deudor] };
  registrarHecho(r.chat, "remate", { usuario: r.deudor, comprador: ganador?.usuario || "", nombre: r.nombre.replace(/^\S+\s/, ""), precio: r.precio }, ahora);
  const resto = p ? db.prepare(`SELECT saldo, estado FROM banco_prestamos WHERE id = ?`).get(p.id) : null;
  const deuda = resto?.estado === "activo" ? ` A ${arroba(r.deudor)} le quedan ${resto.saldo} de deuda.` : ` La deuda de ${arroba(r.deudor)} quedó saldada${r.sobra ? ` y le sobran ${r.sobra}` : ""}.`;
  const texto = ganador
    ? `🔨 *Vendido* el remate N° ${id}: ${r.nombre} para ${arroba(ganador.usuario)} por *${ganador.monto}*.${deuda}`
    : `🔨 El remate N° ${id} (${r.nombre}) cerró sin ofertas: se lo llevó el chatarrero por ${r.precio}.${deuda}`;
  return { chat: r.chat, texto, mentions: [r.deudor, ...(ganador ? [ganador.usuario] : [])] };
}

// .remate: the auctions open in the group.
export function textoRemates(chat, ahora = Date.now()) {
  const abiertos = rematesAbiertos(chat);
  if (!abiertos.length) return "🔨 No hay remates abiertos. Cuando el banco embarga algo por una deuda, lo remato acá.";
  return [
    "🔨 *Remates del banco*",
    ...abiertos.map((r) => {
      const mejor = mejorPuja(r.id);
      return `N° ${r.id}: ${r.nombre} (vale ${r.valor}) · base ${r.base} · ${mejor ? `va ganando ${nombreDe(mejor.usuario)} con ${mejor.monto}` : "sin ofertas"} · cierra ${dia(r.cierra, ahora)}`;
    }),
    `_.ofertar ${abiertos.length > 1 ? `${abiertos[0].id} ` : ""}${abiertos[0].base}: se paga al cierre, si ganás._`,
  ].join("\n");
}

// ---------- the collection ----------
// The surcharge of a miss, up to the cap of the debt.
function recargoDe(p, impago) {
  const tope = Math.ceil(p.total * BANCO.DEUDA_TOPE) - p.total - p.recargos;
  return Math.max(0, Math.min(Math.ceil(impago * BANCO.RECARGO), tope));
}

// What someone has to pay a loan with: a contract between people is paid from the pocket; the bank's, from the
// pocket and the company's caja.
const alcance = (p) => getSaldoCoins(p.chat, p.deudor) + (p.acreedor ? 0 : cajaDe(p.chat, p.deudor)?.caja || 0);

// The loans whose date has come, and (once a day, with diario) the ones with something overdue. At the bank's due
// date the instalment is taken whole if it's there; a miss is surcharged and stains the clearing, and at
// FALLAS_EMBARGO in a row the bank seizes. A contract between people is taken whole at its date; overdue, each day
// counts as a miss, COBRO_DIARIO of the pocket goes to the lender, and a week of it is "moroso". Between dates, what's
// overdue is taken from up to COBRO_DIARIO of what the person has. Returns the lines for the group and who they name.
function cobrarDeudas(chat, ahora, { diario = true } = {}) {
  const lineas = [];
  const mentions = [];
  const activos = db.prepare(`SELECT * FROM banco_prestamos WHERE chat = ? AND estado = 'activo' ORDER BY id ASC`).all(chat);
  for (const p of activos) {
    db.transaction(() => {
      if (p.proxima <= ahora) {
        const nueva = p.acreedor ? p.saldo - p.vencido : Math.min(p.cuota, p.saldo - p.vencido);
        p.vencido += Math.max(0, nueva);
        // Overdue already (a contract past its date, a seized debt): COBRO_DIARIO of what they have, not all of it.
        const parte = (p.acreedor || p.embargado) && p.fallas > 0 ? BANCO.COBRO_DIARIO : 1;
        const pagado = cobrarDe(p, Math.min(p.vencido, Math.floor(alcance(p) * parte) || (parte < 1 ? Math.min(1, alcance(p)) : 0)));
        aplicarPago(p, pagado, ahora);
        p.proxima += (p.acreedor ? 1 : BANCO.CUOTA_DIAS) * DIA_MS;
        if (p.estado === "activo" && p.vencido > 0) {
          const recargo = p.acreedor ? 0 : recargoDe(p, p.vencido);
          p.fallas += 1;
          p.manchado = 1;
          p.recargos += recargo;
          p.saldo += recargo;
          p.vencido += recargo;
          manchar(chat, p.deudor, "atrasado");
          if (p.acreedor) {
            if (p.fallas === 1) {
              lineas.push(`⚠️ Venció el préstamo de ${arroba(p.acreedor)} a ${arroba(p.deudor)} y no había con qué: ${pagado ? `cobré ${pagado} y ` : ""}quedan *${p.vencido}* impagos. ${arroba(p.deudor)} entra al clearing como atrasado, y lo voy cobrando de a poco de lo que tenga.`);
              mentions.push(p.deudor, p.acreedor);
            }
            if (p.fallas === BANCO.P2P_MOROSO_DIAS + 1) {
              manchar(chat, p.deudor, "moroso");
              registrarHecho(chat, "moroso", { usuario: p.deudor, deuda: p.saldo, acreedor: p.acreedor }, ahora);
              recordar(chat, "usurero", p.deudor, "no le devolvió a un vecino", ahora);
              lineas.push(`🚨 ${arroba(p.deudor)} lleva una semana sin devolverle a ${arroba(p.acreedor)}: pasa al clearing como *moroso*, y sale en el diario.`);
              mentions.push(p.deudor, p.acreedor);
            }
          } else if (p.fallas >= BANCO.FALLAS_EMBARGO && !p.embargado) {
            db.prepare(`UPDATE banco_prestamos SET fallas = ?, manchado = 1, recargos = ?, saldo = ?, vencido = ?, proxima = ? WHERE id = ?`).run(p.fallas, p.recargos, p.saldo, p.vencido, p.proxima, p.id);
            lineas.push(...embargar(p, ahora));
            mentions.push(p.deudor);
          } else if (!p.embargado) {
            lineas.push(`⚠️ ${arroba(p.deudor)}: no había para la cuota del banco${pagado ? ` (cobré ${pagado})` : ""}. Quedan *${p.vencido}* vencidos, con ${recargo} de recargo, y entrás al clearing como atrasado.${p.fallas + 1 >= BANCO.FALLAS_EMBARGO ? " Una más sin pagar y te embargan." : ""}`);
            mentions.push(p.deudor);
          }
        }
      } else if (p.vencido > 0 && diario) {
        const pagado = cobrarDe(p, Math.min(p.vencido, Math.floor(alcance(p) * BANCO.COBRO_DIARIO)));
        aplicarPago(p, pagado, ahora);
      }
      db.prepare(`UPDATE banco_prestamos SET fallas = ?, manchado = ?, recargos = ?, saldo = ?, vencido = ?, proxima = ?, estado = ? WHERE id = ?`).run(p.fallas, p.manchado, p.recargos, p.saldo, p.vencido, p.proxima, p.estado, p.id);
    })();
  }
  return { lineas, mentions };
}

// ---------- the bank's round ----------
// A town's bank, each time the scheduled tasks pass and the bank is open: the day's rate (once a day), the deposits
// whose term is up, the instalments and contracts whose date has come and what's overdue (once a day each). Returns
// { lineas, mentions } for the group, or null with the bank closed or nothing to tell.
export function rondaDelBanco(chat, ahora = Date.now()) {
  if (!puebloActivo(chat)) return null;
  const h = new Date(ahora).getHours();
  if (h < BANCO.DESDE_HORA || h >= BANCO.HASTA_HORA) return null;
  const e = estadoBanco(chat);
  const hoy = claveDia(new Date(ahora));
  const nuevoDia = e.dia !== hoy;
  const lineas = [];
  const mentions = [];
  if (nuevoDia) {
    lineas.push(...moverTasa(chat, ahora));
    const intendente = estadoDe(chat, ahora)?.intendente;
    if (intendente?.persona && lineas.some((l) => l.startsWith("💥"))) mentions.push(intendente.usuario);
  }
  const pagados = pagarDepositos(chat, ahora);
  if (pagados.length) {
    lineas.push(`💰 ${pagados.map((d) => `Venció el plazo fijo de ${arroba(d.usuario)}: le volvieron ${d.monto} más *${d.interes}* de interés.`).join(" ")}`);
    mentions.push(...pagados.map((d) => d.usuario));
  }
  // Once a day for what's overdue between dates; a due date is taken whenever it comes.
  const deudas = cobrarDeudas(chat, ahora, { diario: nuevoDia });
  lineas.push(...deudas.lineas);
  mentions.push(...deudas.mentions);
  return lineas.length ? { lineas, mentions: [...new Set(mentions)] } : null;
}

// Every 5 minutes from tareas-programadas.js: each town's bank round, and what it has to say goes to the group.
export async function chequearBanco(client, ahora = new Date()) {
  let enviados = 0;
  for (const chat of chatsConOpcion("pueblo")) {
    if (!puebloActivo(chat) || getChat(chat)?.grupoCerradoPorHorario) continue;
    const r = rondaDelBanco(chat, ahora.getTime());
    if (!r || !client) continue;
    await client.sendMessage(chat, { text: `🏦 *${MUNDO.BANCO}*\n${r.lineas.join("\n\n")}`, mentions: r.mentions });
    enviados++;
  }
  return enviados;
}

// ---------- the boards ----------
const lineaDeuda = (p, ahora) =>
  `${p.saldo} de ${p.total} · cuota de ${p.cuota} ${dia(p.proxima, ahora)} (de ${p.destino === "caja" ? "la caja" : "tu bolsillo"})${p.vencido ? ` · ⚠️ ${p.vencido} vencidos` : ""}`;

// .banco: the board, with the town's numbers and the person's.
export function textoBanco(chat, usuario, ahora = Date.now()) {
  if (!puebloActivo(chat)) return { texto: `🏦 ${SIN_BANCO}`, mentions: [] };
  const e = estadoBanco(chat);
  const p = estadoDe(chat, ahora);
  const tasa = tasaDe(chat, ahora);
  const mentions = [];
  const inflacion = e.inflacion === null ? "todavía la estamos midiendo" : `${e.inflacion > 0 ? "+" : ""}${e.inflacion} % en la semana`;
  const lineas = [`🏦 *${MUNDO.BANCO.toUpperCase()}* — sucursal ${p.nombre}`, `📈 Tasa de referencia: *${tasa} % anual* · inflación: ${inflacion}`];
  if (e.presion_hasta > ahora) lineas.push(`🏛️ ${e.presion < 0 ? "Rebajada" : "Subida"} ${Math.abs(e.presion)} puntos por presión del intendente, hasta ${dia(e.presion_hasta, ahora)}.`);
  if (e.rebote_hasta > ahora) lineas.push(`💥 La plaza se asustó: ${BANCO.REBOTE_PUNTOS} puntos más hasta ${dia(e.rebote_hasta, ahora)}.`);
  const eventos = eventosActivos(chat, ahora).filter((x) => x.def.tasa);
  if (eventos.length) lineas.push(`${eventos.map((x) => `${x.def.emoji} ${x.def.nombre}: ${x.def.tasa > 0 ? "+" : ""}${x.def.tasa} puntos`).join(" · ")}`);
  lineas.push(`💰 Plazo fijo (anual): ${textoPlazos(chat, ahora)}`, `💳 Préstamos: ${Math.round(tasa * BANCO.PRESTAMO_FACTOR)} % anual, en cuotas semanales`);

  lineas.push("", `*Lo tuyo* — calificación: ${CALIFICACION[calificacionDe(chat, usuario, ahora)]}`);
  const depositos = depositosDe(chat, usuario);
  for (const d of depositos) lineas.push(`💰 ${d.numero}) ${d.monto} a ${d.dias} días, al ${d.tna} % · vence ${dia(d.vence, ahora)} → ${d.monto + d.interes}`);
  const deuda = prestamoDe(chat, usuario);
  if (deuda) lineas.push(`💳 Al banco: ${lineaDeuda(deuda, ahora)}`);
  for (const c of contratosDe(chat, usuario)) {
    const debe = c.deudor === usuario;
    const otro = debe ? c.acreedor : c.deudor;
    lineas.push(`🤝 ${debe ? `Le debés a ${arroba(otro)}` : `${arroba(otro)} te debe`} ${c.saldo}${c.vencido ? ` (⚠️ vencido)` : `, ${dia(c.proxima, ahora)}`}`);
    mentions.push(otro);
  }
  for (const o of ofertasPara(chat, usuario, ahora)) {
    lineas.push(`✍️ ${arroba(o.acreedor)} te ofrece ${o.monto} (devolvés ${o.total} a ${plural(o.dias, "día", "días")}): .firmarprestamo`);
    mentions.push(o.acreedor);
  }
  if (!depositos.length && !deuda && lineas.at(-1).startsWith("*Lo tuyo*")) {
    const l = limiteDe(chat, usuario, ahora);
    lineas.push(l.limite ? `Sin plazos fijos ni deudas. Hoy te presto hasta ${l.limite}.` : "Sin plazos fijos ni deudas.");
  }
  const remates = rematesAbiertos(chat).length;
  if (remates) lineas.push("", `🔨 Hay ${plural(remates, "remate abierto", "remates abiertos")}: .remate`);
  lineas.push("", "_.plazofijo 500 90 · .romperplazo 1 · .prestamo (cuánto te presto) · .prestamo 500 4 [caja] · .pagar 100 · .prestar @persona 200 10 14 · .clearing · .remate_");
  return { texto: lineas.join("\n"), mentions: [...new Set(mentions)] };
}

// .clearing: who's in the town's clearing.
export function textoClearing(chat, ahora = Date.now()) {
  if (!puebloActivo(chat)) return { texto: `🏦 ${SIN_BANCO}`, mentions: [] };
  const lista = enElClearing(chat, ahora);
  if (!lista.length) return { texto: `📋 *Clearing de ${estadoDe(chat, ahora).nombre}*: limpito. Nadie debe nada fuera de fecha. ${mayuscula(npc(chat, "usurero"))} anda aburrido.`, mentions: [] };
  return {
    texto: [`📋 *Clearing de ${estadoDe(chat, ahora).nombre}*`, ...lista.map((r) => `${r.estado === "moroso" ? "🚨" : "⚠️"} ${nombreDe(r.usuario)}: ${CALIFICACION[r.estado]}`), "_Atrasado: una cuota o un préstamo sin pagar a tiempo. Moroso: embargado, o una semana sin devolverle a un vecino. Se limpia unos días después de ponerse al día._"].join("\n"),
    mentions: [],
  };
}

// The bank's line on the town's board (.pueblo), or "".
export function lineaBancoPueblo(chat, ahora = Date.now()) {
  if (!puebloActivo(chat)) return "";
  const e = estadoBanco(chat);
  const morosos = enElClearing(chat, ahora).filter((r) => r.estado === "moroso").length;
  return `🏦 ${mayuscula(MUNDO.BANCO_CORTO)}: tasa ${tasaDe(chat, ahora)} % anual${e.inflacion === null ? "" : ` · inflación ${e.inflacion > 0 ? "+" : ""}${e.inflacion} % semanal`}${morosos ? ` · ${plural(morosos, "moroso", "morosos")} en el clearing` : ""} (.banco)`;
}

// For Claudia's prompt, when the talk is about the town or money: the bank's numbers and the person's standing. ""
// with the town off.
export function bancoParaPrompt(chat, usuario = "", ahora = Date.now()) {
  if (!puebloActivo(chat)) return "";
  const e = estadoBanco(chat);
  const partes = [`${MUNDO.BANCO} del pueblo: tasa de referencia ${tasaDe(chat, ahora)} % anual${e.inflacion === null ? "" : `, inflación de la semana ${e.inflacion} %`}; plazo fijo ${textoPlazos(chat, ahora)}; préstamos al ${Math.round(tasaDe(chat, ahora) * BANCO.PRESTAMO_FACTOR)} % anual.`];
  if (usuario) {
    const cal = calificacionDe(chat, usuario, ahora);
    const deuda = prestamoDe(chat, usuario);
    if (cal !== "al_dia" || deuda) partes.push(`${nombreDe(usuario) || "Quien escribe"} está ${cal === "al_dia" ? "al día" : cal} en el clearing${deuda ? ` y le debe ${deuda.saldo} al banco` : ""}.`);
  }
  const morosos = enElClearing(chat, ahora).filter((r) => r.estado === "moroso");
  if (morosos.length) partes.push(`En el clearing como morosos: ${morosos.map((r) => nombreDe(r.usuario)).join(", ")}.`);
  return partes.join(" ");
}
