// "Modo patrón": whoever reaches the top level of a trade (lib/laburos.js) can found that trade's company. A company
// has its own cash box (the caja, apart from its owner's pocket), goods that are bought, wear out with use and need a
// service, and a category that opens more posts and bigger goods: the higher of the one for what it has billed and the
// one for what it's worth (caja and goods, less its owner's debts), so whoever comes in with money needn't start from
// the bottom. Money put into the caja counts for what it's worth only some days later, and the category the worth
// gave is lost when the worth goes down.
// It hires: people of the group, who then collect their .cobrar from the company's caja instead of from the bot and
// bill for it, with a level of their own in each post; or Claudia's own employees, for small groups, who yield less,
// cost more and never level up. Firing costs a severance pay.
// For now only three trades have one: camionero (Transportista), tambero (Tambo) and dj (Boliche).
// In a group that is a town (lib/pueblo.js) the town is in the numbers: its prosperity and its events move what a shift
// bills and what goods and services cost, the intendente's tax takes its share of what's billed, a town with little
// safety has robberies, and the founding, the categories and the breakdowns are news for the Sunday paper. With no
// town, nothing of that.
// Every number is in EMPRESA, CATEGORIAS and EMPRESAS, to tune them in one place. The tables are in database-schema.js.
import { randomInt } from "crypto";
import { ganarCoins, gastarCoins, getSaldoCoins, db } from "../database-functions.js";
import { LABURO, OFICIOS, laburoDe, nivelDe, factorNivel, nombreDeOficio } from "./laburos.js";
import { generoDe, concordar } from "./genero.js";
import { nombreDe } from "./menciones.js";
import { PUEBLO, modificador, registrarHecho, huboRobo, cobrarImpuesto, npc } from "./pueblo.js";
import { ofrecerServicio } from "./servicios.js";
import { tieneGuardaespaldas } from "./tienda.js";

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
  // Staff. Someone's level in a post follows the trades' rules (nivelDe, factorNivel: +5 % per level, up to 10).
  SUELDO_MAX_VECES: 10, // a wage can be offered up to this many times the post's going wage
  OFERTA_HORAS: 24, // how long a job offer stands
  // Claudia's own: they yield NPC_RINDE of a level 1, cost NPC_SUELDO times the post's going wage and settle each
  // day once it's over, up to NPC_DIAS_MAX days back.
  NPC_RINDE: 0.7,
  NPC_SUELDO: 1.3,
  NPC_DIAS_MAX: 7,
  // Severance: one wage, plus one for every INDEMNIZACION_CADA shifts worked in the company, up to INDEMNIZACION_TOPE.
  INDEMNIZACION_CADA: 5,
  INDEMNIZACION_TOPE: 6,
  // The posts that don't work a good count while whoever holds them shows up: paid in the last PRESENTE_DIAS days.
  PRESENTE_DIAS: 2,
  PUESTO_INGRESOS: 0.1, // what an "ingresos" post adds to everything billed (by its level)
  PUESTO_SERVICE: 0.3, // what a "service" post takes off the price of a service
  CONTADOR_DESCUENTO: 0.5, // the share of the withdrawal tax an accountant saves
  // With its owner gone for more than AUSENCIA_DIAS days and no manager, the company bills AUSENCIA_FACTOR of it.
  AUSENCIA_DIAS: 2,
  AUSENCIA_FACTOR: 0.5,
  // What's put into the caja from a pocket counts for what the company is worth only after DEPOSITO_DIAS days: no
  // category bought for an afternoon. (Taking it back out pays the DGI anyway.)
  DEPOSITO_DIAS: 3,
};

// A company's category is the higher of two: the one for what it has billed since it was founded (desde), which
// never goes back, and the one for what it's worth today (valor: its caja, the money deposited in the last days left
// out, and its goods as the bank values them, less what its owner owes), which follows the worth up and down. Each
// category opens more posts, and the goods say which category they ask for. A company can own one good more than it
// has posts: the owner works with one. The worth asks for more than the billing: money sitting in a caja is easier
// to come by than money billed shift by shift (scripts/simular-banco.mjs runs a town with an heir who founds with it).
export const CATEGORIAS = [
  { nombre: "Changarín", desde: 0, valor: 0, puestos: 2 },
  { nombre: "PyME", desde: 2000, valor: 5000, puestos: 4 },
  { nombre: "Empresa", desde: 10000, valor: 15000, puestos: 7 },
  { nombre: "Grupo empresarial", desde: 40000, valor: 50000, puestos: 12 },
];

// The companies, by the trade they come from. A good with "rinde" is worked with, one shift a day, and bills that
// much at level 1; one with "mejora" is an upgrade (one of each, and it doesn't wear): "desgaste" slows the wear of the
// rest and "ingresos" raises what the company bills. "categoria" is the index in CATEGORIAS it asks for.
// "hecho" is what a shift with a good was, and "roto" how it broke down.
// The posts: "sueldo" is the going wage (what an offer is compared with, and what Claudia's own are priced from) and
// "tipo" what the post does: "operario" works a good a day and bills what it yields (as many as the company has
// posts for); the others are one per company: "ingresos" raises what it bills and "service" makes services cheaper.
export const EMPRESAS = {
  camionero: {
    nombre: "Transportista", emoji: "🚛", inicial: "camion",
    bienes: {
      camion: { nombre: "Camión chico", emoji: "🛻", precio: 900, rinde: 60, categoria: 0, desc: "Un 608 con más kilómetros que la ruta 5. Pero es tuyo." },
      semi: { nombre: "Semirremolque", emoji: "🚛", precio: 2200, rinde: 110, categoria: 1, alias: ["semirremolque", "zorra"], desc: "Ya entrás a los puertos por la puerta grande." },
      bitren: { nombre: "Bitren", emoji: "🚚", precio: 4500, rinde: 190, categoria: 2, desc: "Treinta metros de camión. Doblar en Young es un arte." },
      galpon: { nombre: "Galpón", emoji: "🏚️", precio: 1500, mejora: "desgaste", categoria: 1, desc: "Los fierros bajo techo se gastan menos." },
    },
    puestos: {
      chofer: { nombre: "Chofer", tipo: "operario", sueldo: 30, alias: ["camionero", "choferes"] },
      mecanico: { nombre: "Mecánico", femenino: "Mecánica", tipo: "service", sueldo: 28, alias: ["mecanica"] },
      despachante: { nombre: "Despachante", tipo: "ingresos", sueldo: 32 },
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
    puestos: {
      ordenador: { nombre: "Ordeñador", femenino: "Ordeñadora", tipo: "operario", sueldo: 26, alias: ["ordenadora", "tambero", "tambera"] },
      veterinario: { nombre: "Veterinario", femenino: "Veterinaria", tipo: "service", sueldo: 30, alias: ["veterinaria", "vete"] },
      quesero: { nombre: "Quesero", femenino: "Quesera", tipo: "ingresos", sueldo: 28, alias: ["quesera"] },
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
    puestos: {
      residente: { nombre: "DJ residente", tipo: "operario", sueldo: 30, alias: ["dj", "djresidente"] },
      patovica: { nombre: "Patovica", tipo: "service", sueldo: 26, alias: ["seguridad", "pato"] },
      rrpp: { nombre: "RRPP", tipo: "ingresos", sueldo: 28, alias: ["relacionespublicas", "publica"] },
    },
    hecho: ["armó una noche de cumbia que explotó", "llenó la pista hasta las 6", "metió un cumple de 15 con todo", "tuvo noche de retro y vino medio pueblo"],
    sinBien: "No había equipo libre: pasó música con un parlante prestado",
    roto: "largó humo del que no es de máquina, con el service vencido",
  },
};

// The posts every company has, one of each.
export const PUESTOS_COMUNES = {
  gerente: { nombre: "Gerente", tipo: "gerente", sueldo: 40, alias: ["gerenta", "encargado", "encargada"] },
  contador: { nombre: "Contador", femenino: "Contadora", tipo: "contador", sueldo: 35, alias: ["contadora"] },
};

// What each kind of post does, as .puestos tells it.
const QUE_HACE = {
  operario: () => "trabaja un bien por día y le factura a la empresa lo que rinde, más con cada nivel",
  ingresos: () => `sube ${Math.round(EMPRESA.PUESTO_INGRESOS * 100)} % todo lo que factura la empresa, y más con cada nivel`,
  service: () => `el service sale ${Math.round(EMPRESA.PUESTO_SERVICE * 100)} % menos`,
  gerente: () => `si el patrón no aparece en ${EMPRESA.AUSENCIA_DIAS} días, la empresa sigue igual; sin gerente, factura la mitad`,
  contador: () => `la DGI se queda ${Math.round(EMPRESA.IMPUESTO_RETIRO * (1 - EMPRESA.CONTADOR_DESCUENTO) * 100)} % de lo que retirás de la caja, en vez de ${Math.round(EMPRESA.IMPUESTO_RETIRO * 100)} %`,
};
// What a day in a post that works no good was.
const JORNADA_SIN_BIEN = {
  ingresos: "Moviste contactos todo el día: la empresa factura más con vos",
  service: "Tuviste los fierros a punto: el service le sale más barato a la empresa",
  gerente: "Tuviste la empresa andando, esté o no esté el patrón",
  contador: "Dejaste los números prolijos: la DGI muerde menos",
};
const NOMBRES_NPC = ["el Cacho", "la Yoli", "el Bocha", "la Chola", "el Toto", "la Mirta", "el Rulo", "la Beba", "el Pocho", "la Nelly", "el Tito", "la Gladys"];

// Tests put their own in place of chance.
export const _dep = { azar: (n) => randomInt(0, n) };

const pad = (n) => String(n).padStart(2, "0");
export const claveDia = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const limpiar = (texto) => String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const alAzar = (lista) => lista[_dep.azar(lista.length)];
const arroba = (lid) => `@${String(lid).split("@")[0]}`;
const DIA_MS = 24 * 60 * 60 * 1000;
// A day's key as a moment (its noon, so a change of clocks doesn't move the day).
const momentoDe = (clave) => new Date(`${clave}T12:00:00`).getTime();
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// ---------- reading ----------
const conTipo = (fila) => (fila && EMPRESAS[fila.tipo] ? { ...fila, def: EMPRESAS[fila.tipo] } : null);

// Someone's company in a group, with its definition (def), or null.
export const empresaDe = (chat, patron) => conTipo(db.prepare(`SELECT * FROM empresas WHERE chat = ? AND patron = ?`).get(chat, patron));

const empresaPorId = (id) => conTipo(db.prepare(`SELECT * FROM empresas WHERE id = ?`).get(id));

export const empresasDelGrupo = (chat) => db.prepare(`SELECT * FROM empresas WHERE chat = ? ORDER BY facturado DESC, id ASC`).all(chat).map(conTipo).filter(Boolean);

// A company's goods, each with its definition, in the order they were bought: the number the board shows them with.
export function bienesDe(e) {
  return db.prepare(`SELECT * FROM empresas_bienes WHERE empresa = ? ORDER BY id ASC`).all(e.id).filter((b) => e.def.bienes[b.bien]).map((b, i) => ({ ...b, numero: i + 1, def: e.def.bienes[b.bien] }));
}

// A company's posts: its trade's and the ones every company has.
export const puestosDe = (e) => ({ ...e.def.puestos, ...PUESTOS_COMUNES });

export function buscarPuesto(e, texto) {
  const k = limpiar(texto);
  if (!k) return null;
  const hallado = Object.entries(puestosDe(e)).find(([clave, p]) => clave === k || limpiar(p.nombre) === k || (p.alias || []).includes(k));
  return hallado ? hallado[0] : null;
}
const nombrePuesto = (def, usuario) => ((usuario && generoDe(usuario) === "mujer" && def.femenino) || def.nombre).toLowerCase();

// What someone has worked in a post, in a group: it's theirs, whatever company they work for.
const experienciaDe = (chat, usuario, puesto) => db.prepare(`SELECT cobros FROM empresas_experiencia WHERE chat = ? AND usuario = ? AND puesto = ?`).get(chat, usuario, puesto)?.cobros || 0;
export const nivelEnPuesto = (chat, usuario, puesto) => nivelDe(experienciaDe(chat, usuario, puesto));

// A company's staff, in the order they came in (the number the board shows them with): each with its post (def),
// whether it's one of Claudia's (npc), its level and whether it's been showing up (presente).
export function empleadosDe(e) {
  const puestos = puestosDe(e);
  return db.prepare(`SELECT * FROM empresas_empleados WHERE empresa = ? ORDER BY id ASC`).all(e.id).filter((x) => puestos[x.puesto]).map((x, i) => {
    const npc = !x.usuario;
    const ultimo = x.ultimo_cobro ? momentoDe(x.ultimo_cobro) - DIA_MS / 2 : x.desde;
    return { ...x, numero: i + 1, def: puestos[x.puesto], npc, nivel: npc ? 1 : nivelEnPuesto(e.chat, x.usuario, x.puesto), presente: npc || Date.now() - ultimo < (EMPRESA.PRESENTE_DIAS + 1) * DIA_MS, como: npc ? x.nombre : nombreDe(x.usuario) };
  });
}

// Where someone works in a group: their row in the staff, with the company (empresa), or null.
export function empleoDe(chat, usuario) {
  const fila = db.prepare(`SELECT emp.* FROM empresas_empleados emp JOIN empresas e ON e.id = emp.empresa WHERE e.chat = ? AND emp.usuario = ?`).get(chat, usuario);
  const empresa = fila && empresaPorId(fila.empresa);
  return empresa ? { ...fila, empresa, def: puestosDe(empresa)[fila.puesto] } : null;
}

// The category for what was billed, and the one for what the company is worth: indexes in CATEGORIAS.
export function categoriaDe(facturado) {
  let i = 0;
  while (i < CATEGORIAS.length - 1 && facturado >= CATEGORIAS[i + 1].desde) i++;
  return i;
}
export function categoriaPorValor(valor) {
  let i = 0;
  while (i < CATEGORIAS.length - 1 && valor >= CATEGORIAS[i + 1].valor) i++;
  return i;
}

// What was put into the caja from a pocket in the last DEPOSITO_DIAS days, and when the oldest of it starts counting.
function depositosRecientes(e, ahora = Date.now()) {
  const desde = ahora - EMPRESA.DEPOSITO_DIAS * DIA_MS;
  db.prepare(`DELETE FROM empresas_depositos WHERE empresa = ? AND fecha <= ?`).run(e.id, desde);
  const r = db.prepare(`SELECT COALESCE(SUM(monto), 0) AS monto, MIN(fecha) AS primero FROM empresas_depositos WHERE empresa = ?`).get(e.id);
  return { monto: r.monto, cuenta: r.primero ? r.primero + EMPRESA.DEPOSITO_DIAS * DIA_MS : 0 };
}

// What someone owes, to the bank and to their neighbours (lib/banco.js's table, read here: the bank imports this file).
const deudaDe = (chat, usuario) => db.prepare(`SELECT COALESCE(SUM(saldo), 0) AS n FROM banco_prestamos WHERE chat = ? AND deudor = ? AND estado = 'activo'`).get(chat, usuario).n;

// What a company is worth for its category: { total, caja, bienes, deuda, reciente, cuenta }. The caja, the goods
// (valorDeBien, as the bank values them) and, taken off, what its owner owes (a loan isn't worth) and what was deposited
// in the last days (reciente; cuenta is when it starts counting). Deposited money is taken off whole, even if it was
// spent on goods meanwhile: a deposit turned at once into a truck doesn't count earlier either.
export function valorDeEmpresa(e, ahora = Date.now()) {
  const caja = e.caja;
  const bienes = valorDeBienes(e);
  const deuda = deudaDe(e.chat, e.patron);
  const { monto: reciente, cuenta } = depositosRecientes(e, ahora);
  return { total: Math.max(0, caja + bienes - deuda - reciente), caja, bienes, deuda, reciente, cuenta };
}

// A company's category (an index in CATEGORIAS): the higher of what it billed and what it's worth.
export const categoriaEmpresa = (e, ahora = Date.now()) => Math.max(categoriaDe(e.facturado), categoriaPorValor(valorDeEmpresa(e, ahora).total));
const topeBienes = (e) => CATEGORIAS[categoriaEmpresa(e)].puestos + 1;

// What changed in a company's category since its owner was last told: the line that says it (a step up, or a step
// down when its worth went down), or "". Each category reached for the first time is news for the town's paper. A
// company from before the column (categoria -1) is just noted, with nothing to say.
export function revisarCategoria(e, ahora = Date.now()) {
  const ahoraEs = categoriaEmpresa(e, ahora);
  const antes = e.categoria ?? -1;
  if (ahoraEs === antes) return "";
  const record = Math.max(e.categoria_max ?? -1, antes);
  e.categoria = ahoraEs;
  e.categoria_max = Math.max(record, ahoraEs);
  db.prepare(`UPDATE empresas SET categoria = ?, categoria_max = ? WHERE id = ?`).run(e.categoria, e.categoria_max, e.id);
  if (antes < 0) return "";
  const c = CATEGORIAS[ahoraEs];
  if (ahoraEs < antes) {
    return `📉 *${e.nombre}* bajó a *${c.nombre}*: lo que vale ya no le da para ${CATEGORIAS[antes].nombre}, y lo facturado tampoco. Los bienes y la gente que ya tiene se quedan, pero no entra nada nuevo de más.`;
  }
  if (ahoraEs > record) registrarHecho(e.chat, "empresa_categoria", { usuario: e.patron, nombre: e.nombre, categoria: c.nombre, emoji: e.def.emoji });
  const porValor = categoriaDe(e.facturado) < ahoraEs;
  return `🏆 *${e.nombre}* subió de categoría${porValor ? " por lo que vale" : ""}: ahora es *${c.nombre}* (${c.puestos} puestos, hasta ${c.puestos + 1} bienes y bienes más grandes en .bienes).${porValor ? " Si el valor baja, la categoría baja con él." : ""}`;
}

export function buscarBien(tipo, texto) {
  const k = limpiar(texto);
  if (!k || !EMPRESAS[tipo]) return null;
  const hallado = Object.entries(EMPRESAS[tipo].bienes).find(([clave, b]) => clave === k || limpiar(b.nombre) === k || (b.alias || []).includes(k));
  return hallado ? hallado[0] : null;
}

// ---------- what the Banco Central needs (lib/banco.js) ----------
// What a good is worth to the bank: its list price, by its condition (a broken one, half of a worn one).
export const valorDeBien = (b) => Math.round(b.def.precio * (b.roto ? 0.25 : 0.5 + b.estado / 200));

// What a company's goods are worth together: what a loan is measured against.
export const valorDeBienes = (e) => bienesDe(e).reduce((s, b) => s + valorDeBien(b), 0);

// The goods the bank may seize for a debt: all but the last one worked with, so the company can still bill and pay.
export function bienesEmbargables(e) {
  const bienes = bienesDe(e);
  const deTrabajo = bienes.filter((b) => b.def.rinde);
  const ultimo = deTrabajo.length === 1 ? deTrabajo[0].id : null;
  return bienes.filter((b) => b.id !== ultimo);
}

// A good leaves its company (seized). Returns whether it was there.
export const quitarBien = (id) => db.prepare(`DELETE FROM empresas_bienes WHERE id = ?`).run(id).changes > 0;

// Whether a company can take one more of that good (bought at an auction): its rubro, its category, its room, and an
// upgrade only once. Returns "" when it can, or why not.
export function sinLugarParaBien(e, clave) {
  const def = e.def.bienes[clave];
  if (!def) return `*${e.nombre}* no es del rubro.`;
  const bienes = bienesDe(e);
  if (def.mejora && bienes.some((b) => b.bien === clave)) return `*${e.nombre}* ya tiene ${def.nombre}.`;
  if (def.categoria > categoriaEmpresa(e)) return `${def.nombre} es para una ${CATEGORIAS[def.categoria].nombre}.`;
  if (bienes.length >= topeBienes(e)) return `a *${e.nombre}* no le entran más bienes.`;
  return "";
}

// A good comes into a company as it was (an auction's): its condition and whether it's broken.
export function recibirBien(e, clave, { estado = 100, roto = 0 } = {}) {
  db.prepare(`INSERT INTO empresas_bienes (empresa, bien, estado, roto, comprado) VALUES (?, ?, ?, ?, ?)`).run(e.id, clave, estado, roto, Date.now());
}

// ---------- the caja and the news ----------
// What the owner hasn't read yet: what happened in the company while somebody else was working. The last ones only.
function anotar(e, linea) {
  if (String(e.novedades || "").split("\n").includes(linea)) return;
  const lineas = [...String(e.novedades || "").split("\n").filter(Boolean), linea].slice(-EMPRESA.NOVEDADES_MAX);
  e.novedades = lineas.join("\n");
  db.prepare(`UPDATE empresas SET novedades = ? WHERE id = ?`).run(e.novedades, e.id);
}

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

// Billing: into the caja, but for the town's tax (impuesto), and all of it counts for the category. Returns the line
// of a category gained, or "". A company whose category nobody noted yet (from before the column) has it noted first,
// so what this billing gains is told.
function facturar(e, monto, impuesto = 0) {
  if (!(monto > 0)) return "";
  if ((e.categoria ?? -1) < 0) revisarCategoria(e);
  e.caja += monto - impuesto;
  e.facturado += monto;
  db.prepare(`UPDATE empresas SET caja = caja + ?, facturado = facturado + ? WHERE id = ?`).run(monto - impuesto, monto, e.id);
  return revisarCategoria(e);
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

// How much a one-per-company post is worth to the company right now: 0 with nobody in it or with whoever holds it
// not showing up, NPC_RINDE with one of Claudia's and 1 with a person (their level's factor, with porNivel).
function fuerzaDe(e, tipo, { porNivel = false } = {}) {
  const quien = empleadosDe(e).find((x) => x.def.tipo === tipo && x.presente);
  if (!quien) return 0;
  return quien.npc ? EMPRESA.NPC_RINDE : porNivel ? factorNivel(quien.nivel) : 1;
}

// The owner hasn't shown up in days and there's no manager to run the place.
export const sinPatron = (e) => Date.now() - e.visto > EMPRESA.AUSENCIA_DIAS * DIA_MS && !fuerzaDe(e, "gerente");

// What multiplies everything the company bills (1 = nothing).
function factorIngresos(e, bienes = bienesDe(e)) {
  const suma = 1 + (tieneMejora(bienes, "ingresos") ? EMPRESA.MEJORA_INGRESOS : 0) + EMPRESA.PUESTO_INGRESOS * fuerzaDe(e, "ingresos", { porNivel: true });
  return suma * (sinPatron(e) ? EMPRESA.AUSENCIA_FACTOR : 1);
}

// The share of a service's price the company pays (1 = all of it).
const factorService = (e) => 1 - EMPRESA.PUESTO_SERVICE * fuerzaDe(e, "service");

// What a good costs today: its price, by the town's prosperity where the group is one.
export const precioDe = (e, def) => Math.round(def.precio * modificador(e.chat, "precios"));

export function costoService(e, bien) {
  if (bien.def.mejora || (bien.estado >= 100 && !bien.roto)) return 0;
  const base = precioDe(e, bien.def) * EMPRESA.SERVICE_COSTO * ((100 - bien.estado) / 100) * (bien.roto ? EMPRESA.ROTO_RECARGO : 1) * factorService(e);
  return Math.max(1, Math.ceil(base));
}

// ---------- a shift ----------
// Somebody works a shift for the company on a day: with the best good nobody used that day (the worst one with
// peor, for whoever yields less), which wears out and may break down. factor is how much whoever works yields
// (1 = level 1). Returns { monto, texto, subida }: what it billed, what happened and the category gained, if any.
// With servicio, a good that breaks down is offered to the town's mechanics (lib/servicios.js, where the group is a
// town): only from the shifts somebody is there to read about.
function trabajar(e, { factor = 1, dia = claveDia(), peor = false, servicio = false } = {}) {
  const bienes = bienesDe(e);
  // The town's prosperity and events (lib/pueblo.js): 1 with no town.
  const mult = factor * factorIngresos(e, bienes) * modificador(e.chat, `empresa:${e.tipo}`);
  const libres = bienes.filter((b) => b.def.rinde && !b.roto && b.usado < dia).sort((a, b) => (b.def.rinde - a.def.rinde) * (peor ? -1 : 1));
  const bien = libres[0];
  if (!bien) {
    const monto = Math.max(1, Math.round(EMPRESA.SIN_BIEN * mult));
    return cobrarJornada(e, { monto, bien: null, texto: `${e.def.sinBien} (+${monto}` });
  }
  const nombre = `${bien.def.emoji} ${bien.def.nombre}`;
  if (bien.estado < EMPRESA.SERVICE_ATRASADO && _dep.azar(100) < EMPRESA.ROTURA_CHANCE) {
    db.prepare(`UPDATE empresas_bienes SET roto = 1, usado = ? WHERE id = ?`).run(dia, bien.id);
    registrarHecho(e.chat, "bien_roto", { usuario: e.patron, nombre: e.nombre, bien: bien.def.nombre });
    const oferta = servicio ? ofrecerServicio(e.chat, e.patron, "bien", { empresa: e.id, bien: bien.id, tipo: e.tipo, bienNombre: bien.def.nombre, empresaNombre: e.nombre, costo: costoService(e, { ...bien, roto: 1 }) }) : null;
    return { monto: 0, bien, roto: true, texto: `💥 ${nombre} ${e.def.roto}: no facturó nada. Se arregla con .service ${bien.numero}${oferta ? `, o con alguien del pueblo:\n${oferta.texto}` : ""}`, subida: "", mentions: oferta?.mentions || [] };
  }
  const desgaste = Math.max(1, Math.round(EMPRESA.DESGASTE_USO * (tieneMejora(bienes, "desgaste") ? EMPRESA.MEJORA_DESGASTE : 1)));
  const estado = Math.max(0, bien.estado - desgaste);
  db.prepare(`UPDATE empresas_bienes SET estado = ?, roto = ?, usado = ? WHERE id = ?`).run(estado, estado === 0 ? 1 : 0, dia, bien.id);
  const monto = Math.max(1, Math.round(bien.def.rinde * mult));
  const aviso = estado === 0 ? ` Y ahí quedó: se fundió, hay que arreglarlo con .service ${bien.numero}` : estado < EMPRESA.SERVICE_ATRASADO ? ` ⚠️ Está al ${estado} %: pide .service ${bien.numero}` : "";
  return cobrarJornada(e, { monto, bien, texto: `${nombre} ${alAzar(e.def.hecho)} (+${monto}`, aviso });
}

// What a shift billed goes in: the town's tax taken (said in the bracket the text left open), the town told and, with
// little safety in it, a robbery rolled for. Without a town it's just the billing.
function cobrarJornada(e, { monto, bien, texto, aviso = "" }) {
  const impuesto = cobrarImpuesto(e.chat, monto);
  const subida = facturar(e, monto, impuesto);
  registrarHecho(e.chat, "facturacion", { monto });
  let robo = "";
  // A boss with a bodyguard from the shop (lib/tienda.js) isn't robbed: then the dice aren't thrown.
  if (!tieneGuardaespaldas(e.chat, e.patron) && huboRobo(e.chat)) {
    const robado = Math.min(PUEBLO.ROBO_EMPRESA_MAX, Math.floor(e.caja * PUEBLO.ROBO_EMPRESA));
    if (robado > 0 && pagarDeCaja(e, robado)) {
      registrarHecho(e.chat, "robo_empresa", { usuario: e.patron, nombre: e.nombre, monto: robado });
      robo = `\n🥷 Y a la noche entraron a robar a *${e.nombre}*: se llevaron *${robado}* de la caja. ${npc(e.chat, "comisario").replace(/^el/, "El")} dice que está investigando, entre mate y mate.`;
    }
  }
  return { monto, bien, texto: `${texto}${impuesto ? `, ${impuesto} de impuesto municipal` : ""})${bien ? "." : ""}${aviso}${robo}`, subida };
}

// ---------- actions ----------
export function fundar(chat, usuario, nombre) {
  const genero = generoDe(usuario);
  const ya = empresaDe(chat, usuario);
  const empleo = empleoDe(chat, usuario);
  if (empleo) return { ok: false, error: `Hoy laburás para *${empleo.empresa.nombre}*: no se puede ser patrón y empleado a la vez. Primero .renunciar` };
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
    const { lastInsertRowid } = db.prepare(`INSERT INTO empresas (chat, patron, tipo, nombre, fundada, visto, categoria, categoria_max) VALUES (?, ?, ?, ?, ?, ?, 0, 0)`).run(chat, usuario, actual.laburo, limpio, ahora, ahora);
    db.prepare(`INSERT INTO empresas_bienes (empresa, bien, comprado) VALUES (?, ?, ?)`).run(lastInsertRowid, def.inicial, ahora);
    return true;
  })();
  if (!fundada) return { ok: false, error: `Fundar sale ${EMPRESA.COSTO_FUNDAR} UruCoins (escribano, DGI, BPS y un asado para el inspector) y tenés ${getSaldoCoins(chat, usuario)}.` };
  const inicial = def.bienes[def.inicial];
  registrarHecho(chat, "empresa_fundada", { usuario, nombre: limpio, tipo: actual.laburo, emoji: def.emoji });
  return {
    ok: true,
    mensaje: `${def.emoji} Nació *${limpio}*, ${def.nombre.toLowerCase()} de ${arroba(usuario)}. Pagaste ${EMPRESA.COSTO_FUNDAR} de papeles y te llevás tu primer bien: ${inicial.emoji} ${inicial.nombre}.\nLa empresa tiene su caja, aparte de tu bolsillo: lo que factura va ahí. Cada día, con tu .cobrar, además de tu sueldo laburás una jornada para ella.\nEl tablero está en .empresa, lo que se puede comprar en .bienes y la gente se contrata con .contratar.`,
    mentions: [usuario],
  };
}

export function comprarBien(chat, usuario, texto) {
  const e = miEmpresa(chat, usuario);
  if (!e) return { ok: false, error: "No tenés empresa. Se funda con .fundar <nombre>, siendo nivel 10 de tu oficio." };
  const clave = buscarBien(e.tipo, texto);
  if (!clave) return { ok: false, error: "Eso no lo vende nadie para tu rubro. Mirá la lista con .bienes" };
  const def = e.def.bienes[clave];
  const bienes = bienesDe(e);
  const categoria = categoriaEmpresa(e);
  if (def.categoria > categoria) return { ok: false, error: `${def.nombre} es para una ${CATEGORIAS[def.categoria].nombre} y *${e.nombre}* todavía es ${CATEGORIAS[categoria].nombre}: ${faltaPara(e, def.categoria)}.` };
  if (def.mejora && bienes.some((b) => b.bien === clave)) return { ok: false, error: `Ya tenés ${def.nombre}: con uno alcanza.` };
  if (bienes.length >= topeBienes(e)) return { ok: false, error: `No te entran más bienes: una ${CATEGORIAS[categoria].nombre} maneja hasta ${topeBienes(e)}. Facturá más para subir de categoría.` };
  const precio = precioDe(e, def);
  if (!pagarDeCaja(e, precio)) return { ok: false, error: `${def.nombre} sale ${precio} y en la caja de *${e.nombre}* hay ${e.caja}. Se compra con la plata de la empresa: poné con .caja depositar ${precio - e.caja}` };
  db.prepare(`INSERT INTO empresas_bienes (empresa, bien, comprado) VALUES (?, ?, ?)`).run(e.id, clave, Date.now());
  // Paid at the town's price and worth the list price: a dear town can take it down a step.
  const cambio = revisarCategoria(e);
  const para = def.mejora === "desgaste" ? "Los demás bienes se gastan menos." : def.mejora === "ingresos" ? `Todo lo que factura la empresa rinde ${Math.round(EMPRESA.MEJORA_INGRESOS * 100)} % más.` : `Rinde ${def.rinde} por jornada, si tiene quién lo trabaje.`;
  return { ok: true, mensaje: `${def.emoji} *${e.nombre}* compró: ${def.nombre}. ${def.desc}\n${para} Quedan ${e.caja} en la caja.${cambio ? `\n${cambio}` : ""}` };
}

// .service: with nothing, what each one would cost; with a number of the board, that good; with "todo", all of them
// the caja can pay, the cheapest first.
export function service(chat, usuario, texto) {
  const e = miEmpresa(chat, usuario);
  if (!e) return { ok: false, error: "No tenés empresa a la que hacerle service." };
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

// .caja depositar: from the pocket to the caja, free. For what the company is worth it counts DEPOSITO_DIAS days later.
export function depositar(chat, usuario, monto, ahora = Date.now()) {
  const e = miEmpresa(chat, usuario);
  if (!e) return { ok: false, error: "No tenés empresa donde poner plata." };
  if (!(monto > 0)) return { ok: false, error: "Decime cuánto: .caja depositar 200" };
  const hecho = db.transaction(() => {
    if (!gastarCoins(chat, usuario, monto, "empresa_deposito")) return false;
    db.prepare(`UPDATE empresas SET caja = caja + ? WHERE id = ?`).run(monto, e.id);
    db.prepare(`INSERT INTO empresas_depositos (empresa, monto, fecha) VALUES (?, ?, ?)`).run(e.id, monto, ahora);
    return true;
  })();
  if (!hecho) return { ok: false, error: `No te alcanza: tenés ${getSaldoCoins(chat, usuario)} UruCoins en el bolsillo.` };
  e.caja += monto;
  return { ok: true, mensaje: `💰 Pusiste ${monto} en la caja de *${e.nombre}*: ahora tiene ${e.caja}. A vos te quedan ${getSaldoCoins(chat, usuario)}.\n_Para la categoría, esa plata cuenta en ${plural(EMPRESA.DEPOSITO_DIAS, "día", "días")}: el escribano no firma con la tinta fresca._` };
}

// The share of what's taken out of the caja that goes in taxes.
const tasaRetiro = (e) => EMPRESA.IMPUESTO_RETIRO * (1 - EMPRESA.CONTADOR_DESCUENTO * fuerzaDe(e, "contador"));

export function retirar(chat, usuario, monto) {
  const e = miEmpresa(chat, usuario);
  if (!e) return { ok: false, error: "No tenés empresa de donde sacar plata." };
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
  if (!hecho) return { ok: false, error: `En la caja de *${e.nombre}* hay ${e.caja}. No se puede retirar lo que no hay: si le falta plata a la empresa, el banco presta a la caja (.prestamo 500 4 caja).` };
  const cambio = revisarCategoria(e);
  return { ok: true, mensaje: `💸 Retiraste ${monto} de *${e.nombre}*: ${neto} al bolsillo y ${impuesto} para la DGI (${Math.round(tasa * 100)} %). Quedan ${e.caja} en la caja y vos tenés ${getSaldoCoins(chat, usuario)}.${cambio ? `\n${cambio}` : ""}` };
}

// The owner's own shift, once a day, with their .cobrar: null if they have no company. They yield by their level in
// the company's trade, if they still have it (at level 10, +45 %).
export function jornadaDelPatron(chat, usuario) {
  const e = miEmpresa(chat, usuario);
  if (!e) return null;
  const novedades = leerNovedades(e);
  const hoy = claveDia();
  if (e.ultima_jornada === hoy) return { ok: false, error: `Hoy ya laburaste tu jornada en *${e.nombre}*.`, novedades };
  const actual = laburoDe(chat, usuario);
  const factor = actual?.laburo === e.tipo ? factorNivel(nivelDe(actual.cobros)) : 1;
  const r = trabajar(e, { factor, dia: hoy, servicio: true });
  db.prepare(`UPDATE empresas SET ultima_jornada = ? WHERE id = ?`).run(hoy, e.id);
  // A step the billing didn't give: deposited money that started counting, a loan paid, a good that wore out.
  const subida = r.subida || revisarCategoria(e);
  return { ok: true, monto: r.monto, mentions: r.mentions || [], novedades, mensaje: `${e.def.emoji} *${e.nombre}*: ${r.texto}\n💰 Caja: ${e.caja}.${subida ? `\n${subida}` : ""}${novedades ? `\n📋 Mientras no estabas:\n${novedades}` : ""}` };
}

// ---------- Claudia's own employees ----------
// Settles the days that are over for Claudia's own, up to NPC_DIAS_MAX back: each is paid from the caja and, in a
// post that works a good, takes the worst one nobody used that day (people yield more, and they went first). A day
// with no money for the wage isn't worked. Today's is settled tomorrow. What happened goes to the owner's news.
function ponerAlDia(e) {
  const npcs = empleadosDe(e).filter((x) => x.npc);
  if (!npcs.length) return;
  const hoy = momentoDe(claveDia());
  const cuenta = new Map(npcs.map((x) => [x.id, { jornadas: 0, facturado: 0, cobrado: 0, impagos: 0, extras: [] }]));
  for (let atras = EMPRESA.NPC_DIAS_MAX; atras >= 1; atras--) {
    const dia = claveDia(new Date(hoy - atras * DIA_MS));
    for (const x of npcs) {
      if (x.ultimo_cobro >= dia || claveDia(new Date(x.desde)) > dia) continue;
      const c = cuenta.get(x.id);
      x.ultimo_cobro = dia;
      if (!pagarDeCaja(e, x.sueldo)) {
        c.impagos++;
        db.prepare(`UPDATE empresas_empleados SET ultimo_cobro = ? WHERE id = ?`).run(dia, x.id);
        continue;
      }
      c.jornadas++;
      c.cobrado += x.sueldo;
      db.prepare(`UPDATE empresas_empleados SET ultimo_cobro = ?, cobros = cobros + 1 WHERE id = ?`).run(dia, x.id);
      if (x.def.tipo !== "operario") continue;
      const r = trabajar(e, { factor: EMPRESA.NPC_RINDE, dia, peor: true });
      c.facturado += r.monto;
      if (r.roto) c.extras.push(`💥 A ${x.nombre} se le rompió ${r.bien.def.nombre} (.service ${r.bien.numero}).`);
      if (r.subida) c.extras.push(r.subida);
    }
  }
  for (const x of npcs) {
    const c = cuenta.get(x.id);
    const puesto = nombrePuesto(x.def);
    if (c.jornadas) anotar(e, `🤖 ${x.nombre} (${puesto}): ${plural(c.jornadas, "jornada", "jornadas")}${x.def.tipo === "operario" ? `, facturó ${c.facturado}` : ""} y cobró ${c.cobrado}.`);
    if (c.impagos) anotar(e, `🤖 ${x.nombre} (${puesto}) no laburó ${plural(c.impagos, "día", "días")}: no había caja para su sueldo (${x.sueldo}).`);
    for (const linea of c.extras) anotar(e, linea);
  }
}

// The owner's company for something they do with it: settled, and with them marked as seen.
function miEmpresa(chat, usuario) {
  const e = empresaDe(chat, usuario);
  if (!e) return null;
  ponerAlDia(e);
  marcarVisto(e);
  return e;
}

// ---------- hiring ----------
const SIN_EMPRESA_PARA_CONTRATAR = "Para contratar hay que ser patrón: primero .fundar <nombre>.";
const puestosLibres = (e) => CATEGORIAS[categoriaEmpresa(e)].puestos - empleadosDe(e).length;

// Why a post can't take anyone now, or null.
function sinLugar(e, clave) {
  const def = puestosDe(e)[clave];
  const categoria = CATEGORIAS[categoriaEmpresa(e)];
  if (puestosLibres(e) <= 0) return `No hay puestos libres: una ${categoria.nombre} tiene ${categoria.puestos}. Facturá para subir de categoría, o despedí a alguien (.despedir).`;
  if (def.tipo !== "operario" && empleadosDe(e).some((x) => x.puesto === clave)) return `*${e.nombre}* ya tiene quien haga de ${def.nombre.toLowerCase()}: de ese puesto hay uno solo.`;
  return null;
}

// The offers still standing in a group (the old ones are dropped), each with its company.
function ofertasDe(chat) {
  db.prepare(`DELETE FROM empresas_ofertas WHERE fecha < ?`).run(Date.now() - EMPRESA.OFERTA_HORAS * 3600e3);
  return db.prepare(`SELECT o.* FROM empresas_ofertas o JOIN empresas e ON e.id = o.empresa WHERE e.chat = ? ORDER BY o.fecha ASC`).all(chat).map((o) => ({ ...o, empresa: empresaPorId(o.empresa) })).filter((o) => o.empresa && puestosDe(o.empresa)[o.puesto]);
}
const borrarOferta = (o) => db.prepare(`DELETE FROM empresas_ofertas WHERE empresa = ? AND usuario = ?`).run(o.empresa.id, o.usuario);

// Why someone can't be taken on (by anyone, or by this company), or null.
function noContratable(e, usuario) {
  if (usuario === e.patron) return "Vos ya laburás gratis para tu empresa. No te podés contratar.";
  const suya = empresaDe(e.chat, usuario);
  if (suya) return `${arroba(usuario)} es patrón de *${suya.nombre}*: no labura para nadie.`;
  const empleo = empleoDe(e.chat, usuario);
  if (empleo) return empleo.empresa.id === e.id ? `${arroba(usuario)} ya labura para vos, de ${nombrePuesto(empleo.def, usuario)}.` : `${arroba(usuario)} ya labura en *${empleo.empresa.nombre}*. Hasta que no renuncie, no se toca.`;
  return null;
}

// .contratar @persona puesto sueldo: an offer, for the other one to sign, haggle or turn down.
export function ofrecer(chat, patron, usuario, puestoTexto, sueldo) {
  const e = miEmpresa(chat, patron);
  if (!e) return { ok: false, error: SIN_EMPRESA_PARA_CONTRATAR };
  const clave = buscarPuesto(e, puestoTexto);
  if (!clave) return { ok: false, error: `Ese puesto no existe en *${e.nombre}*. Los que hay: ${Object.keys(puestosDe(e)).join(", ")} (.puestos los explica).` };
  const def = puestosDe(e)[clave];
  const no = noContratable(e, usuario) || sinLugar(e, clave);
  if (no) return { ok: false, error: no, mentions: [usuario] };
  const tope = def.sueldo * EMPRESA.SUELDO_MAX_VECES;
  if (!(sueldo >= 1)) return { ok: false, error: `Falta el sueldo por día: .contratar @persona ${clave} ${def.sueldo} (por ahí anda el sueldo de plaza).` };
  if (sueldo > tope) return { ok: false, error: `Tampoco la pavada: por ${def.nombre.toLowerCase()} se paga hasta ${tope} por día.` };
  db.prepare(`INSERT INTO empresas_ofertas (empresa, usuario, puesto, sueldo, turno, fecha) VALUES (?, ?, ?, ?, 'empleado', ?) ON CONFLICT(empresa, usuario) DO UPDATE SET puesto = excluded.puesto, sueldo = excluded.sueldo, turno = 'empleado', fecha = excluded.fecha`).run(e.id, usuario, clave, sueldo, Date.now());
  const nivel = nivelEnPuesto(chat, usuario, clave);
  return {
    ok: true,
    mensaje: `🤝 ${arroba(patron)} le ofrece a ${arroba(usuario)} el puesto de *${nombrePuesto(def, usuario)}* en *${e.nombre}*, por ${sueldo} UruCoins por día (el sueldo de plaza anda en ${def.sueldo})${nivel > 1 ? `. Ya es nivel ${nivel} en eso` : ""}.\n${arroba(usuario)}: .firmar acepta, .contraoferta ${Math.max(sueldo + 5, Math.round(sueldo * 1.25))} regatea y .rechazaroferta la tira abajo. Vale ${EMPRESA.OFERTA_HORAS} horas.`,
    mentions: [patron, usuario],
  };
}

// .contratar claudia puesto: one of Claudia's own, taken on right away.
export function contratarNPC(chat, patron, puestoTexto) {
  const e = miEmpresa(chat, patron);
  if (!e) return { ok: false, error: SIN_EMPRESA_PARA_CONTRATAR };
  const clave = buscarPuesto(e, puestoTexto);
  if (!clave) return { ok: false, error: `Decime para qué puesto: .contratar claudia ${Object.keys(e.def.puestos)[0]}. Los que hay: ${Object.keys(puestosDe(e)).join(", ")}.` };
  const no = sinLugar(e, clave);
  if (no) return { ok: false, error: no };
  const def = puestosDe(e)[clave];
  const usados = new Set(empleadosDe(e).map((x) => x.nombre));
  const libres = NOMBRES_NPC.filter((n) => !usados.has(n));
  const nombre = libres.length ? alAzar(libres) : `${alAzar(NOMBRES_NPC)} ${usados.size + 1}`;
  const sueldo = sueldoNPC(def);
  db.prepare(`INSERT INTO empresas_empleados (empresa, usuario, nombre, puesto, sueldo, desde) VALUES (?, '', ?, ?, ?, ?)`).run(e.id, nombre, clave, sueldo, Date.now());
  return { ok: true, mensaje: `🤖 Te mando a ${nombre}, de los míos, de *${def.nombre.toLowerCase()}* en *${e.nombre}*: cobra ${sueldo} por día de la caja, rinde el ${Math.round(EMPRESA.NPC_RINDE * 100)} % de una persona, no sube de nivel y rinde cuentas al otro día. Si no hay caja, ese día no labura. Una persona del grupo te sale mejor, pero bueno.` };
}
const sueldoNPC = (def) => Math.ceil(def.sueldo * EMPRESA.NPC_SUELDO);

// An offer becomes a job, if it still can.
function concretar(o) {
  const e = o.empresa;
  const def = puestosDe(e)[o.puesto];
  const no = noContratable(e, o.usuario) || sinLugar(e, o.puesto);
  if (no) return { ok: false, error: no, mentions: [o.usuario] };
  db.transaction(() => {
    db.prepare(`INSERT INTO empresas_empleados (empresa, usuario, puesto, sueldo, desde) VALUES (?, ?, ?, ?, ?)`).run(e.id, o.usuario, o.puesto, o.sueldo, Date.now());
    // Hired: whatever else they'd been offered in the group falls.
    db.prepare(`DELETE FROM empresas_ofertas WHERE usuario = ? AND empresa IN (SELECT id FROM empresas WHERE chat = ?)`).run(o.usuario, e.chat);
    // And they're no longer on the job board as looking for work (lib/bolsa.js).
    db.prepare(`DELETE FROM bolsa_disponibles WHERE chat = ? AND usuario = ?`).run(e.chat, o.usuario);
  })();
  const nivel = nivelEnPuesto(e.chat, o.usuario, o.puesto);
  return {
    ok: true,
    mensaje: `✍️ Firmado: ${arroba(o.usuario)} es *${nombrePuesto(def, o.usuario)}* de *${e.nombre}* por ${o.sueldo} UruCoins por día${nivel > 1 ? `, y arranca de nivel ${nivel} por lo que ya traía` : ""}.\nDesde ahora su .cobrar lo paga la caja de la empresa (no yo) y su jornada le factura a ${arroba(e.patron)}. Si se cansa, .renunciar; si se cansan de ${generoDe(o.usuario) === "mujer" ? "ella" : "él"}, .despedir.`,
    mentions: [o.usuario, e.patron],
  };
}

const listaDeOfertas = (ofertas) => ofertas.map((o) => `• *${o.empresa.nombre}* (${arroba(o.empresa.patron)}): ${nombrePuesto(puestosDe(o.empresa)[o.puesto], o.usuario)} por ${o.sueldo}`).join("\n");

// .firmar: whoever was offered a job takes it; and an owner, with .firmar @persona, takes what that person asked for.
export function firmar(chat, usuario, otro = null) {
  const ofertas = ofertasDe(chat);
  const mias = ofertas.filter((o) => o.usuario === usuario && o.turno === "empleado" && (!otro || o.empresa.patron === otro));
  if (mias.length > 1) return { ok: false, error: `Tenés ${mias.length} ofertas, qué momento. Decime cuál firmás, con .firmar @patrón:\n${listaDeOfertas(mias)}`, mentions: mias.map((o) => o.empresa.patron) };
  if (mias.length === 1) return concretar(mias[0]);
  const e = miEmpresa(chat, usuario);
  const pedidas = e ? ofertas.filter((o) => o.empresa.id === e.id && o.turno === "patron" && (!otro || o.usuario === otro)) : [];
  if (pedidas.length > 1) return { ok: false, error: `Tenés ${pedidas.length} contraofertas: decime cuál firmás, con .firmar @persona.` };
  if (pedidas.length === 1) return concretar(pedidas[0]);
  const esperando = ofertas.find((o) => o.usuario === usuario && o.turno === "patron");
  if (esperando) return { ok: false, error: `Tu contraoferta a *${esperando.empresa.nombre}* está en manos del patrón: le toca firmar a ${arroba(esperando.empresa.patron)}.`, mentions: [esperando.empresa.patron] };
  return { ok: false, error: "No tenés ninguna oferta de laburo para firmar. Las que haya se ven con .ofertas" };
}

// .contraoferta 50: whoever was offered a job asks for another wage; now it's the owner's move.
export function contraofertar(chat, usuario, sueldo, otro = null) {
  const mias = ofertasDe(chat).filter((o) => o.usuario === usuario && (!otro || o.empresa.patron === otro));
  if (!mias.length) return { ok: false, error: "No tenés ninguna oferta de laburo a la que contestarle." };
  if (mias.length > 1) return { ok: false, error: `Tenés ${mias.length} ofertas: decime a cuál le contestás, con .contraoferta 50 @patrón:\n${listaDeOfertas(mias)}`, mentions: mias.map((o) => o.empresa.patron) };
  const o = mias[0];
  const def = puestosDe(o.empresa)[o.puesto];
  const tope = def.sueldo * EMPRESA.SUELDO_MAX_VECES;
  if (!(sueldo >= 1)) return { ok: false, error: "Decime cuánto querés por día: .contraoferta 50" };
  if (sueldo > tope) return { ok: false, error: `Soñar es gratis, pero por ${def.nombre.toLowerCase()} se paga hasta ${tope} por día.` };
  if (sueldo === o.sueldo && o.turno === "empleado") return { ok: false, error: "Eso es lo mismo que te ofrecieron: si te sirve, .firmar" };
  db.prepare(`UPDATE empresas_ofertas SET sueldo = ?, turno = 'patron', fecha = ? WHERE empresa = ? AND usuario = ?`).run(sueldo, Date.now(), o.empresa.id, usuario);
  const patron = o.empresa.patron;
  return {
    ok: true,
    mensaje: `💬 ${arroba(usuario)} regatea: quiere ${sueldo} por día para ser ${nombrePuesto(def, usuario)} de *${o.empresa.nombre}*${o.turno === "empleado" ? ` (le habían ofrecido ${o.sueldo})` : ""}.\n${arroba(patron)}: .firmar ${arroba(usuario)} acepta, .contratar ${arroba(usuario)} ${o.puesto} ${Math.round((sueldo + o.sueldo) / 2)} le ofrece otra cosa y .rechazaroferta ${arroba(usuario)} corta la charla.`,
    mentions: [usuario, patron],
  };
}

// .rechazaroferta: whoever was offered a job turns it down (all of them, without naming one); and an owner, with
// .rechazaroferta @persona, takes back what they offered that person or turns down what they asked for.
export function rechazarOferta(chat, usuario, otro = null) {
  const ofertas = ofertasDe(chat);
  const mias = ofertas.filter((o) => o.usuario === usuario && (!otro || o.empresa.patron === otro));
  if (mias.length) {
    mias.forEach(borrarOferta);
    return { ok: true, mensaje: `🙅 ${arroba(usuario)} no firma: ${mias.map((o) => `la oferta de *${o.empresa.nombre}*`).join(" y ")} quedó en nada. ${mias.map((o) => arroba(o.empresa.patron)).join(", ")}, a seguir buscando.`, mentions: [usuario, ...mias.map((o) => o.empresa.patron)] };
  }
  const e = empresaDe(chat, usuario);
  const dadas = e ? ofertas.filter((o) => o.empresa.id === e.id && (!otro || o.usuario === otro)) : [];
  if (dadas.length > 1) return { ok: false, error: `Tenés ${dadas.length} ofertas dando vueltas: decime cuál bajás, con .rechazaroferta @persona.` };
  if (dadas.length === 1) {
    borrarOferta(dadas[0]);
    return { ok: true, mensaje: `🙅 *${e.nombre}* bajó la oferta: ${arroba(dadas[0].usuario)}, no fue esta vez.`, mentions: [dadas[0].usuario] };
  }
  return { ok: false, error: "No hay ninguna oferta de laburo que rechazar." };
}

// ---------- leaving ----------
// The severance pay: one wage, plus one for every INDEMNIZACION_CADA shifts worked in the company, with a cap.
export const indemnizacionDe = (empleado) => empleado.sueldo * Math.min(EMPRESA.INDEMNIZACION_TOPE, 1 + Math.floor(empleado.cobros / EMPRESA.INDEMNIZACION_CADA));

// .despedir @persona, or .despedir 2 with the number the board shows (the only way to name one of Claudia's).
export function despedir(chat, patron, { usuario = null, numero = null } = {}) {
  const e = miEmpresa(chat, patron);
  if (!e) return { ok: false, error: "No tenés empresa, así que tampoco a quién despedir." };
  const empleado = empleadosDe(e).find((x) => (usuario ? x.usuario === usuario : x.numero === numero));
  if (!empleado) return { ok: false, error: usuario ? `${arroba(usuario)} no labura en *${e.nombre}*.` : `No sé a quién: .despedir @persona, o .despedir 2 con el número que tiene en .empresa`, mentions: usuario ? [usuario] : [] };
  const monto = indemnizacionDe(empleado);
  const puesto = nombrePuesto(empleado.def, empleado.usuario);
  const hecho = db.transaction(() => {
    if (!pagarDeCaja(e, monto)) return false;
    if (!empleado.npc) ganarCoins(chat, empleado.usuario, monto, "empresa_indemnizacion");
    db.prepare(`DELETE FROM empresas_empleados WHERE id = ?`).run(empleado.id);
    return true;
  })();
  if (!hecho) return { ok: false, error: `Despedir a ${empleado.npc ? empleado.nombre : arroba(empleado.usuario)} sale ${monto} de indemnización (${plural(empleado.cobros, "jornada", "jornadas")} en la empresa) y en la caja hay ${e.caja}. Echar sale caro: .caja depositar ${monto - e.caja}`, mentions: empleado.npc ? [] : [empleado.usuario] };
  if (empleado.npc) return { ok: true, mensaje: `📦 ${empleado.nombre} dejó de ser ${puesto} de *${e.nombre}*. Se llevó ${monto} de indemnización y me lo devolvés con la autoestima por el piso. Caja: ${e.caja}.` };
  return { ok: true, mensaje: `📦 ${arroba(empleado.usuario)}, estás ${concordar("despedido", generoDe(empleado.usuario))}: ya no sos ${puesto} de *${e.nombre}*. Te llevás ${monto} UruCoins de indemnización (por ${plural(empleado.cobros, "jornada", "jornadas")}) y lo que aprendiste. Caja de la empresa: ${e.caja}.`, mentions: [empleado.usuario] };
}

// .renunciar, for whoever works in a company: they leave the post and keep what they learned. null with no post.
export function renunciarAlPuesto(chat, usuario) {
  const empleo = empleoDe(chat, usuario);
  if (!empleo) return null;
  db.prepare(`DELETE FROM empresas_empleados WHERE id = ?`).run(empleo.id);
  const puesto = nombrePuesto(empleo.def, usuario);
  anotar(empleo.empresa, `🚪 ${nombreDe(usuario)} renunció: ya no es ${puesto}.`);
  return { ok: true, mensaje: `🚪 ${arroba(usuario)} renunció a su puesto de ${puesto} en *${empleo.empresa.nombre}*. Indemnización no hay (te fuiste vos), pero la experiencia te la llevás: nivel ${nivelEnPuesto(chat, usuario, empleo.puesto)} de ${puesto}.\nTu oficio sigue como estaba; si también lo querés dejar, .renunciar de nuevo. ${arroba(empleo.empresa.patron)}, a buscar gente.`, mentions: [usuario, empleo.empresa.patron] };
}

// ---------- an employee's payday ----------
const cobroDeEmpleadoHoy = (chat, usuario, hoy) => Boolean(db.prepare(`SELECT 1 FROM empresas_experiencia WHERE chat = ? AND usuario = ? AND ultimo_cobro = ?`).get(chat, usuario, hoy));

// Whether they were already paid today as somebody's employee: the trade's wage (lib/laburos.js) is the other way
// to be paid in a day, and it's one or the other.
export const yaCobroComoEmpleado = (chat, usuario) => cobroDeEmpleadoHoy(chat, usuario, claveDia());

// .cobrar for whoever works in a company: the wage comes from the company's caja, not from the bot, and their shift
// bills for the company. null with no post (the trade's wage, as always). With no money in the caja for the wage,
// { ok: false, sinCaja: true, aviso }: the plugin pays them their trade's wage instead, and the company bills nothing.
export function cobrarComoEmpleado(chat, usuario) {
  const empleo = empleoDe(chat, usuario);
  if (!empleo) return null;
  const e = empleo.empresa;
  ponerAlDia(e);
  const hoy = claveDia();
  const puesto = nombrePuesto(empleo.def, usuario);
  const delOficio = db.prepare(`SELECT ultimo_cobro FROM laburos WHERE chat = ? AND usuario = ?`).get(chat, usuario);
  if (cobroDeEmpleadoHoy(chat, usuario, hoy) || delOficio?.ultimo_cobro === hoy) return { ok: false, error: `Ya cobraste hoy. El sueldo es una vez por día, ${puesto}.` };
  if (e.caja < empleo.sueldo) {
    anotar(e, `⚠️ ${nombreDe(usuario)} (${puesto}) vino a laburar y no había caja para su sueldo (${empleo.sueldo}).`);
    return { ok: false, sinCaja: true, aviso: `😬 En la caja de *${e.nombre}* no hay para tu sueldo de ${puesto} (${empleo.sueldo}): ${arroba(e.patron)}, poné plata (.caja depositar). Hoy la empresa no factura y vos cobrás por tu oficio, si tenés.`, mentions: [e.patron] };
  }

  const cobros = experienciaDe(chat, usuario, empleo.puesto);
  const nivel = nivelDe(cobros);
  const r = db.transaction(() => {
    pagarDeCaja(e, empleo.sueldo);
    ganarCoins(chat, usuario, empleo.sueldo, "empresa_sueldo");
    db.prepare(`INSERT INTO empresas_experiencia (chat, usuario, puesto, cobros, ultimo_cobro) VALUES (?, ?, ?, 1, ?) ON CONFLICT(chat, usuario, puesto) DO UPDATE SET cobros = cobros + 1, ultimo_cobro = excluded.ultimo_cobro`).run(chat, usuario, empleo.puesto, hoy);
    db.prepare(`UPDATE empresas_empleados SET cobros = cobros + 1, ultimo_cobro = ? WHERE id = ?`).run(hoy, empleo.id);
    // Paid for the day: the trade's wage waits for tomorrow too.
    db.prepare(`UPDATE laburos SET ultimo_cobro = ? WHERE chat = ? AND usuario = ?`).run(hoy, chat, usuario);
    return empleo.def.tipo === "operario" ? trabajar(e, { factor: factorNivel(nivel), dia: hoy, servicio: true }) : { monto: 0, texto: `${JORNADA_SIN_BIEN[empleo.def.tipo]}.`, subida: "" };
  })();

  anotar(e, `👷 ${nombreDe(usuario)} (${puesto})${empleo.def.tipo === "operario" ? ` facturó ${r.monto} y` : ""} cobró ${empleo.sueldo}.${r.roto ? ` 💥 Se le rompió ${r.bien.def.nombre} (.service ${r.bien.numero}).` : ""}`);
  if (r.subida) anotar(e, r.subida);
  const nivelNuevo = nivelDe(cobros + 1);
  const pct = (n) => Math.round((factorNivel(n) - 1) * 100);
  const subida = nivelNuevo > nivel ? `\n⬆️ Subiste a nivel ${nivelNuevo} de ${puesto}: rendís +${pct(nivelNuevo)} %${nivelNuevo >= LABURO.NIVEL_MAX ? ", el máximo" : ""}. Buen momento para pedir aumento.` : "";
  const mitad = sinPatron(e) ? `\n😴 ${arroba(e.patron)} no aparece hace días y no hay gerente: la empresa factura la mitad.` : "";
  return {
    ok: true,
    monto: r.monto,
    mensaje: `${e.def.emoji} Jornada de ${puesto}${nivel > 1 ? ` nv.${nivel}` : ""} en *${e.nombre}*: ${r.texto}\n🪙 Cobraste *${empleo.sueldo} UruCoins* de sueldo, de la caja de ${arroba(e.patron)}. Tenés ${getSaldoCoins(chat, usuario)}.${subida}${mitad}${r.subida ? `\n${r.subida}` : ""}`,
    mentions: [e.patron, ...(r.mentions || [])],
  };
}

// ---------- texts ----------
const lineaBien = (e, b) => {
  if (b.def.mejora) return `${b.numero}. ${b.def.emoji} ${b.def.nombre} — mejora`;
  const costo = costoService(e, b);
  const estado = b.roto ? `roto 💥 (.service ${b.numero}: ${costo})` : b.estado < EMPRESA.SERVICE_ATRASADO ? `${b.estado} % ⚠️ service atrasado (.service ${b.numero}: ${costo})` : `${b.estado} %`;
  return `${b.numero}. ${b.def.emoji} ${b.def.nombre} — ${estado} · rinde ${b.def.rinde}`;
};

// What a company still needs for a category: "le falta facturar 1500 o valer 5000 (hoy vale 1200)".
function faltaPara(e, i) {
  const c = CATEGORIAS[i];
  return `le falta facturar ${c.desde - e.facturado} o valer ${c.valor} (hoy vale ${valorDeEmpresa(e).total})`;
}

// The category line of the board: the category, what it billed, what it's worth and what the next one asks for; and,
// for its owner (propio), the money deposited that doesn't count yet and the debts taken off.
function textoCategoria(e, propio = false) {
  const v = valorDeEmpresa(e);
  const i = Math.max(categoriaDe(e.facturado), categoriaPorValor(v.total));
  const sigue = CATEGORIAS[i + 1];
  const porValor = categoriaDe(e.facturado) < i ? " (por lo que vale)" : "";
  const linea = `🏷️ ${CATEGORIAS[i].nombre}${porValor} · facturó ${e.facturado} · vale ${v.total}${sigue ? ` (para ${sigue.nombre}: facturar ${sigue.desde} o valer ${sigue.valor})` : ", lo más alto que hay"}`;
  if (!propio) return linea;
  const espera = v.reciente ? `\n⏳ ${v.reciente} que pusiste en la caja cuentan para el valor desde el ${diaYHora(v.cuenta)}` : "";
  const deuda = v.deuda ? `\n🏦 Al valor se le descuentan ${v.deuda} que debe ${nombreDe(e.patron)}` : "";
  return `${linea}${espera}${deuda}`;
}
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const diaYHora = (ms) => {
  const d = new Date(ms);
  return `${DIAS_SEMANA[d.getDay()]} ${d.getDate()} a las ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// The board: .empresa. For its owner (propio) it shows the news too, and they count as read.
export function textoEmpresa(e, { propio = false } = {}) {
  if (propio) ponerAlDia(e);
  const cambio = propio ? revisarCategoria(e) : "";
  const frenada = sinPatron(e);
  const bienes = bienesDe(e);
  const personal = empleadosDe(e);
  const puestos = CATEGORIAS[categoriaEmpresa(e)].puestos;
  const ofertas = ofertasDe(e.chat).filter((o) => o.empresa.id === e.id);
  const novedades = propio ? leerNovedades(e) : "";
  if (propio) marcarVisto(e);
  const lineaEmpleado = (x) => `${x.numero}. ${x.npc ? "🤖 " : ""}${x.como} — ${nombrePuesto(x.def, x.usuario)}${x.npc ? "" : ` nv.${x.nivel}`} · ${x.sueldo}/día${x.npc ? " (de Claudia)" : x.presente ? "" : " 💤 hace días que no viene"}`;
  const lineaOferta = (o) => `${nombreDe(o.usuario)} (${nombrePuesto(puestosDe(e)[o.puesto], o.usuario)}, ${o.turno === "patron" ? `pide ${o.sueldo}` : `le ofrecieron ${o.sueldo}`})`;
  const partes = [
    `${e.def.emoji} *${e.nombre}* — ${e.def.nombre.toLowerCase()} de ${nombreDe(e.patron)}\n${textoCategoria(e, propio)}\n💰 Caja: ${e.caja} UruCoins`,
    `🔩 *Bienes* (${bienes.length} de ${topeBienes(e)})\n${bienes.map((b) => lineaBien(e, b)).join("\n")}`,
  ];
  partes.push(`👥 *Personal* (${personal.length} de ${puestos} puestos)\n${personal.length ? personal.map(lineaEmpleado).join("\n") : "Nadie todavía: el patrón solo, como en los comienzos."}${ofertas.length ? `\n_Ofertas en el aire: ${ofertas.map(lineaOferta).join("; ")}_` : ""}`);
  if (cambio) partes.push(cambio);
  if (frenada) partes.push(`😴 El patrón no aparece hace más de ${EMPRESA.AUSENCIA_DIAS} días y no hay gerente: la empresa factura la mitad.`);
  if (novedades) partes.push(`📋 *Novedades*\n${novedades}`);
  if (propio) partes.push("_.bienes: qué comprar · .puestos: a quién contratar · .caja depositar 100 / retirar 100 · .service: arreglos · .despedir 1_");
  return partes.join("\n\n");
}

// .bienes: what a company of that trade can buy, and what each category opens.
export function textoBienes(e) {
  const categoria = categoriaEmpresa(e);
  const lineas = Object.entries(e.def.bienes).map(([clave, b]) => {
    const que = b.mejora === "desgaste" ? "mejora: todo se gasta menos" : b.mejora === "ingresos" ? `mejora: +${Math.round(EMPRESA.MEJORA_INGRESOS * 100)} % de facturación` : `rinde ${b.rinde} por jornada`;
    const candado = b.categoria > categoria ? ` 🔒 desde ${CATEGORIAS[b.categoria].nombre}` : "";
    return `${b.emoji} *${b.nombre}* — ${precioDe(e, b)} · ${que}${candado} · .comprar ${clave}\n${b.desc}`;
  });
  const categorias = CATEGORIAS.map((c, i) => `${c.nombre} (${i ? `desde ${c.desde} facturados o ${c.valor} de valor` : "de entrada"}: ${c.puestos} puestos, ${c.puestos + 1} bienes)`).join(" → ");
  return `🛒 *Bienes para ${e.def.nombre.toLowerCase()}* (caja de ${e.nombre}: ${e.caja})\n\n${lineas.join("\n\n")}\n\nSe pagan de la caja. Cada bien de trabajo hace una jornada por día si alguien lo trabaja, y cada jornada lo gasta ${EMPRESA.DESGASTE_USO} %: por debajo del ${EMPRESA.SERVICE_ATRASADO} % se puede romper, y arreglarlo roto sale el doble.\nCategorías: ${categorias}. El valor es la caja más los bienes (gastados valen menos), menos lo que debe el patrón; lo depositado cuenta a los ${plural(EMPRESA.DEPOSITO_DIAS, "día", "días")}, y si el valor baja, la categoría que dio baja con él.`;
}

// .puestos: a company's posts, what each does and what it pays.
export function textoPuestos(e) {
  const categoria = CATEGORIAS[categoriaEmpresa(e)];
  const lineas = Object.entries(puestosDe(e)).map(([clave, p]) => `*${p.nombre}* — ${QUE_HACE[p.tipo]()}. Sueldo de plaza: ${p.sueldo}; de los de Claudia, ${sueldoNPC(p)} · .contratar @persona ${clave} ${p.sueldo}`);
  return `👥 *Puestos de ${e.nombre}* (${empleadosDe(e).length} de ${categoria.puestos} ocupados, por ser ${categoria.nombre})\n\n${lineas.join("\n\n")}\n\nA una persona del grupo se le ofrece con .contratar @persona <puesto> <sueldo por día>: firma con .firmar, regatea con .contraoferta 50 o la rechaza con .rechazaroferta. Su .cobrar de cada día lo paga la caja de la empresa, y con cada jornada sube de nivel en el puesto (+${Math.round(LABURO.NIVEL_BONUS * 100)} % por nivel).\nSi no hay gente, .contratar claudia <puesto> te manda a uno de los míos: rinde el ${Math.round(EMPRESA.NPC_RINDE * 100)} %, cobra ${Math.round((EMPRESA.NPC_SUELDO - 1) * 100)} % más que el sueldo de plaza y no sube de nivel.\nDe ${Object.values(e.def.puestos).find((p) => p.tipo === "operario").nombre.toLowerCase()} entran los que den los puestos, cada uno con un bien para trabajar; de los demás, uno solo. .despedir @persona (o .despedir 2, con su número del tablero) paga indemnización de la caja: un sueldo, más uno cada ${EMPRESA.INDEMNIZACION_CADA} jornadas, hasta ${EMPRESA.INDEMNIZACION_TOPE}.`;
}

// .ofertas: the job offers someone has on the table, received and (as an owner) made.
export function textoOfertas(chat, usuario) {
  const ofertas = ofertasDe(chat);
  const mias = ofertas.filter((o) => o.usuario === usuario);
  const e = empresaDe(chat, usuario);
  const dadas = e ? ofertas.filter((o) => o.empresa.id === e.id) : [];
  if (!mias.length && !dadas.length) return "📭 No tenés ofertas de laburo dando vueltas. Los patrones del grupo están en .empresas";
  const partes = [];
  if (mias.length) partes.push(`📨 *Te ofrecieron*\n${mias.map((o) => `• *${o.empresa.nombre}* (${nombreDe(o.empresa.patron)}): ${nombrePuesto(puestosDe(o.empresa)[o.puesto], usuario)} por ${o.sueldo} por día${o.turno === "patron" ? " — eso pediste vos, falta que firme el patrón" : ""}`).join("\n")}\n.firmar acepta, .contraoferta 50 regatea y .rechazaroferta las baja.`);
  if (dadas.length) partes.push(`📤 *Ofreciste*\n${dadas.map((o) => `• ${nombreDe(o.usuario)}: ${nombrePuesto(puestosDe(e)[o.puesto], o.usuario)} por ${o.sueldo}${o.turno === "patron" ? " — es lo que pide: .firmar @persona acepta" : ""}`).join("\n")}`);
  return partes.join("\n\n");
}

// .empresas: the group's companies, the one that billed most first.
export function textoEmpresas(chat) {
  const lista = empresasDelGrupo(chat);
  if (!lista.length) return `🏭 Acá todavía no hay ni un patrón. Con nivel ${EMPRESA.NIVEL_FUNDAR} de ${Object.keys(EMPRESAS).map((k) => OFICIOS[k].nombre.toLowerCase()).join(", ")} y ${EMPRESA.COSTO_FUNDAR} UruCoins se funda una: .fundar <nombre>`;
  return `🏭 *Empresas del grupo*\n${lista.map((e, i) => `${i + 1}. ${e.def.emoji} *${e.nombre}* — ${nombreDe(e.patron)} · ${CATEGORIAS[categoriaEmpresa(e)].nombre} · facturó ${e.facturado}`).join("\n")}\nPara laburar en una, que su patrón te haga una oferta (.contratar): las tuyas están en .ofertas`;
}

// What .fundar says with no name: what it takes.
export const textoFundar = () =>
  `🏭 *Fundar una empresa*\nHay que ser nivel ${EMPRESA.NIVEL_FUNDAR} del oficio y tener ${EMPRESA.COSTO_FUNDAR} UruCoins. Por ahora: ${Object.keys(EMPRESAS).map((k) => `${OFICIOS[k].nombre.toLowerCase()} → ${EMPRESAS[k].nombre}`).join(", ")}.\nSe funda con .fundar <nombre>, por ejemplo .fundar Transportes Feijó`;
