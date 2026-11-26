// "Modo patrón": whoever reaches the top level of a trade (lib/laburos.js) can found that trade's company. A company
// has its own cash box (the caja, apart from its owner's pocket), goods that are bought, wear out with use and need a
// service, and a category that rises with what it has billed and opens more posts and bigger goods.
// For now only three trades have one: camionero (Transportista), tambero (Tambo) and dj (Boliche).
// Every number is in EMPRESA, CATEGORIAS and EMPRESAS, to tune them in one place. The tables are in database-schema.js.
import { randomInt } from "crypto";
import { ganarCoins, gastarCoins, getSaldoCoins, db } from "../database-functions.js";
import { LABURO, OFICIOS, laburoDe, nivelDe, factorNivel, nombreDeOficio } from "./laburos.js";
import { generoDe } from "./genero.js";
import { nombreDe } from "./menciones.js";

export const EMPRESA = {
  NIVEL_FUNDAR: LABURO.NIVEL_MAX, // the level of the trade it takes to found its company
  COSTO_FUNDAR: 1500, // paid from the pocket; it comes with the starting good
  NOMBRE_MAX: 40,
  // Wear: each shift takes DESGASTE_USO points off a good's condition (100 = new). Under SERVICE_ATRASADO the service
  // is overdue and each use has ROTURA_CHANCE % of breaking it: that day it bills nothing, and fixing it costs
  // ROTO_RECARGO times the service. At 0 it breaks for sure.
  DESGASTE_USO: 4,
  SERVICE_ATRASADO: 30,
  ROTURA_CHANCE: 25,
  SERVICE_COSTO: 0.12, // a full service (from 0 to 100) costs this share of the good's price; less wear, less cost
  ROTO_RECARGO: 2,
  MEJORA_DESGASTE: 0.75, // the wear with the company's shed (or whatever its "desgaste" upgrade is)
  MEJORA_INGRESOS: 0.1, // what its "ingresos" upgrade adds to everything it bills
  SIN_BIEN: 10, // what a shift bills with no good free to work with (odd jobs)
  // Taking money out of the caja to the pocket pays this tax (the DGI's); putting money in is free.
  IMPUESTO_RETIRO: 0.2,
  NOVEDADES_MAX: 8, // news lines kept for the owner
};

// By what the company has billed since it was founded. Each category opens more posts, and the goods say which
// category they ask for. A company can own one good more than it has posts: the owner works with one.
export const CATEGORIAS = [
  { nombre: "Changarín", desde: 0, puestos: 2 },
  { nombre: "PyME", desde: 2000, puestos: 4 },
  { nombre: "Empresa", desde: 10000, puestos: 7 },
  { nombre: "Grupo empresarial", desde: 40000, puestos: 12 },
];

// The companies, by the trade they come from. A good with "rinde" is worked with, one shift a day, and bills that
// much at level 1; one with "mejora" is an upgrade (one of each, and it doesn't wear): "desgaste" slows the wear of the
// rest and "ingresos" raises what the company bills. "categoria" is the index in CATEGORIAS it asks for.
// "hecho" is what a shift with a good was, and "roto" how it broke down.
export const EMPRESAS = {
  camionero: {
    nombre: "Transportista", emoji: "🚛", inicial: "camion",
    bienes: {
      camion: { nombre: "Camión chico", emoji: "🛻", precio: 900, rinde: 60, categoria: 0, desc: "Un 608 con más kilómetros que la ruta 5. Pero es tuyo." },
      semi: { nombre: "Semirremolque", emoji: "🚛", precio: 2200, rinde: 110, categoria: 1, alias: ["semirremolque", "zorra"], desc: "Ya entrás a los puertos por la puerta grande." },
      bitren: { nombre: "Bitren", emoji: "🚚", precio: 4500, rinde: 190, categoria: 2, desc: "Treinta metros de camión. Doblar en Young es un arte." },
      galpon: { nombre: "Galpón", emoji: "🏚️", precio: 1500, mejora: "desgaste", categoria: 1, desc: "Los fierros bajo techo se gastan menos." },
    },
    hecho: ["hizo un flete de soja a Nueva Palmira", "llevó ganado a Tablada", "cruzó a Rivera con carga completa", "hizo un reparto por todo Durazno", "llevó rolos a la pastera"],
    sinBien: "No había camión libre: hizo un par de mandados en la camioneta",
    roto: "se quedó tirado en la ruta 3, con el service vencido",
  },
  tambero: {
    nombre: "Tambo", emoji: "🐄", inicial: "vacas",
    bienes: {
      vacas: { nombre: "Lote de Holando", emoji: "🐄", precio: 800, rinde: 55, categoria: 0, alias: ["lote", "holando", "vaca"], desc: "Diez vacas que te miran con desprecio a las 5 de la mañana." },
      ordenadora: { nombre: "Ordeñadora", emoji: "🥛", precio: 2000, rinde: 105, categoria: 1, alias: ["ordeniadora"], desc: "Se acabó el ordeñe a mano y el reuma." },
      sala: { nombre: "Sala de ordeñe", emoji: "🏭", precio: 4200, rinde: 180, categoria: 2, alias: ["saladeordene"], desc: "Espina de pescado, doce bajadas. Conaprole te saluda por el nombre." },
      tanque: { nombre: "Tanque de frío", emoji: "🧊", precio: 1400, mejora: "ingresos", categoria: 1, alias: ["tanquedefrio", "frio"], desc: "La leche llega fría y la cooperativa paga mejor." },
    },
    hecho: ["mandó la leche a la cooperativa", "tuvo un ordeñe parejo y sin patadas", "llenó el tanque antes de que saliera el sol", "vendió los litros con buena grasa"],
    sinBien: "No había con qué ordeñar: vendió unos quesos caseros en la ruta",
    roto: "dijo basta en pleno ordeñe, con la sanidad y el service vencidos",
  },
  dj: {
    nombre: "Boliche", emoji: "🪩", inicial: "sonido",
    bienes: {
      sonido: { nombre: "Equipo de sonido", emoji: "🔊", precio: 1000, rinde: 65, categoria: 0, alias: ["equipo", "parlantes"], desc: "Dos parlantes y una consola que conoció tiempos mejores." },
      luces: { nombre: "Luces y humo", emoji: "💡", precio: 2300, rinde: 115, categoria: 1, alias: ["humo", "lucesyhumo"], desc: "Con la máquina de humo nadie ve que el local es un galpón." },
      local: { nombre: "Local grande", emoji: "🏢", precio: 4800, rinde: 200, categoria: 2, alias: ["localgrande"], desc: "Dos pistas y cola en la puerta hasta la esquina." },
      vip: { nombre: "Barra VIP", emoji: "🍾", precio: 1600, mejora: "ingresos", categoria: 1, alias: ["barra", "barravip"], desc: "El mismo whisky, al triple. Negocio redondo." },
    },
    hecho: ["armó una noche de cumbia que explotó", "llenó la pista hasta las 6", "metió un cumple de 15 con todo", "tuvo noche de retro y vino medio pueblo"],
    sinBien: "No había equipo libre: pasó música con un parlante prestado",
    roto: "largó humo del que no es de máquina, con el service vencido",
  },
};

// Tests put their own in place of chance.
export const _dep = { azar: (n) => randomInt(0, n) };

const pad = (n) => String(n).padStart(2, "0");
export const claveDia = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const limpiar = (texto) => String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const alAzar = (lista) => lista[_dep.azar(lista.length)];
const arroba = (lid) => `@${String(lid).split("@")[0]}`;

// ---------- reading ----------
const conTipo = (fila) => (fila && EMPRESAS[fila.tipo] ? { ...fila, def: EMPRESAS[fila.tipo] } : null);

// Someone's company in a group, with its definition (def), or null.
export const empresaDe = (chat, patron) => conTipo(db.prepare(`SELECT * FROM empresas WHERE chat = ? AND patron = ?`).get(chat, patron));

export const empresasDelGrupo = (chat) => db.prepare(`SELECT * FROM empresas WHERE chat = ? ORDER BY facturado DESC, id ASC`).all(chat).map(conTipo).filter(Boolean);

// A company's goods, each with its definition, in the order they were bought: the number the board shows them with.
export function bienesDe(e) {
  return db.prepare(`SELECT * FROM empresas_bienes WHERE empresa = ? ORDER BY id ASC`).all(e.id).filter((b) => e.def.bienes[b.bien]).map((b, i) => ({ ...b, numero: i + 1, def: e.def.bienes[b.bien] }));
}

export function categoriaDe(facturado) {
  let i = 0;
  while (i < CATEGORIAS.length - 1 && facturado >= CATEGORIAS[i + 1].desde) i++;
  return i;
}
const topeBienes = (e) => CATEGORIAS[categoriaDe(e.facturado)].puestos + 1;

export function buscarBien(tipo, texto) {
  const k = limpiar(texto);
  if (!k || !EMPRESAS[tipo]) return null;
  const hallado = Object.entries(EMPRESAS[tipo].bienes).find(([clave, b]) => clave === k || limpiar(b.nombre) === k || (b.alias || []).includes(k));
  return hallado ? hallado[0] : null;
}

// ---------- the caja and the news ----------
// The news, read: they're shown once.
function leerNovedades(e) {
  const texto = e.novedades || "";
  if (texto) db.prepare(`UPDATE empresas SET novedades = '' WHERE id = ?`).run(e.id);
  e.novedades = "";
  return texto;
}

// The owner showed up (any command of theirs about the company).
function marcarVisto(e) {
  e.visto = Date.now();
  db.prepare(`UPDATE empresas SET visto = ? WHERE id = ?`).run(e.visto, e.id);
}

// Billing: into the caja, and it counts for the category. Returns the line of a category gained, or "".
function facturar(e, monto) {
  if (!(monto > 0)) return "";
  const antes = categoriaDe(e.facturado);
  e.caja += monto;
  e.facturado += monto;
  db.prepare(`UPDATE empresas SET caja = caja + ?, facturado = facturado + ? WHERE id = ?`).run(monto, monto, e.id);
  const ahora = categoriaDe(e.facturado);
  if (ahora === antes) return "";
  const c = CATEGORIAS[ahora];
  return `🏆 *${e.nombre}* subió de categoría: ahora es *${c.nombre}* (${c.puestos} puestos, hasta ${c.puestos + 1} bienes y bienes más grandes en .bienes).`;
}

// Pays from the caja if it covers it (true), or touches nothing (false).
function pagarDeCaja(e, monto) {
  if (!(monto >= 0) || e.caja < monto) return false;
  e.caja -= monto;
  db.prepare(`UPDATE empresas SET caja = caja - ? WHERE id = ?`).run(monto, e.id);
  return true;
}

// ---------- what changes a company's numbers ----------
const tieneMejora = (bienes, cual) => bienes.some((b) => b.def.mejora === cual);

// What multiplies everything the company bills (1 = nothing).
function factorIngresos(e, bienes = bienesDe(e)) {
  return 1 + (tieneMejora(bienes, "ingresos") ? EMPRESA.MEJORA_INGRESOS : 0);
}

// The share of a service's price the company pays (1 = all of it).
const factorService = () => 1;

export function costoService(e, bien) {
  if (bien.def.mejora || (bien.estado >= 100 && !bien.roto)) return 0;
  const base = bien.def.precio * EMPRESA.SERVICE_COSTO * ((100 - bien.estado) / 100) * (bien.roto ? EMPRESA.ROTO_RECARGO : 1) * factorService(e);
  return Math.max(1, Math.ceil(base));
}

// ---------- a shift ----------
// Somebody works a shift for the company on a day: with the best good nobody used that day (the worst one with
// peor, for whoever yields less), which wears out and may break down. factor is how much whoever works yields
// (1 = level 1). Returns { monto, texto, subida }: what it billed, what happened and the category gained, if any.
function trabajar(e, { factor = 1, dia = claveDia(), peor = false } = {}) {
  const bienes = bienesDe(e);
  const mult = factor * factorIngresos(e, bienes);
  const libres = bienes.filter((b) => b.def.rinde && !b.roto && b.usado < dia).sort((a, b) => (b.def.rinde - a.def.rinde) * (peor ? -1 : 1));
  const bien = libres[0];
  if (!bien) {
    const monto = Math.max(1, Math.round(EMPRESA.SIN_BIEN * mult));
    return { monto, bien: null, texto: `${e.def.sinBien} (+${monto})`, subida: facturar(e, monto) };
  }
  const nombre = `${bien.def.emoji} ${bien.def.nombre}`;
  if (bien.estado < EMPRESA.SERVICE_ATRASADO && _dep.azar(100) < EMPRESA.ROTURA_CHANCE) {
    db.prepare(`UPDATE empresas_bienes SET roto = 1, usado = ? WHERE id = ?`).run(dia, bien.id);
    return { monto: 0, bien, roto: true, texto: `💥 ${nombre} ${e.def.roto}: no facturó nada. Se arregla con .service ${bien.numero}`, subida: "" };
  }
  const desgaste = Math.max(1, Math.round(EMPRESA.DESGASTE_USO * (tieneMejora(bienes, "desgaste") ? EMPRESA.MEJORA_DESGASTE : 1)));
  const estado = Math.max(0, bien.estado - desgaste);
  db.prepare(`UPDATE empresas_bienes SET estado = ?, roto = ?, usado = ? WHERE id = ?`).run(estado, estado === 0 ? 1 : 0, dia, bien.id);
  const monto = Math.max(1, Math.round(bien.def.rinde * mult));
  const aviso = estado === 0 ? ` Y ahí quedó: se fundió, hay que arreglarlo con .service ${bien.numero}` : estado < EMPRESA.SERVICE_ATRASADO ? ` ⚠️ Está al ${estado} %: pide .service ${bien.numero}` : "";
  return { monto, bien, texto: `${nombre} ${alAzar(e.def.hecho)} (+${monto}).${aviso}`, subida: facturar(e, monto) };
}

// ---------- actions ----------
export function fundar(chat, usuario, nombre) {
  const genero = generoDe(usuario);
  const ya = empresaDe(chat, usuario);
  if (ya) return { ok: false, error: `Ya sos patrón: tenés *${ya.nombre}*. Una empresa por persona, que con una ya te sale úlcera. Mirala con .empresa` };
  const actual = laburoDe(chat, usuario);
  const disponibles = Object.keys(EMPRESAS).map((k) => `${OFICIOS[k].nombre.toLowerCase()} (${EMPRESAS[k].nombre})`).join(", ");
  if (!actual) return { ok: false, error: `Para fundar una empresa primero hay que saber laburar: agarrá un oficio con .laburos y llegá a nivel ${EMPRESA.NIVEL_FUNDAR}.` };
  const def = EMPRESAS[actual.laburo];
  if (!def) return { ok: false, error: `Todavía no hay empresa para ${nombreDeOficio(actual.oficio, genero).toLowerCase()}. Por ahora fundan: ${disponibles}.` };
  const nivel = nivelDe(actual.cobros);
  if (nivel < EMPRESA.NIVEL_FUNDAR) return { ok: false, error: `Para fundar hay que ser ${nombreDeOficio(actual.oficio, genero).toLowerCase()} nivel ${EMPRESA.NIVEL_FUNDAR} y vos vas por el ${nivel}. Seguí con .cobrar, que el patrón no se hace en un día.` };
  const limpio = String(nombre || "").replace(/[*_~`\n\r]/g, " ").replace(/\s+/g, " ").trim();
  if (!limpio) return { ok: false, error: `Ponele nombre a la criatura: .fundar ${def.nombre === "Transportista" ? "Transportes Feijó" : def.nombre === "Tambo" ? "Tambo La Porfiada" : "Boliche El Aguante"}` };
  if (limpio.length > EMPRESA.NOMBRE_MAX) return { ok: false, error: `El nombre no entra en el cartel: hasta ${EMPRESA.NOMBRE_MAX} letras.` };
  if (limpio.includes("@")) return { ok: false, error: "El nombre va sin arrobas." };

  const fundada = db.transaction(() => {
    if (!gastarCoins(chat, usuario, EMPRESA.COSTO_FUNDAR, "empresa_fundar")) return false;
    const ahora = Date.now();
    const { lastInsertRowid } = db.prepare(`INSERT INTO empresas (chat, patron, tipo, nombre, fundada, visto) VALUES (?, ?, ?, ?, ?, ?)`).run(chat, usuario, actual.laburo, limpio, ahora, ahora);
    db.prepare(`INSERT INTO empresas_bienes (empresa, bien, comprado) VALUES (?, ?, ?)`).run(lastInsertRowid, def.inicial, ahora);
    return true;
  })();
  if (!fundada) return { ok: false, error: `Fundar sale ${EMPRESA.COSTO_FUNDAR} UruCoins (escribano, DGI, BPS y un asado para el inspector) y tenés ${getSaldoCoins(chat, usuario)}.` };
  const inicial = def.bienes[def.inicial];
  return {
    ok: true,
    mensaje: `${def.emoji} Nació *${limpio}*, ${def.nombre.toLowerCase()} de ${arroba(usuario)}. Pagaste ${EMPRESA.COSTO_FUNDAR} de papeles y te llevás tu primer bien: ${inicial.emoji} ${inicial.nombre}.\nLa empresa tiene su caja, aparte de tu bolsillo: lo que factura va ahí. Cada día, con tu .cobrar, además de tu sueldo laburás una jornada para ella.\nEl tablero está en .empresa, lo que se puede comprar en .bienes y la gente se contrata con .contratar.`,
    mentions: [usuario],
  };
}

export function comprarBien(chat, usuario, texto) {
  const e = empresaDe(chat, usuario);
  if (!e) return { ok: false, error: "No tenés empresa. Se funda con .fundar <nombre>, siendo nivel 10 de tu oficio." };
  marcarVisto(e);
  const clave = buscarBien(e.tipo, texto);
  if (!clave) return { ok: false, error: "Eso no lo vende nadie para tu rubro. Mirá la lista con .bienes" };
  const def = e.def.bienes[clave];
  const bienes = bienesDe(e);
  const categoria = categoriaDe(e.facturado);
  if (def.categoria > categoria) return { ok: false, error: `${def.nombre} es para una ${CATEGORIAS[def.categoria].nombre} y *${e.nombre}* todavía es ${CATEGORIAS[categoria].nombre}: le falta facturar ${CATEGORIAS[def.categoria].desde - e.facturado}.` };
  if (def.mejora && bienes.some((b) => b.bien === clave)) return { ok: false, error: `Ya tenés ${def.nombre}: con uno alcanza.` };
  if (bienes.length >= topeBienes(e)) return { ok: false, error: `No te entran más bienes: una ${CATEGORIAS[categoria].nombre} maneja hasta ${topeBienes(e)}. Facturá más para subir de categoría.` };
  if (!pagarDeCaja(e, def.precio)) return { ok: false, error: `${def.nombre} sale ${def.precio} y en la caja de *${e.nombre}* hay ${e.caja}. Se compra con la plata de la empresa: poné con .caja depositar ${def.precio - e.caja}` };
  db.prepare(`INSERT INTO empresas_bienes (empresa, bien, comprado) VALUES (?, ?, ?)`).run(e.id, clave, Date.now());
  const para = def.mejora === "desgaste" ? "Los demás bienes se gastan menos." : def.mejora === "ingresos" ? `Todo lo que factura la empresa rinde ${Math.round(EMPRESA.MEJORA_INGRESOS * 100)} % más.` : `Rinde ${def.rinde} por jornada, si tiene quién lo trabaje.`;
  return { ok: true, mensaje: `${def.emoji} *${e.nombre}* compró: ${def.nombre}. ${def.desc}\n${para} Quedan ${e.caja} en la caja.` };
}

// .service: with nothing, what each one would cost; with a number of the board, that good; with "todo", all of them
// the caja can pay, the cheapest first.
export function service(chat, usuario, texto) {
  const e = empresaDe(chat, usuario);
  if (!e) return { ok: false, error: "No tenés empresa a la que hacerle service." };
  marcarVisto(e);
  const gastados = bienesDe(e).map((b) => ({ ...b, costo: costoService(e, b) })).filter((b) => b.costo > 0);
  const pedido = limpiar(texto);
  if (!pedido) {
    if (!gastados.length) return { ok: true, mensaje: `🔧 En *${e.nombre}* está todo al 100 %. Ni un ruidito.` };
    return { ok: true, mensaje: `🔧 *Service en ${e.nombre}* (caja: ${e.caja})\n${gastados.map((b) => `${b.numero}. ${b.def.emoji} ${b.def.nombre} — ${b.roto ? "roto 💥" : `${b.estado} %`} · ${b.costo}`).join("\n")}\n.service <número> arregla uno y .service todo, todos los que la caja aguante.` };
  }
  const elegidos = pedido === "todo" || pedido === "todos" ? [...gastados].sort((a, b) => a.costo - b.costo) : gastados.filter((b) => String(b.numero) === pedido);
  if (!elegidos.length) return { ok: false, error: pedido === "todo" || pedido === "todos" ? "No hay nada que arreglar: está todo al 100 %." : "Ese número no es de un bien gastado. Mirá cuáles con .service" };
  const hechos = [];
  for (const b of elegidos) {
    if (!pagarDeCaja(e, b.costo)) continue;
    db.prepare(`UPDATE empresas_bienes SET estado = 100, roto = 0 WHERE id = ?`).run(b.id);
    hechos.push(b);
  }
  if (!hechos.length) return { ok: false, error: `El service sale ${elegidos[0].costo} y en la caja hay ${e.caja}. El mecánico no fía: .caja depositar ${elegidos[0].costo - e.caja}` };
  const total = hechos.reduce((s, b) => s + b.costo, 0);
  const sinPlata = elegidos.length - hechos.length;
  return { ok: true, mensaje: `🔧 Service hecho: ${hechos.map((b) => `${b.def.emoji} ${b.def.nombre}`).join(", ")}. ${hechos.length === 1 ? "Quedó" : "Quedaron"} al 100 % por ${total}. Caja: ${e.caja}.${sinPlata ? ` Para ${sinPlata === 1 ? "el otro" : `los otros ${sinPlata}`} no alcanzó.` : ""}` };
}

export function depositar(chat, usuario, monto) {
  const e = empresaDe(chat, usuario);
  if (!e) return { ok: false, error: "No tenés empresa donde poner plata." };
  marcarVisto(e);
  if (!(monto > 0)) return { ok: false, error: "Decime cuánto: .caja depositar 200" };
  const hecho = db.transaction(() => {
    if (!gastarCoins(chat, usuario, monto, "empresa_deposito")) return false;
    db.prepare(`UPDATE empresas SET caja = caja + ? WHERE id = ?`).run(monto, e.id);
    return true;
  })();
  if (!hecho) return { ok: false, error: `No te alcanza: tenés ${getSaldoCoins(chat, usuario)} UruCoins en el bolsillo.` };
  return { ok: true, mensaje: `💰 Pusiste ${monto} en la caja de *${e.nombre}*: ahora tiene ${e.caja + monto}. A vos te quedan ${getSaldoCoins(chat, usuario)}.` };
}

// The share of what's taken out of the caja that goes in taxes.
const tasaRetiro = () => EMPRESA.IMPUESTO_RETIRO;

export function retirar(chat, usuario, monto) {
  const e = empresaDe(chat, usuario);
  if (!e) return { ok: false, error: "No tenés empresa de donde sacar plata." };
  marcarVisto(e);
  if (!(monto > 0)) return { ok: false, error: "Decime cuánto: .caja retirar 200" };
  const tasa = tasaRetiro(e);
  const impuesto = Math.ceil(monto * tasa);
  const neto = monto - impuesto;
  if (neto <= 0) return { ok: false, error: "Con tan poco se lo lleva todo la DGI. Retirá más." };
  const hecho = db.transaction(() => {
    if (!pagarDeCaja(e, monto)) return false;
    ganarCoins(chat, usuario, neto, "empresa_retiro");
    return true;
  })();
  if (!hecho) return { ok: false, error: `En la caja de *${e.nombre}* hay ${e.caja}. No se puede retirar lo que no hay (eso viene en otra actualización, con el banco).` };
  return { ok: true, mensaje: `💸 Retiraste ${monto} de *${e.nombre}*: ${neto} al bolsillo y ${impuesto} para la DGI (${Math.round(tasa * 100)} %). Quedan ${e.caja} en la caja y vos tenés ${getSaldoCoins(chat, usuario)}.` };
}

// The owner's own shift, once a day, with their .cobrar: null if they have no company. They yield by their level in
// the company's trade, if they still have it (at level 10, +45 %).
export function jornadaDelPatron(chat, usuario) {
  const e = empresaDe(chat, usuario);
  if (!e) return null;
  const novedades = leerNovedades(e);
  marcarVisto(e);
  const hoy = claveDia();
  if (e.ultima_jornada === hoy) return { ok: false, error: `Hoy ya laburaste tu jornada en *${e.nombre}*.`, novedades };
  const actual = laburoDe(chat, usuario);
  const factor = actual?.laburo === e.tipo ? factorNivel(nivelDe(actual.cobros)) : 1;
  const r = trabajar(e, { factor, dia: hoy });
  db.prepare(`UPDATE empresas SET ultima_jornada = ? WHERE id = ?`).run(hoy, e.id);
  return { ok: true, monto: r.monto, novedades, mensaje: `${e.def.emoji} *${e.nombre}*: ${r.texto}\n💰 Caja: ${e.caja}.${r.subida ? `\n${r.subida}` : ""}${novedades ? `\n📋 Mientras no estabas:\n${novedades}` : ""}` };
}

// ---------- texts ----------
const lineaBien = (e, b) => {
  if (b.def.mejora) return `${b.numero}. ${b.def.emoji} ${b.def.nombre} — mejora`;
  const costo = costoService(e, b);
  const estado = b.roto ? `roto 💥 (.service ${b.numero}: ${costo})` : b.estado < EMPRESA.SERVICE_ATRASADO ? `${b.estado} % ⚠️ service atrasado (.service ${b.numero}: ${costo})` : `${b.estado} %`;
  return `${b.numero}. ${b.def.emoji} ${b.def.nombre} — ${estado} · rinde ${b.def.rinde}`;
};

function textoCategoria(e) {
  const i = categoriaDe(e.facturado);
  const sigue = CATEGORIAS[i + 1];
  return `🏷️ ${CATEGORIAS[i].nombre} · facturó ${e.facturado}${sigue ? ` (faltan ${sigue.desde - e.facturado} para ${sigue.nombre})` : ", lo más alto que hay"}`;
}

// The board: .empresa. For its owner (propio) it shows the news too, and they count as read.
export function textoEmpresa(e, { propio = false } = {}) {
  const bienes = bienesDe(e);
  const novedades = propio ? leerNovedades(e) : "";
  if (propio) marcarVisto(e);
  const partes = [
    `${e.def.emoji} *${e.nombre}* — ${e.def.nombre.toLowerCase()} de ${nombreDe(e.patron)}\n${textoCategoria(e)}\n💰 Caja: ${e.caja} UruCoins`,
    `🔩 *Bienes* (${bienes.length} de ${topeBienes(e)})\n${bienes.map((b) => lineaBien(e, b)).join("\n")}`,
  ];
  if (novedades) partes.push(`📋 *Novedades*\n${novedades}`);
  if (propio) partes.push("_.bienes: qué comprar · .caja depositar 100 / retirar 100 · .service: arreglos_");
  return partes.join("\n\n");
}

// .bienes: what a company of that trade can buy, and what each category opens.
export function textoBienes(e) {
  const categoria = categoriaDe(e.facturado);
  const lineas = Object.entries(e.def.bienes).map(([clave, b]) => {
    const que = b.mejora === "desgaste" ? "mejora: todo se gasta menos" : b.mejora === "ingresos" ? `mejora: +${Math.round(EMPRESA.MEJORA_INGRESOS * 100)} % de facturación` : `rinde ${b.rinde} por jornada`;
    const candado = b.categoria > categoria ? ` 🔒 desde ${CATEGORIAS[b.categoria].nombre}` : "";
    return `${b.emoji} *${b.nombre}* — ${b.precio} · ${que}${candado} · .comprar ${clave}\n${b.desc}`;
  });
  const categorias = CATEGORIAS.map((c) => `${c.nombre} (desde ${c.desde} facturados: ${c.puestos} puestos, ${c.puestos + 1} bienes)`).join(" → ");
  return `🛒 *Bienes para ${e.def.nombre.toLowerCase()}* (caja de ${e.nombre}: ${e.caja})\n\n${lineas.join("\n\n")}\n\nSe pagan de la caja. Cada bien de trabajo hace una jornada por día si alguien lo trabaja, y cada jornada lo gasta ${EMPRESA.DESGASTE_USO} %: por debajo del ${EMPRESA.SERVICE_ATRASADO} % se puede romper, y arreglarlo roto sale el doble.\nCategorías: ${categorias}.`;
}

// .empresas: the group's companies, the one that billed most first.
export function textoEmpresas(chat) {
  const lista = empresasDelGrupo(chat);
  if (!lista.length) return `🏭 Acá todavía no hay ni un patrón. Con nivel ${EMPRESA.NIVEL_FUNDAR} de ${Object.keys(EMPRESAS).map((k) => OFICIOS[k].nombre.toLowerCase()).join(", ")} y ${EMPRESA.COSTO_FUNDAR} UruCoins se funda una: .fundar <nombre>`;
  return `🏭 *Empresas del grupo*\n${lista.map((e, i) => `${i + 1}. ${e.def.emoji} *${e.nombre}* — ${nombreDe(e.patron)} · ${CATEGORIAS[categoriaDe(e.facturado)].nombre} · facturó ${e.facturado}`).join("\n")}`;
}

// What .fundar says with no name: what it takes.
export const textoFundar = () =>
  `🏭 *Fundar una empresa*\nHay que ser nivel ${EMPRESA.NIVEL_FUNDAR} del oficio y tener ${EMPRESA.COSTO_FUNDAR} UruCoins. Por ahora: ${Object.keys(EMPRESAS).map((k) => `${OFICIOS[k].nombre.toLowerCase()} → ${EMPRESAS[k].nombre}`).join(", ")}.\nSe funda con .fundar <nombre>, por ejemplo .fundar Transportes Feijó`;
