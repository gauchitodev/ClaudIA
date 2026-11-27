// The town (el pueblo): each group that switches it on (.pueblo on, off by default) gets a small world of its own, a
// town with a name, a founding year, places and people of its own (the comisario, the cura, the almacenera, the
// usurero, the viejo del boliche and an intendente while the group elects no one), where everything else happens: the
// trades and their payday scenes, the companies, the changas, the secret missions, the urgent errands, the timba.
// It has a state everything moves and everything reads: prosperity, safety, the town's mood, the season and the
// weather (the real season, by the date), the tax the intendente (elected once a month, lib/elecciones.js) sets and the events running (a storm, the town's
// party, a transport strike, a multinational arriving, a dollar crisis, a football championship, a bank robbery, a
// drought), at most one new one a day and each for a few days.
// The other modules talk to it through a small API: estadoDe(chat), registrarHecho(chat, tipo, datos),
// eventosActivos(chat) and modificador(chat, clave). With the town off, or the group's economy off, every modifier is
// neutral (a factor of 1, no points, no robberies, no tax) and registrarHecho does nothing: each module works exactly
// as it did before. What gets registered moves the state and is the stuff of the Sunday paper (lib/pueblo-diario.js).
// The people of the town remember: the comisario knows who bribed and who got caught, the usurero who lost it all.
// Every number is in PUEBLO, HECHOS and EVENTOS. The tables are in database-schema.js.
import { randomInt } from "crypto";
import { db, getChat, chatsConOpcion, periodoCerrado, marcarPeriodoCerrado, crearPendiente, totalMensajesEntre, mensajesPorHora, crearMercado, apuestasDeMercado, topCoins } from "../database-functions.js";
import { laburoDe, nivelDe, OFICIOS, nombreDeOficio } from "./laburos.js";
import { generoDe } from "./genero.js";
import { claveDia } from "./actividad.js";
import { nombreDe } from "./menciones.js";

export const PUEBLO = {
  NOMBRE_MAX: 30,
  // the numbers, each from 0 to 100
  REPOSO: 50, // where each one rests
  DERIVA: 0.15, // each day each number goes this share of the way back to its rest
  // what they do
  SUELDO_PROSPERIDAD: 0.15, // at prosperity 100 wages, billing and prices are this much higher; at 0, this much lower
  ROBO_SEGURIDAD: 50, // under this safety there are robberies...
  ROBO_MAX: 20, // ...up to this % at safety 0 (each shift of a company, each errand that went well)
  ROBO_TOPE: 30, // with the events, never more than this %
  ROBO_EMPRESA: 0.15, // a robbery takes this share of a company's cash box...
  ROBO_EMPRESA_MAX: 300, // ...up to this
  ROBO_ENCARGO: 0.5, // and this share of an errand's prize
  FACTURACION_PASO: 250, // every this many coins a company bills raise prosperity a point
  // the tax and the town's coffers (las arcas)
  IMPUESTO_INICIAL: 10, // % of what the companies bill that goes to the town
  IMPUESTO_MIN: 0,
  IMPUESTO_MAX: 25,
  IMPUESTO_CADA_DIAS: 7, // the intendente changes it once a week at most
  OBRA_COSTO: 400, // with this much in the coffers, the intendencia does some public work (+OBRA_PUNTOS)
  OBRA_PUNTOS: 4,
  // the events
  EVENTO_CHANCE: 35, // % of the days a new one is rolled for, where there's room for it
  EVENTOS_MAX: 2, // running at once
  DESDE_HORA: 10, // they're announced from 10:00 to 20:59
  HASTA_HORA: 21,
  MENSAJES_AYER: 30, // messages the group needs from the day before for one to be scheduled
  VIVO_MENSAJES: 5, // and in this hour and the one before for it to start: no news to an empty room
  // what's kept
  HECHOS_DIAS: 42,
  COMISARIO_JUNA: 2, // times the comisario has to have caught someone for him to treat them as a regular
  COMISARIO_CASTIGO: 10, // points a regular's crooked option loses when he's the one inspecting
  HERIDO_FACTOR: 0.5, // what a hurt person's next wage is worth (lib/servicios.js hurts them, a cure or a payday heals)
  // prices follow the week's inflation (lib/banco.js measures it): this share of it, in % and within these bounds
  PRECIOS_INFLACION: 0.5,
  PRECIOS_INFLACION_MIN: -8,
  PRECIOS_INFLACION_MAX: 15,
};

// The dice, here so the tests can load them.
export const _dep = { azar: (n) => randomInt(0, n) };
const alAzar = (lista) => lista[_dep.azar(lista.length)];
const acotar = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const DIA_MS = 24 * 60 * 60 * 1000;
const mencion = (id) => `@${String(id).split("@")[0]}`;

// ---------- the town's makings ----------
export const NOMBRES_PUEBLO = [
  "Villa Porfía", "Paso del Bagre", "Rincón de los Talas", "Cañada Seca", "Arroyo Manso", "Cerro Pelado", "Pueblo Tranquera", "Colonia La Paciencia",
  "Villa Mate Amargo", "Paso Hondo", "Rincón del Chimango", "Cuchilla del Medio", "Pueblo Garufa", "Arroyo de los Patos", "Villa Sin Apuro", "Paso de la Yegua",
  "Colonia Esperanza Vieja", "Cerro de las Ánimas", "Pueblo Abrojal", "Villa Siesta", "Cañada del Zorro", "Paso del Tero", "Rincón de la Bruja", "Pueblo Las Chancletas",
];
const PLAZAS = ["Artigas", "25 de Agosto", "Independencia", "Lavalleja", "de los Treinta y Tres"];
const CLUBES = ["Huracán", "Peñarol del pueblo", "Wanderers chico", "Defensor de la Cuchilla", "Sportivo Tranquera", "Atlético Garufa"];
const BOLICHES = ["El Resorte", "La Última Gota", "El Fogón", "La Tapera", "El Tropezón", "Lo de Tito"];
const SANTOS = ["San Cono", "San Isidro Labrador", "Santa Rita", "San Cayetano", "Nuestra Señora del Carmen"];

// The fixed characters: each town draws a name for each. "como" is how the texts call them.
export const NPCS = {
  comisario: { nombres: ["Almada", "Ferreira", "Olivera", "Techera", "Barboza", "Cabrera", "Sosa"], como: (n) => `el comisario ${n}` },
  cura: { nombres: ["Anselmo", "Ramón", "Ignacio", "Eusebio", "Julián", "Fermín"], como: (n) => `el padre ${n}` },
  almacenera: { nombres: ["Nelly", "Marta", "Chola", "Teresa", "Mirta", "Gladys", "Blanca"], como: (n) => `doña ${n} (la del almacén)` },
  intendente: { nombres: ["Washington Píriz", "Tabaré Olivera", "Wilson Saravia", "Ruben Cardozo", "Nelson Medina"], como: (n) => `el intendente ${n}` },
  usurero: { nombres: ["Saúl", "Benito", "Lalo", "Abraham", "Ciro"], como: (n) => `don ${n} (el que presta)` },
  viejo: { nombres: ["Aparicio", "Eladio", "Ruben", "Hermenegildo", "Atilio"], como: (n) => `don ${n} (el viejo del boliche)` },
};

// The places: how the texts name them, with what the town drew for it.
function armarLugares(n) {
  return {
    plaza: `la plaza ${n.plaza}`,
    ruta: `la ruta ${n.ruta}`,
    comisaria: "la comisaría",
    boliche: `el boliche ${n.boliche}`,
    cooperativa: "la cooperativa",
    iglesia: `la iglesia de ${n.santo}`,
    almacen: `el almacén de doña ${n.almacenera}`,
    cancha: `la cancha de ${n.club}`,
    intendencia: "la intendencia",
    hospital: "la policlínica",
    estacion: "la vieja estación de AFE",
  };
}

// Where each trade's things happen, for the texts that name a place.
const LUGAR_DE = {
  camionero: "ruta", chofer: "ruta", taxista: "ruta", tambero: "cooperativa", peon: "cooperativa", feriante: "plaza", mozo: "boliche", dj: "boliche",
  mecanico: "estacion", guardavidas: "plaza", oficinista: "intendencia", enfermero: "hospital", maestra: "plaza", futbolista: "cancha", naranjita: "plaza",
  streamer: "almacen", panadero: "almacen", politico: "intendencia",
};

// ---------- what gets registered ----------
// What each kind of fact does to the numbers when it happens, and how much it's worth as news for the Sunday paper
// (titular: 0 is no news, and isn't kept). efecto can be a function of the fact's data.
export const HECHOS = {
  coima: { efecto: { seguridad: -1.5 }, titular: 2 }, // a crooked option in a scene where someone inspects
  honestidad: { efecto: { seguridad: 0.5 }, titular: 0 }, // the straight one there
  apodo: { efecto: { humor: 1 }, titular: 3 }, // someone earned a nickname
  empresa_fundada: { efecto: { prosperidad: 4, humor: 1 }, titular: 5 },
  empresa_categoria: { efecto: { prosperidad: 3 }, titular: 4 },
  facturacion: { efecto: (d) => ({ prosperidad: Math.min(2, (d.monto || 0) / PUEBLO.FACTURACION_PASO) }), titular: 0 },
  bien_roto: { efecto: { prosperidad: -0.5 }, titular: 1 },
  robo_empresa: { efecto: { seguridad: -1, humor: -1 }, titular: 4 },
  changa_hecha: { efecto: { prosperidad: 1, humor: 1 }, titular: 1 },
  changa_vacia: { efecto: { humor: -1 }, titular: 1 },
  espia_cumplida: { efecto: { humor: 1 }, titular: 3 },
  espia_descubierto: { efecto: { seguridad: 2 }, titular: 4 },
  cumplio_encargo: { efecto: { prosperidad: 1, humor: 0.5 }, titular: (d) => ((d.premio || 0) >= 200 ? 4 : 2) },
  fallo_encargo: { efecto: { humor: -0.5 }, titular: 2 },
  saboteador: { efecto: { seguridad: 1 }, titular: 3 }, // a saboteur caught
  robo_encargo: { efecto: { seguridad: -1 }, titular: 3 },
  evento: { efecto: {}, titular: 6 }, // what an event does is in EVENTOS; it opens the paper
  campeonato: { efecto: (d) => ({ humor: d.ganado ? 6 : -3 }), titular: 6 },
  intendente: { efecto: { humor: 1 }, titular: 5 }, // the one before the elections (kept for the facts already stored)
  // the elections (lib/elecciones.js)
  campana: { efecto: { humor: 1 }, titular: 3 }, // the candidates are in and the voting opens
  eleccion: { efecto: { humor: 1 }, titular: 6 }, // the count: who won, or nobody ran
  escandalo_coima: { efecto: { seguridad: -1, humor: -2 }, titular: 6 }, // a candidate caught buying votes
  juicio_politico: { efecto: { humor: 2 }, titular: 6 }, // the intendente removed by signatures
  juicio_fallido: { efecto: {}, titular: 2 },
  impuesto: { efecto: (d) => ({ humor: d.antes < d.ahora ? -2 : 2 }), titular: 3 },
  obra: { efecto: {}, titular: 3 }, // what it raises is in hacerObra
  servicio: { efecto: { prosperidad: 0.5 }, titular: (d) => (d.fallo ? 3 : 1) }, // a service between players (lib/servicios.js)
  // what the shop sells (lib/tienda.js)
  estatua: { efecto: { humor: 1 }, titular: 5 }, // a statue put up in the plaza (and the one before knocked down)
  bien_comprado: { efecto: { prosperidad: 0.5 }, titular: (d) => d.peso || 1 }, // a house, a car or a pet
  robo_auto: { efecto: { seguridad: -1, humor: -1 }, titular: 4 },
  robo_frustrado: { efecto: { seguridad: 0.5 }, titular: 2 }, // a bodyguard stopped it
  // the Banco Central (lib/banco.js)
  tasa: { efecto: (d) => ({ humor: d.ahora > d.antes ? -1 : 1 }), titular: 3 }, // the rate moved far enough to be told
  tasa_presion: { efecto: (d) => ({ humor: d.puntos < 0 ? 2 : -2 }), titular: 4 }, // the intendente leaned on the bank
  tasa_rebote: { efecto: { humor: -4, prosperidad: -3 }, titular: 5 }, // and the market took fright
  moroso: { efecto: { humor: -0.5 }, titular: 3 }, // someone went into the clearing as moroso
  remate: { efecto: {}, titular: 4 }, // a seized good was auctioned
  prestamo: { efecto: (d) => ({ prosperidad: Math.min(2, (d.monto || 0) / 2000) }), titular: (d) => ((d.monto || 0) >= 2000 ? 2 : 0) }, // a loan from the bank
};

// ---------- the events ----------
// dias: how long it lasts. peso(estado, estacion): how likely it is against the others today (0 = not possible).
// inicio: what it does to the numbers when it starts. sueldo, empresa and changa: factors on what each trade earns,
// each kind of company bills and each of Claudia's changas pays ("*" for all of them); encargo: points on the chance
// of every urgent errand; robo: % added to the robberies; tasa: points the Banco Central adds to its rate while it
// runs (lib/banco.js). anuncio(p): what Claudia posts, p having the town's
// characters and places (p.npc.comisario, p.lugar.ruta, p.nombre).
export const EVENTOS = {
  temporal: {
    emoji: "⛈️", nombre: "Temporal", dias: 2, clima: "temporal",
    peso: (e, est) => (est === "verano" ? 1 : 3),
    inicio: { humor: -3, prosperidad: -1 },
    sueldo: { guardavidas: 0.5, feriante: 0.6, naranjita: 0.6, mecanico: 1.3, enfermero: 1.2 },
    empresa: { camionero: 0.8, tambero: 0.85, dj: 0.7 },
    changa: { playa: 1.5, ganado: 1.3, taller: 1.3 },
    encargo: -5,
    tasa: 0,
    anuncio: (p) => `Se largó un temporal de los que no se olvidan: ${p.lugar.ruta} está cortada a la altura del puente, se voló el techo de la parada y ${p.npc.almacenera} jura que vio pasar una vaca volando por ${p.lugar.plaza}.`,
  },
  fiesta: {
    emoji: "🎉", nombre: "Fiesta del pueblo", dias: 2,
    peso: (e) => (e.humor >= 40 ? 3 : 1),
    inicio: { humor: 6, prosperidad: 2 },
    sueldo: { mozo: 1.4, dj: 1.4, panadero: 1.3, feriante: 1.3, naranjita: 1.2 },
    empresa: { dj: 1.6 },
    changa: { casamiento: 1.5, tablado: 1.5, bizcochos: 1.4, feria: 1.3 },
    encargo: 3,
    anuncio: (p) => `¡Arrancó la fiesta del pueblo! Hay jineteada en ${p.lugar.cancha}, baile en ${p.lugar.boliche}, torta frita en ${p.lugar.plaza} y ${p.npc.cura} ya bendijo hasta las parrillas.`,
  },
  paro: {
    emoji: "🚧", nombre: "Paro de transporte", dias: 2,
    peso: (e) => (e.humor < 50 ? 3 : 1),
    inicio: { humor: -3, prosperidad: -2 },
    sueldo: { chofer: 0.4, camionero: 0.5, taxista: 1.6 },
    empresa: { camionero: 0.4 },
    changa: { aeropuerto: 1.6, mudanza: 1.3 },
    encargo: -3,
    anuncio: (p) => `Paro de transporte: no sale un ómnibus ni un camión. Hay piquete en ${p.lugar.ruta} con olla popular, y los taxistas se frotan las manos.`,
  },
  multinacional: {
    emoji: "🏭", nombre: "Llegó una multinacional", dias: 4,
    peso: (e) => (e.prosperidad >= 55 ? 3 : 1),
    inicio: { prosperidad: 6, humor: -1 },
    sueldo: { oficinista: 1.3, camionero: 1.2, peon: 0.8, politico: 1.3 },
    empresa: { camionero: 1.3 },
    changa: { censo: 1.3, mudanza: 1.2 },
    encargo: 0,
    tasa: -5,
    anuncio: (p) => `Llegó una multinacional: compraron el campo de atrás de ${p.lugar.estacion}, prometen cuatrocientos puestos de trabajo y ${p.npc.intendente} ya se sacó la foto con el casco puesto.`,
  },
  dolar: {
    emoji: "💸", nombre: "Crisis del dólar", dias: 3,
    peso: (e) => (e.prosperidad < 45 ? 3 : 1),
    inicio: { prosperidad: -6, humor: -4 },
    sueldo: { "*": 0.85, politico: 1.2 },
    empresa: { "*": 0.85 },
    changa: {},
    encargo: -2,
    tasa: 15,
    anuncio: (p) => `Se disparó el dólar. En ${p.lugar.cooperativa} remarcan los precios dos veces por día, ${p.npc.usurero} subió los intereses "por las dudas" y nadie sabe cuánto sale un kilo de yerba.`,
  },
  campeonato: {
    emoji: "⚽", nombre: "Campeonato de fútbol", dias: 3, mercado: true,
    peso: () => 2,
    inicio: { humor: 4 },
    sueldo: { futbolista: 1.5, naranjita: 1.4, streamer: 1.3, enfermero: 1.15 },
    empresa: { dj: 1.2 },
    changa: { estadio: 1.6 },
    encargo: 0,
    anuncio: (p) => `Arranca el campeonato regional y ${p.lugar.cancha} juega de local. ${p.npc.viejo} dice que este año sí, como dice todos los años.`,
  },
  robo_banco: {
    emoji: "🏦", nombre: "Robo al banco", dias: 3,
    peso: (e) => (e.seguridad < 40 ? 4 : e.seguridad < 60 ? 1 : 0),
    inicio: { seguridad: -10, humor: -3 },
    sueldo: {},
    empresa: {},
    changa: {},
    encargo: -2,
    robo: 8,
    tasa: 5,
    anuncio: (p) => `¡Robaron el banco! Se llevaron la caja fuerte entera en una zorra, a plena siesta. ${p.npc.comisario} dice que tiene una pista; ${p.npc.almacenera} dice que tiene tres.`,
  },
  seca: {
    emoji: "🌵", nombre: "Seca", dias: 4, clima: "seco",
    peso: (e, est) => (est === "verano" ? 3 : est === "primavera" ? 1 : 0),
    inicio: { prosperidad: -3 },
    sueldo: { tambero: 0.7, peon: 0.8 },
    empresa: { tambero: 0.6 },
    changa: { papas: 1.5, vendimia: 1.5, esquila: 1.3 },
    encargo: -1,
    tasa: 3,
    anuncio: (p) => `Seca brava: no llueve hace semanas, los tajamares son un charco y ${p.npc.cura} ya sacó al santo a pasear por ${p.lugar.plaza} a ver si se apiada.`,
  },
};

// ---------- the season and the weather ----------
// The real season, by the date (the southern hemisphere's).
export function estacionDe(fecha = new Date()) {
  const m = new Date(fecha).getMonth();
  return m === 11 || m <= 1 ? "verano" : m <= 4 ? "otoño" : m <= 7 ? "invierno" : "primavera";
}
const CLIMAS = {
  verano: [["☀️", "sol que raja la tierra", 4], ["⛅", "calor pesado", 3], ["🌦️", "tormenta de verano a la tardecita", 1]],
  otoño: [["🍂", "fresco y hojas por todos lados", 3], ["🌧️", "llovizna de las que no paran", 2], ["⛅", "nublado", 2]],
  invierno: [["🥶", "helada", 3], ["🌧️", "lluvia y barro", 2], ["🌫️", "niebla cerrada", 2]],
  primavera: [["🌤️", "lindo, con viento", 4], ["🌧️", "chaparrón", 2], ["🌸", "primavera de postal", 2]],
};
// The day's weather: the same all day for a town (drawn from the day and the group), unless an event says otherwise.
export function climaDe(chat, fecha = new Date(), eventos = []) {
  const forzado = eventos.find((e) => EVENTOS[e.clave]?.clima);
  if (forzado) return forzado.clave === "temporal" ? { emoji: "⛈️", texto: "temporal", lluvia: true } : { emoji: "🌵", texto: "seca, ni una nube", lluvia: false };
  const opciones = CLIMAS[estacionDe(fecha)];
  let h = 0;
  for (const c of `${chat}|${claveDia(new Date(fecha))}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  let tiro = h % opciones.reduce((s, o) => s + o[2], 0);
  const [emoji, texto] = opciones.find((o) => (tiro -= o[2]) < 0) || opciones[0];
  return { emoji, texto, lluvia: emoji === "🌧️" || emoji === "🌦️" };
}

// ---------- the table ----------
const filaDe = (chat) => db.prepare(`SELECT * FROM pueblos WHERE chat = ?`).get(chat) || null;
const leerJson = (texto, vacio) => {
  try {
    return JSON.parse(texto || "") ?? vacio;
  } catch {
    return vacio;
  }
};

// Whether the town is alive in a group: switched on, and with the economy on (everything it moves is UruCoins).
export function puebloActivo(chat) {
  const c = getChat(chat);
  return Boolean(c && c.pueblo === 1 && c.monedas !== 0 && filaDe(chat));
}

// The town is born (.pueblo on, the first time): a name (the one given, or one of NOMBRES_PUEBLO), a founding year,
// its places and its characters. A town that existed already is left as it was: switched off and on again, it's the
// same town. Returns its row.
export function nacer(chat, nombre = "", ahora = Date.now()) {
  const ya = filaDe(chat);
  if (ya) return ya;
  const usados = new Set(db.prepare(`SELECT nombre FROM pueblos`).all().map((r) => r.nombre));
  const libres = NOMBRES_PUEBLO.filter((n) => !usados.has(n));
  const npcs = Object.fromEntries(Object.entries(NPCS).map(([k, d]) => [k, alAzar(d.nombres)]));
  const dibujo = { plaza: alAzar(PLAZAS), ruta: 1 + _dep.azar(30), boliche: alAzar(BOLICHES), santo: alAzar(SANTOS), club: alAzar(CLUBES), almacenera: npcs.almacenera };
  db.prepare(`INSERT INTO pueblos (chat, nombre, anio, fundado, prosperidad, seguridad, humor, impuesto, impuesto_fijado, npcs, lugares, dia) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    chat,
    limpiarNombre(nombre) || alAzar(libres.length ? libres : NOMBRES_PUEBLO),
    1830 + _dep.azar(96),
    ahora,
    PUEBLO.REPOSO,
    PUEBLO.REPOSO + 10,
    PUEBLO.REPOSO,
    PUEBLO.IMPUESTO_INICIAL,
    ahora,
    JSON.stringify(npcs),
    JSON.stringify(armarLugares(dibujo)),
    claveDia(new Date(ahora)),
  );
  return filaDe(chat);
}

const limpiarNombre = (texto) => String(texto || "").replace(/[*_~`\n\r@]/g, " ").replace(/\s+/g, " ").trim();

// .pueblo nombre <name>: an admin renames the town. Returns { ok, texto } or { ok: false, error }.
export function ponerNombre(chat, nombre) {
  const limpio = limpiarNombre(nombre);
  if (!limpio) return { ok: false, error: "Decime cómo se llama: .pueblo nombre Villa Porfía" };
  if (limpio.length > PUEBLO.NOMBRE_MAX) return { ok: false, error: `Ese nombre no entra en el cartel de la entrada: hasta ${PUEBLO.NOMBRE_MAX} letras.` };
  const fila = filaDe(chat) || nacer(chat, limpio);
  const antes = fila.nombre;
  db.prepare(`UPDATE pueblos SET nombre = ? WHERE chat = ?`).run(limpio, chat);
  return { ok: true, texto: antes === limpio ? `🏘️ El pueblo se llama *${limpio}*.` : `🏘️ Listo: ${antes} ahora se llama *${limpio}*. Hay que cambiar el cartel de la entrada, y ${nombreNpc(filaDe(chat), "almacenera")} ya lo anda contando.` };
}

const nombreNpc = (fila, clave) => NPCS[clave].como(leerJson(fila.npcs, {})[clave] || NPCS[clave].nombres[0]);

// A character of the town as the texts call them ("el comisario Almada"), or "" with the town off.
export function npc(chat, clave) {
  if (!puebloActivo(chat) || !NPCS[clave]) return "";
  return nombreNpc(filaDe(chat), clave);
}

// A place of the town ("la ruta 7", "el boliche El Resorte"), or "" with the town off.
export function lugar(chat, clave) {
  if (!puebloActivo(chat)) return "";
  return leerJson(filaDe(chat).lugares, {})[clave] || "";
}

// Where a trade's things happen in the town, with its name: "la ruta 7, a la altura de Villa Porfía" or "la
// cooperativa de Villa Porfía". "" with the town off. Any other key (a changa's, say) gets the plaza.
export function lugarPara(chat, clave) {
  if (!puebloActivo(chat)) return "";
  const fila = filaDe(chat);
  const lugares = leerJson(fila.lugares, {});
  const donde = LUGAR_DE[clave] || "plaza";
  return donde === "ruta" ? `${lugares.ruta}, a la altura de ${fila.nombre}` : `${lugares[donde]} de ${fila.nombre}`;
}

// ---------- the state ----------
// The events running in a town now, each with its definition (def) and how long it has left.
export function eventosActivos(chat, ahora = Date.now()) {
  if (!puebloActivo(chat)) return [];
  return db
    .prepare(`SELECT * FROM pueblo_eventos WHERE chat = ? AND desde <= ? AND hasta > ? AND estado = 'activo' ORDER BY desde`)
    .all(chat, ahora, ahora)
    .filter((e) => EVENTOS[e.clave])
    .map((e) => ({ ...e, def: EVENTOS[e.clave] }));
}

// Who the intendente is: a person of the group (usuario, elected: lib/elecciones.js) or the town's own, with how the
// texts call them, since when (desde) and how many terms in a row (mandatos).
function intendenteDeFila(fila) {
  const desde = fila.intendente_desde || 0;
  if (fila.intendente) return { usuario: fila.intendente, como: mencion(fila.intendente), nombre: nombreDe(fila.intendente), persona: true, desde, mandatos: fila.mandatos || 0 };
  const como = nombreNpc(fila, "intendente");
  return { usuario: null, como, nombre: como, persona: false, desde, mandatos: 0 };
}

// Why someone who isn't the intendente can't do what only the intendente does: who is, and how one becomes it.
export function soloElIntendente(intendente, que) {
  const quien = intendente.persona ? intendente.como : `${intendente.nombre}, el del pueblo`;
  return `${que} ${quien}. Al intendente lo elige el grupo una vez por mes: .elecciones`;
}

// The town as it stands, for the modules and the board, or null with the town off.
export function estadoDe(chat, ahora = Date.now()) {
  if (!puebloActivo(chat)) return null;
  const fila = filaDe(chat);
  const eventos = eventosActivos(chat, ahora);
  const npcs = Object.fromEntries(Object.keys(NPCS).map((k) => [k, nombreNpc(fila, k)]));
  return {
    chat,
    nombre: fila.nombre,
    anio: fila.anio,
    fundado: fila.fundado,
    prosperidad: Math.round(fila.prosperidad),
    seguridad: Math.round(fila.seguridad),
    humor: Math.round(fila.humor),
    impuesto: fila.impuesto,
    arcas: fila.arcas,
    intendente: intendenteDeFila(fila),
    estacion: estacionDe(ahora),
    clima: climaDe(chat, ahora, eventos),
    eventos,
    npc: npcs,
    lugar: leerJson(fila.lugares, {}),
  };
}

// Moves the town's numbers by what a fact or an event did, each kept between 0 and 100.
function mover(chat, efecto = {}) {
  const fila = filaDe(chat);
  if (!fila) return;
  const nuevo = (k) => acotar(fila[k] + (efecto[k] || 0));
  db.prepare(`UPDATE pueblos SET prosperidad = ?, seguridad = ?, humor = ? WHERE chat = ?`).run(nuevo("prosperidad"), nuevo("seguridad"), nuevo("humor"), chat);
}

const valorDe = (v, datos) => (typeof v === "function" ? v(datos) : v);

// A module tells the town something happened: registrarHecho(chat, "empresa_fundada", { usuario, nombre }). It moves
// the numbers (HECHOS) and, if it's news, it's kept for the Sunday paper. With the town off, nothing. Returns whether
// it was registered.
export function registrarHecho(chat, tipo, datos = {}, ahora = Date.now()) {
  const def = HECHOS[tipo];
  if (!def || !puebloActivo(chat)) return false;
  mover(chat, valorDe(def.efecto, datos));
  const peso = valorDe(def.titular, datos) || 0;
  if (peso > 0) db.prepare(`INSERT INTO pueblo_hechos (chat, tipo, usuario, datos, peso, fecha) VALUES (?, ?, ?, ?, ?, ?)`).run(chat, tipo, datos.usuario || "", JSON.stringify(datos), peso, ahora);
  return true;
}

// The facts kept in a town since a moment, the newest first, each with its data.
export function hechosDesde(chat, desde, hasta = Date.now() + 1) {
  return db
    .prepare(`SELECT * FROM pueblo_hechos WHERE chat = ? AND fecha >= ? AND fecha < ? ORDER BY fecha DESC, id DESC`)
    .all(chat, desde, hasta)
    .map((h) => ({ ...h, datos: leerJson(h.datos, {}) }));
}

// How prosperity moves money: 1 at rest, up to 1 ± SUELDO_PROSPERIDAD.
const factorProsperidad = (fila) => 1 + ((fila.prosperidad - PUEBLO.REPOSO) / PUEBLO.REPOSO) * PUEBLO.SUELDO_PROSPERIDAD;
// How the week's inflation over what the town is used to, as the Banco Central measures it (lib/banco.js), moves
// prices: PRECIOS_INFLACION of it, between PRECIOS_INFLACION_MIN and _MAX. 1 until the bank has measured any.
const factorInflacion = (fila) => 1 + acotar((fila.inflacion || 0) * PUEBLO.PRECIOS_INFLACION, PUEBLO.PRECIOS_INFLACION_MIN, PUEBLO.PRECIOS_INFLACION_MAX) / 100;

// What the town does to a module's numbers right now. Neutral with the town off. The keys:
//   "sueldo:<trade>"   factor on a trade's wage (prosperity and events)
//   "empresa:<trade>"  factor on what that trade's company bills
//   "precios"          factor on what goods and services cost (prosperity and the bank's inflation)
//   "changa:<key>"     factor on what one of Claudia's changas pays
//   "encargo"          points on an urgent errand's chance (events and the weather)
//   "robo"             % of a robbery (low safety and events)
//   "impuesto"         share of what the companies bill that goes to the town (0 to 1)
export function modificador(chat, clave, ahora = Date.now()) {
  const [tipo, cual] = String(clave).split(":");
  const sumas = tipo === "encargo" || tipo === "robo";
  if (!puebloActivo(chat)) return tipo === "impuesto" || sumas ? 0 : 1;
  const fila = filaDe(chat);
  const eventos = eventosActivos(chat, ahora);
  const deEventos = (campo) => eventos.reduce((f, e) => f * (e.def[campo]?.[cual] ?? e.def[campo]?.["*"] ?? 1), 1);
  if (tipo === "sueldo" || tipo === "empresa") return factorProsperidad(fila) * deEventos(tipo);
  if (tipo === "precios") return factorProsperidad(fila) * factorInflacion(fila);
  if (tipo === "changa") return deEventos("changa");
  if (tipo === "encargo") return eventos.reduce((s, e) => s + (e.def.encargo || 0), 0) + (climaDe(chat, ahora, eventos).lluvia ? -2 : 0);
  if (tipo === "robo") {
    const base = fila.seguridad < PUEBLO.ROBO_SEGURIDAD ? ((PUEBLO.ROBO_SEGURIDAD - fila.seguridad) / PUEBLO.ROBO_SEGURIDAD) * PUEBLO.ROBO_MAX : 0;
    return Math.round(acotar(base + eventos.reduce((s, e) => s + (e.def.robo || 0), 0), 0, PUEBLO.ROBO_TOPE));
  }
  if (tipo === "impuesto") return fila.impuesto / 100;
  return 1;
}

// Rolls for a robbery at the town's rate: false with the town off (no dice thrown, so the modules' own dice are the
// same as ever).
export function huboRobo(chat, ahora = Date.now()) {
  const chance = modificador(chat, "robo", ahora);
  return chance > 0 && _dep.azar(100) < chance;
}

// The municipal tax: what the town takes of an amount a company billed, into the coffers. Returns what it took.
export function cobrarImpuesto(chat, monto) {
  const tasa = modificador(chat, "impuesto");
  const impuesto = Math.floor(monto * tasa);
  if (impuesto > 0) db.prepare(`UPDATE pueblos SET arcas = arcas + ? WHERE chat = ?`).run(impuesto, chat);
  return impuesto;
}

// The statue standing in a town's plaza (lib/tienda.js sells it): { usuario, monto, fecha }, or null.
export const estatuaDe = (chat) => db.prepare(`SELECT * FROM tienda_estatuas WHERE chat = ? AND derribada = 0 ORDER BY id DESC LIMIT 1`).get(chat) || null;

// Money into the town's coffers from somewhere other than the tax (a statue's).
export function sumarArcas(chat, monto) {
  if (monto > 0) db.prepare(`UPDATE pueblos SET arcas = arcas + ? WHERE chat = ?`).run(Math.floor(monto), chat);
}

// ---------- what the characters remember ----------
// Someone did something a character takes note of: recordar(chat, "comisario", usuario, "coima").
export function recordar(chat, quien, usuario, motivo, ahora = Date.now()) {
  if (!puebloActivo(chat) || !usuario || !NPCS[quien]) return;
  db.prepare(`INSERT INTO pueblo_memoria (chat, npc, usuario, motivo, veces, ultima) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(chat, npc, usuario) DO UPDATE SET motivo = excluded.motivo, veces = veces + 1, ultima = excluded.ultima`).run(chat, quien, usuario, motivo, ahora);
}

// What a character remembers of someone: { veces, motivo }, with veces 0 for nobody (or with the town off).
export function memoriaDe(chat, quien, usuario) {
  if (!puebloActivo(chat)) return { veces: 0, motivo: "" };
  return db.prepare(`SELECT veces, motivo FROM pueblo_memoria WHERE chat = ? AND npc = ? AND usuario = ?`).get(chat, quien, usuario) || { veces: 0, motivo: "" };
}

// Who a character remembers the most, in a town.
export function memoriasDe(chat, quien, n = 3) {
  return db.prepare(`SELECT usuario, veces, motivo FROM pueblo_memoria WHERE chat = ? AND npc = ? ORDER BY veces DESC, ultima DESC LIMIT ?`).all(chat, quien, n);
}

// ---------- the intendente and the tax ----------
// The intendente is elected (lib/elecciones.js): it changes hands only at a count or by a juicio político. The town's
// own is there while nobody is.

const ahoraFijable = (fila, ahora) => ahora - (fila.impuesto_fijado || 0) >= PUEBLO.IMPUESTO_CADA_DIAS * DIA_MS;

// .impuesto 12: the intendente (a person) sets the municipal tax, once a week. Returns { ok, texto, mentions } or
// { ok: false, error }.
export function fijarImpuesto(chat, quien, valor, ahora = Date.now()) {
  if (!puebloActivo(chat)) return { ok: false, error: "Acá no hay pueblo, así que tampoco intendencia. Un admin lo funda con .pueblo on" };
  const fila = filaDe(chat);
  const ids = [].concat(quien).filter(Boolean);
  const intendente = intendenteDeFila(fila);
  if (!intendente.persona || !ids.includes(intendente.usuario)) return { ok: false, error: soloElIntendente(intendente, "El impuesto lo fija"), mentions: intendente.persona ? [intendente.usuario] : [] };
  if (!Number.isInteger(valor) || valor < PUEBLO.IMPUESTO_MIN || valor > PUEBLO.IMPUESTO_MAX) return { ok: false, error: `El impuesto va de ${PUEBLO.IMPUESTO_MIN} a ${PUEBLO.IMPUESTO_MAX} % de lo que facturan las empresas. Ahora está en ${fila.impuesto} %.` };
  if (!ahoraFijable(fila, ahora)) {
    const dias = Math.ceil((PUEBLO.IMPUESTO_CADA_DIAS * DIA_MS - (ahora - fila.impuesto_fijado)) / DIA_MS);
    return { ok: false, error: `El impuesto se toca una vez por semana, que esto no es Argentina. Podés de nuevo en ${dias} ${dias === 1 ? "día" : "días"}.` };
  }
  if (valor === fila.impuesto) return { ok: false, error: `Ya está en ${valor} %.` };
  db.prepare(`UPDATE pueblos SET impuesto = ?, impuesto_fijado = ? WHERE chat = ?`).run(valor, ahora, chat);
  registrarHecho(chat, "impuesto", { usuario: intendente.usuario, antes: fila.impuesto, ahora: valor }, ahora);
  const sube = valor > fila.impuesto;
  return {
    ok: true,
    texto: `🏛️ ${mencion(intendente.usuario)} ${sube ? "subió" : "bajó"} el impuesto municipal de ${fila.impuesto} % a *${valor} %* de lo que facturan las empresas. ${sube ? `Los patrones ponen el grito en el cielo y ${nombreNpc(fila, "almacenera")} ya anda juntando firmas para el juicio político.` : "Los patrones aplauden; la intendencia, a ver con qué arregla las calles."}`,
    mentions: [intendente.usuario],
  };
}

// The town's own intendente sets the tax once a week: up when safety is low (more police), down when prosperity is.
function impuestoDelNpc(chat, ahora) {
  const fila = filaDe(chat);
  if (fila.intendente || !ahoraFijable(fila, ahora)) return;
  const meta = fila.seguridad < 40 ? fila.impuesto + 2 : fila.prosperidad < 40 ? fila.impuesto - 2 : fila.impuesto;
  const nuevo = acotar(meta, PUEBLO.IMPUESTO_MIN + 5, PUEBLO.IMPUESTO_MAX - 5);
  db.prepare(`UPDATE pueblos SET impuesto = ?, impuesto_fijado = ? WHERE chat = ?`).run(nuevo, ahora, chat);
  if (nuevo !== fila.impuesto) registrarHecho(chat, "impuesto", { usuario: "", antes: fila.impuesto, ahora: nuevo }, ahora);
}

// With enough in the coffers, the intendencia does some public work: whatever number of the town is lowest goes up.
const OBRAS = {
  seguridad: ["puso luminarias nuevas en {plaza}", "compró un patrullero (usado, pero con sirena)", "puso cámaras en {ruta}"],
  prosperidad: ["bituminizó la calle de {cooperativa}", "arregló el puente de {ruta}", "abrió una feria franca en {plaza}"],
  humor: ["le puso focos a {cancha}", "pintó los juegos de {plaza}", "trajo un grupo de cumbia a {boliche}"],
};
function hacerObra(chat, ahora) {
  const fila = filaDe(chat);
  if (fila.arcas < PUEBLO.OBRA_COSTO) return null;
  const cual = ["seguridad", "prosperidad", "humor"].sort((a, b) => fila[a] - fila[b])[0];
  const lugares = leerJson(fila.lugares, {});
  const que = alAzar(OBRAS[cual]).replace(/\{(\w+)\}/g, (_, k) => lugares[k] || k);
  db.prepare(`UPDATE pueblos SET arcas = arcas - ? WHERE chat = ?`).run(PUEBLO.OBRA_COSTO, chat);
  mover(chat, { [cual]: PUEBLO.OBRA_PUNTOS });
  registrarHecho(chat, "obra", { que, cual, costo: PUEBLO.OBRA_COSTO, usuario: fila.intendente || "" }, ahora);
  return que;
}

// ---------- the day ----------
// A town's day, once: the numbers go back towards their rest, the town's own intendente (while nobody elected is) sets
// the tax, the coffers pay for some work, and what's old is let go of. Returns whether it ran.
export function diaDelPueblo(chat, ahora = Date.now()) {
  const fila = filaDe(chat);
  const hoy = claveDia(new Date(ahora));
  if (!fila || fila.dia === hoy) return false;
  // One step per day gone by (up to a week): a bot that was off for days doesn't leave the town where it was.
  const dias = Math.min(7, Math.max(1, Math.round((new Date(`${hoy}T12:00:00`) - new Date(`${fila.dia}T12:00:00`)) / DIA_MS)));
  const k = 1 - (1 - PUEBLO.DERIVA) ** dias;
  const hacia = (v, reposo) => v + (reposo - v) * k;
  db.prepare(`UPDATE pueblos SET prosperidad = ?, seguridad = ?, humor = ?, dia = ? WHERE chat = ?`).run(hacia(fila.prosperidad, PUEBLO.REPOSO), hacia(fila.seguridad, PUEBLO.REPOSO + 10), hacia(fila.humor, PUEBLO.REPOSO), hoy, chat);
  impuestoDelNpc(chat, ahora);
  hacerObra(chat, ahora);
  db.prepare(`DELETE FROM pueblo_hechos WHERE chat = ? AND fecha < ?`).run(chat, ahora - PUEBLO.HECHOS_DIAS * DIA_MS);
  return true;
}

// Every 5 minutes from tareas-programadas.js: each town's day, and its event, rolled for once a day and scheduled at a
// random moment of the day's hours, as the changas are. Only in groups that talked the day before. Returns how many
// events were scheduled.
export function chequearPueblos(ahora = new Date()) {
  let agendados = 0;
  for (const chat of chatsConOpcion("pueblo")) {
    if (!puebloActivo(chat)) continue;
    diaDelPueblo(chat, ahora.getTime());
    if (ahora.getHours() < PUEBLO.DESDE_HORA) continue;
    const hoy = claveDia(ahora);
    if (periodoCerrado(chat, "pueblo_evento", hoy)) continue;
    marcarPeriodoCerrado(chat, "pueblo_evento", hoy);
    const ayer = new Date(ahora);
    ayer.setDate(ayer.getDate() - 1);
    if (totalMensajesEntre(chat, [claveDia(ayer)]) < PUEBLO.MENSAJES_AYER) continue;
    if (eventosActivos(chat, ahora.getTime()).length >= PUEBLO.EVENTOS_MAX || _dep.azar(100) >= PUEBLO.EVENTO_CHANCE) continue;
    const inicio = Math.max(ahora.getTime() + 60 * 1000, new Date(ahora).setHours(PUEBLO.DESDE_HORA, 0, 0, 0));
    const fin = new Date(ahora).setHours(PUEBLO.HASTA_HORA, 0, 0, 0);
    if (fin <= inicio) continue;
    crearPendiente(chat, "bot", "pueblo_evento", {}, inicio + _dep.azar(fin - inicio));
    agendados++;
  }
  return agendados;
}

function grupoVivo(chat, ahora) {
  const h = ahora.getHours();
  const porHora = new Map(mensajesPorHora(chat, [claveDia(ahora)]).map((r) => [r.hora, r.total]));
  return (porHora.get(h) || 0) + (porHora.get(h - 1) || 0) >= PUEBLO.VIVO_MENSAJES;
}

// Which event, by the weights the town's state and the season give, among those not running.
export function sortearEvento(chat, ahora = Date.now()) {
  const e = estadoDe(chat, ahora);
  if (!e) return null;
  const corriendo = new Set(e.eventos.map((x) => x.clave));
  const ultimo = db.prepare(`SELECT clave FROM pueblo_eventos WHERE chat = ? ORDER BY id DESC LIMIT 1`).get(chat)?.clave;
  const candidatos = Object.entries(EVENTOS)
    .filter(([k]) => !corriendo.has(k) && k !== ultimo)
    .map(([k, d]) => [k, d.peso(e, e.estacion)])
    .filter(([, p]) => p > 0);
  let tiro = _dep.azar(candidatos.reduce((s, [, p]) => s + p, 0) || 1);
  return candidatos.find(([, p]) => (tiro -= p) < 0)?.[0] || candidatos[0]?.[0] || null;
}

// What changes for whom while it runs, in words: "📈 mozo, dj · 📉 guardavidas".
function efectosEnPalabras(def) {
  const nombre = (k) => (k === "*" ? "todos" : OFICIOS[k]?.nombre.toLowerCase() || k);
  const suben = Object.entries(def.sueldo || {}).filter(([, f]) => f > 1).map(([k]) => nombre(k));
  const bajan = Object.entries(def.sueldo || {}).filter(([, f]) => f < 1).map(([k]) => nombre(k));
  const partes = [];
  if (suben.length) partes.push(`📈 cobran más: ${suben.join(", ")}`);
  if (bajan.length) partes.push(`📉 cobran menos: ${bajan.join(", ")}`);
  if (def.encargo) partes.push(`🚨 los encargos ${def.encargo > 0 ? "salen más fácil" : "se complican"}`);
  if (def.robo) partes.push("🥷 hay más robos");
  return partes.join(" · ");
}

// The odds of the town winning the championship: its footballers (how many, and their level) make the team.
export function chanceDeCampeonato(chat) {
  const futbolistas = db.prepare(`SELECT cobros FROM laburos WHERE chat = ? AND laburo = 'futbolista'`).all(chat);
  const niveles = futbolistas.reduce((s, f) => s + nivelDe(f.cobros), 0);
  return acotar(30 + Math.min(4, futbolistas.length) * 8 + niveles, 20, 80);
}

// The pending work of an event (lib/pendientes.js), at the time it was scheduled: everything is checked again (the
// switch, the economy, the hours, the group's own hours, room for one more, the group talking). The event starts,
// is announced, moves the numbers and, the championship, opens a betting market on it (with the casino on). Returns
// the event's id, or null.
export async function lanzarEvento(client, chat, ahora = new Date(), clave = null) {
  const c = getChat(chat);
  if (!puebloActivo(chat) || c.grupoCerradoPorHorario) return null;
  const h = ahora.getHours();
  if (h < PUEBLO.DESDE_HORA || h >= PUEBLO.HASTA_HORA) return null;
  if (eventosActivos(chat, ahora.getTime()).length >= PUEBLO.EVENTOS_MAX || !grupoVivo(chat, ahora)) return null;
  const cual = clave || sortearEvento(chat, ahora.getTime());
  const def = EVENTOS[cual];
  if (!def) return null;
  const e = estadoDe(chat, ahora.getTime());
  const hasta = ahora.getTime() + def.dias * DIA_MS;
  const conMercado = def.mercado && c.casino !== 0;
  const efectos = efectosEnPalabras(def);
  const lineas = [`${def.emoji} *${def.nombre.toUpperCase()} EN ${e.nombre.toUpperCase()}*`, def.anuncio({ ...e, lugar: e.lugar, npc: e.npc })];
  if (efectos) lineas.push(`_Por ${def.dias} días: ${efectos}._`);
  if (conMercado) lineas.push(`📊 Abrí apuestas: ¿salimos campeones? Mirá con .apuestas y jugale con .apostar (cierran en un día; el resultado lo tira el dado, y cuantos más futbolistas tenga el pueblo, mejor).`);
  // Sent before it's stored: a send that fails leaves nothing started, and the pending work tries again.
  await client.sendMessage(chat, { text: lineas.join("\n\n") });
  let id = null;
  db.transaction(() => {
    const mercado = conMercado ? crearMercado(chat, `¿${e.nombre} sale campeón?`, ["Salimos campeones", "Nos vamos en primera ronda"], ahora.getTime() + DIA_MS, "bot", { tipo: "pueblo" }) : 0;
    id = Number(db.prepare(`INSERT INTO pueblo_eventos (chat, clave, desde, hasta, mercado, estado) VALUES (?, ?, ?, ?, ?, 'activo')`).run(chat, cual, ahora.getTime(), hasta, Number(mercado) || 0).lastInsertRowid);
    mover(chat, def.inicio);
    registrarHecho(chat, "evento", { clave: cual, nombre: def.nombre, emoji: def.emoji }, ahora.getTime());
    crearPendiente(chat, "bot", "pueblo_evento_fin", { id }, hasta);
  })();
  return id;
}

// The pending work of an event at its end: it's over. The championship is decided here (rolled at its odds), its
// market paid, and the group told; the rest end quietly (the board stops showing them). Resolves to what to tell
// the group, or null.
export async function terminarEvento(id, ahora = Date.now()) {
  const ev = db.prepare(`SELECT * FROM pueblo_eventos WHERE id = ?`).get(id);
  if (!ev || ev.estado !== "activo" || ev.hasta > ahora) return null;
  db.prepare(`UPDATE pueblo_eventos SET estado = 'terminado' WHERE id = ?`).run(id);
  if (ev.clave !== "campeonato") return null;
  if (!puebloActivo(ev.chat)) {
    // The town (or the economy) was switched off meanwhile: the bets go back.
    if (!ev.mercado) return null;
    const { anularPorPartido } = await import("./mercados.js");
    const r = anularPorPartido(ev.mercado, "El pueblo está apagado: el campeonato quedó sin resultado.");
    return r?.mentions?.length ? { chat: ev.chat, ...r } : null;
  }
  const fila = filaDe(ev.chat);
  const chance = chanceDeCampeonato(ev.chat);
  const ganado = _dep.azar(100) < chance;
  registrarHecho(ev.chat, "campeonato", { ganado, chance }, ahora);
  const lineas = [ganado ? `🏆 *¡${fila.nombre.toUpperCase()} CAMPEÓN!* Caravana por ${leerJson(fila.lugares, {}).plaza}, bocinazos y ${nombreNpc(fila, "cura")} tocando las campanas sin permiso.` : `😩 ${fila.nombre} se volvió en primera ronda. ${nombreNpc(fila, "viejo")} dice que el año que viene sí.`, `_(Tenía ${chance} % de chance, por los futbolistas del grupo.)_`];
  const mentions = [];
  if (ev.mercado) {
    // Late import: lib/mercados.js brings in the shop, which brings in the trades, which read the town.
    const { resolverPorPartido } = await import("./mercados.js");
    const r = resolverPorPartido(ev.mercado, ganado ? 0 : 1, "");
    if (r && apuestasDeMercado(ev.mercado).length) {
      lineas.push("", r.texto);
      mentions.push(...(r.mentions || []));
    }
  }
  return { chat: ev.chat, texto: lineas.join("\n"), mentions };
}

// ---------- the board: .pueblo ----------
const barra = (v) => `${"▰".repeat(Math.round(v / 10))}${"▱".repeat(10 - Math.round(v / 10))} ${v}`;
const fechaCorta = (ms) => new Date(ms).toLocaleDateString("es-UY", { day: "numeric", month: "numeric", year: "numeric" });

// The famous nicknames of a group: the people with the most fame, each with theirs (lib/escenas.js).
async function apodosFamosos(chat, n = 3) {
  const { apodoDe } = await import("./escenas.js");
  return db
    .prepare(`SELECT usuario, ABS(picaro) + ABS(valiente) AS f FROM laburos_fama WHERE chat = ? ORDER BY f DESC LIMIT 10`)
    .all(chat)
    .map((r) => ({ usuario: r.usuario, apodo: apodoDe(chat, r.usuario) }))
    .filter((r) => r.apodo)
    .slice(0, n);
}

// .pueblo: the town as it stands. Returns { texto, mentions }.
export async function textoPueblo(chat, ahora = Date.now()) {
  const e = estadoDe(chat, ahora);
  if (!e) {
    const fila = filaDe(chat);
    return { texto: `🏘️ ${fila ? `*${fila.nombre}* está dormido: el pueblo está apagado` : "Este grupo todavía no tiene pueblo"}. Un admin lo prende con .pueblo on: el grupo pasa a ser un pueblo con su intendente, su comisario y su almacenera chusma, donde los oficios, las empresas, las changas, los encargos y los espías se afectan entre sí, con eventos cada tanto y un diario los domingos.`, mentions: [] };
  }
  const mentions = [];
  const lineas = [`🏘️ *${e.nombre.toUpperCase()}* — fundado en ${e.anio} (y en este grupo, el ${fechaCorta(e.fundado)})`];
  lineas.push(`${e.clima.emoji} ${e.estacion[0].toUpperCase()}${e.estacion.slice(1)}, hoy ${e.clima.texto}.`);
  lineas.push("", `💰 Prosperidad ${barra(e.prosperidad)}`, `👮 Seguridad   ${barra(e.seguridad)}`, `🙂 Humor       ${barra(e.humor)}`);
  const robo = modificador(chat, "robo", ahora);
  if (robo) lineas.push(`🥷 Con esta seguridad hay ${robo} % de chance de robo en cada jornada de empresa y cada encargo cobrado.`);
  lineas.push("", `🏛️ Intendente: ${e.intendente.persona ? e.intendente.como : e.intendente.nombre.replace(/^el intendente /, "")}${e.intendente.persona ? "" : " (el del pueblo, hasta que el grupo elija uno: .elecciones)"} · impuesto municipal *${e.impuesto} %* de lo que facturan las empresas · arcas: ${e.arcas}`);
  if (e.intendente.persona) mentions.push(e.intendente.usuario);
  // Late imports: lib/elecciones.js and lib/banco.js read the town.
  const { lineaEleccionesPueblo } = await import("./elecciones.js");
  lineas.push(lineaEleccionesPueblo(chat, ahora));
  const { lineaBancoPueblo } = await import("./banco.js");
  lineas.push(lineaBancoPueblo(chat, ahora));
  if (e.eventos.length) {
    lineas.push("", "*Pasando ahora:*");
    for (const ev of e.eventos) {
      const dias = Math.max(1, Math.ceil((ev.hasta - ahora) / DIA_MS));
      lineas.push(`${ev.def.emoji} ${ev.def.nombre} (${dias === 1 ? "queda 1 día" : `quedan ${dias} días`})${efectosEnPalabras(ev.def) ? ` — ${efectosEnPalabras(ev.def)}` : ""}`);
    }
  }
  const ricos = topCoins(chat, 3);
  if (ricos.length) lineas.push("", `🪙 Los más ricos: ${ricos.map((r) => `${nombreDe(r.usuario)} (${r.saldo})`).join(", ")}`);
  const apodos = await apodosFamosos(chat);
  if (apodos.length) lineas.push(`🏷️ Apodos famosos: ${apodos.map((a) => `${nombreDe(a.usuario)}, *${a.apodo}*`).join(" · ")}`);
  const { empresasDelGrupo } = await import("./empresas.js");
  const empresas = empresasDelGrupo(chat).slice(0, 3);
  if (empresas.length) lineas.push(`🏭 Empresas: ${empresas.map((x) => `${x.def.emoji} ${x.nombre} (de ${nombreDe(x.patron)})`).join(" · ")}`);
  const estatua = estatuaDe(chat);
  if (estatua) {
    lineas.push(`🗿 En ${e.lugar.plaza} está la estatua de ${mencion(estatua.usuario)} (la pagó ${estatua.monto}; para tirarla, .comprar estatua)`);
    mentions.push(estatua.usuario);
  }
  const junados = memoriasDe(chat, "comisario", 3);
  if (junados.length) lineas.push(`👮 ${e.npc.comisario[0].toUpperCase()}${e.npc.comisario.slice(1)} tiene junados a: ${junados.map((j) => `${nombreDe(j.usuario)} (${j.veces})`).join(", ")}`);
  const quienes = Object.entries(e.npc).filter(([k]) => k !== "intendente" && k !== "comisario").map(([, v]) => v);
  lineas.push("", `👥 También viven acá ${quienes.slice(0, -1).join(", ")} y ${quienes.at(-1)}.`);
  lineas.push(`📰 Los domingos sale *El Eco de ${e.nombre}*, con la recap (.eco muestra el último). Un admin le cambia el nombre con .pueblo nombre <nombre> y lo apaga con .pueblo off.`);
  return { texto: lineas.join("\n"), mentions };
}

// The town's name for a group, or "" with none.
export const nombreDelPueblo = (chat) => filaDe(chat)?.nombre || "";

// For Claudia's prompt: the town she lives in, in that group, when the talk is about it. "" with the town off.
export function puebloParaPrompt(chat, ahora = Date.now()) {
  const e = estadoDe(chat, ahora);
  if (!e) return "";
  const eventos = e.eventos.map((x) => x.def.nombre.toLowerCase());
  const partes = [
    `En el juego del grupo, el grupo es un pueblo: ${e.nombre}, fundado en ${e.anio}. Intendente: ${e.intendente.persona ? e.intendente.nombre : e.intendente.nombre.replace(/^el intendente /, "")}. Viven ahí ${Object.values(e.npc).join(", ")}.`,
    `Hoy: ${e.estacion}, ${e.clima.texto}; prosperidad ${e.prosperidad}, seguridad ${e.seguridad} y humor ${e.humor} sobre 100; impuesto municipal ${e.impuesto} %.${eventos.length ? ` Está pasando: ${eventos.join(", ")}.` : ""}`,
  ];
  const estatua = estatuaDe(chat);
  if (estatua) partes.push(`En ${e.lugar.plaza} hay una estatua de ${nombreDe(estatua.usuario) || "alguien del grupo"}, que la pagó (${estatua.monto} UruCoins) en la tienda.`);
  return partes.join(" ");
}

// The words of a talk about the town, without accents: then Claudia is told about it (plugins/_auto-ia.js).
const DEL_PUEBLO = /\b(pueblo|intendent\w*|comisari\w*|almacen\w*|usurer\w*|cura|parroc\w*|boliche|diario|eco|titular\w*|impuesto\w*|temporal|paro|seca|campeonato|multinacional|dolar|robo\w*|fiesta|estatua\w*|banco|tasas?|prestam\w*|prest(a|o|as|ame|ar|aste)|plazos? fijos?|clearing|morosos?|inflacion|deudas?|remates?)\b/;
export const hablaDelPueblo = (...textos) =>
  DEL_PUEBLO.test(
    textos
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, ""),
  );

// A trade's name in someone's gender, for the town's texts.
export const oficioDe = (chat, usuario) => {
  const l = laburoDe(chat, usuario);
  return l ? nombreDeOficio(l.oficio, generoDe(usuario)).toLowerCase() : "";
};

// ---------- switching it on and off ----------
// .pueblo on: the town is born (or wakes up, if it had been switched off) and Claudia introduces it. Returns the text.
export function textoNacimiento(chat, { nuevo = true } = {}) {
  const fila = filaDe(chat);
  const lugares = leerJson(fila.lugares, {});
  if (!nuevo) return `🏘️ *${fila.nombre}* se despertó de la siesta: todo sigue donde lo dejaron. .pueblo muestra cómo está.`;
  return [
    `🏘️ *NACIÓ ${fila.nombre.toUpperCase()}*, fundado allá por ${fila.anio} (según ${nombreNpc(fila, "viejo")}, que dice que estuvo).`,
    `Tiene ${lugares.plaza}, ${lugares.ruta} que lo cruza, ${lugares.boliche}, ${lugares.iglesia}, ${lugares.cancha}, la cooperativa, la comisaría y la policlínica. Lo manejan ${nombreNpc(fila, "intendente")} (hasta que el grupo elija intendente: hay elecciones una vez por mes) y ${nombreNpc(fila, "comisario")}; ${nombreNpc(fila, "cura")} da misa los domingos, ${nombreNpc(fila, "usurero")} presta a interés y ${nombreNpc(fila, "almacenera")} se entera de todo antes que nadie.`,
    `De ahora en más los oficios, las empresas, las changas, los encargos y los espías pasan acá y se afectan entre sí: si hay mucha coima baja la seguridad y hay robos, si las empresas facturan sube la prosperidad y con ella los sueldos y los precios, y cada tanto pasa algo grande (un temporal, la fiesta del pueblo, un paro…). Los domingos sale *El Eco de ${fila.nombre}*.`,
    `_.pueblo muestra el tablero; un admin le cambia el nombre con .pueblo nombre <nombre>._`,
  ].join("\n\n");
}

// .pueblo off: the town falls asleep. What's running ends, and a championship's bets go back; an election running is
// void, its bribes back to who promised them (lib/elecciones.js). Returns what to tell the group about the bets, or
// null.
export async function dormirPueblo(chat, ahora = Date.now()) {
  const { anularElecciones } = await import("./elecciones.js");
  anularElecciones(chat);
  const corriendo = db.prepare(`SELECT * FROM pueblo_eventos WHERE chat = ? AND estado = 'activo'`).all(chat);
  let aviso = null;
  for (const ev of corriendo) {
    db.prepare(`UPDATE pueblo_eventos SET estado = 'terminado', hasta = ? WHERE id = ?`).run(Math.min(ev.hasta, ahora), ev.id);
    if (!ev.mercado) continue;
    const { anularPorPartido } = await import("./mercados.js");
    const r = anularPorPartido(ev.mercado, "Se apagó el pueblo, y el campeonato con él.");
    if (r?.mentions?.length) aviso = r;
  }
  return aviso;
}

// ---------- the hurt ----------
// Someone hurt in an errand (lib/servicios.js): their next wage is worth HERIDO_FACTOR, until they're seen to or that
// payday comes (lib/laburos.js). Only in a town that's alive.
export const estaHerido = (chat, usuario) => puebloActivo(chat) && Boolean(db.prepare(`SELECT 1 FROM pueblo_heridos WHERE chat = ? AND usuario = ?`).get(chat, usuario));
export function curar(chat, usuario) {
  db.prepare(`DELETE FROM pueblo_heridos WHERE chat = ? AND usuario = ?`).run(chat, usuario);
}
