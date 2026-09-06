// Laburos: cada persona elige un oficio y cobra un sueldo diario con .cobrar, con un evento al azar que lo
// sube o baja. El oficio aparece en .baltop y .timba, y Claudia lo sabe para chicanear en la charla.
// Los eventos son al azar (no los decide la IA). Tiene su propia tabla, creada acá mismo.
// El sueldo base es dinámico, como el "dynamic payment" de Jobs Reborn: sube en los oficios con poca gente y baja en
// los llenos, contando a las personas de todos los grupos del bot (ver LABURO.DINAMICO_* y factorSueldo).
// Además hay niveles, como en Jobs Reborn: cada cobro suma experiencia y cada nivel da un bonus de sueldo (ver
// LABURO.NIVEL_* y nivelDe). Cambiar de laburo arranca de nivel 1 en el nuevo.
import { randomInt } from "crypto";
import { ganarCoins, gastarCoins, getSaldoCoins, getItem } from "../database-functions.js";

export const LABURO = {
  CAMBIO_COSTO: 20, // cambiar de laburo cuesta esto (el primero es gratis)
  CAMBIO_ESPERA_DIAS: 3, // y hay que esperar esto desde que agarraste el anterior
  // Sueldo dinámico: por cada persona que un oficio tiene por debajo del promedio de todos los oficios, el sueldo sube
  // DINAMICO_PASO; por cada una por encima, baja lo mismo. Con topes, para que un oficio vacío no pague fortunas ni
  // uno lleno quede en nada. El promedio se calcula sobre la gente de todos los grupos donde está el bot.
  DINAMICO_PASO: 0.1,
  DINAMICO_BONUS_MAX: 0.5, // un oficio vacío paga hasta +50 %
  DINAMICO_PENALIZACION_MAX: 0, // 0 = los oficios llenos NO cobran menos, se quedan en el sueldo base
  // Niveles: el nivel 2 pide NIVEL_DIAS_BASE cobros y cada nivel siguiente pide un cobro más que el anterior (3, 4, 5...).
  // Cada nivel por encima del 1 suma NIVEL_BONUS al sueldo, hasta NIVEL_MAX. Los cobros se cuentan por laburo actual.
  NIVEL_DIAS_BASE: 3,
  NIVEL_BONUS: 0.05, // +5 % por nivel: el nivel 10 paga +45 %
  NIVEL_MAX: 10,
};

export const OFICIOS = {
  tambero: { nombre: "Tambero", emoji: "🐄", sueldo: 25, desc: "Te levantás a las 5. Las vacas no saben de feriados.",
    eventos: [[0.5, "Se te escapó una vaca al camino y perdiste media mañana buscándola."], [1.5, "Ordeñe récord: la cooperativa te pagó de más."], [2, "Vendiste un ternero por encima del precio. Día redondo."]] },
  camionero: { nombre: "Camionero", emoji: "🚛", sueldo: 30, desc: "Ruta, termo y radio. Cobra bien, dormís poco.",
    eventos: [[0.5, "Cortaron la ruta 5 y quedaste varado: cobrás la mitad."], [1.5, "Viaje de ida y vuelta con carga completa. Extra."], [2, "Flete urgente a Rivera, doble tarifa."]] },
  peon: { nombre: "Peón de estancia", emoji: "🐎", sueldo: 22, desc: "Alambrar, aparte, esquila. Sueldo justo, cuero curtido.",
    eventos: [[0.5, "Se rompió el alambrado del fondo y el patrón te lo descontó."], [1.5, "Esquila terminada antes de tiempo, te dieron un extra."], [2, "Doma un potro que nadie podía. El patrón te subió el sueldo hoy."]] },
  guardavidas: { nombre: "Guardavidas", emoji: "🏖️", sueldo: 20, desc: "Silla alta, silbato y protector. En invierno cobrás igual, no preguntes.",
    eventos: [[0.5, "Día de lluvia, playa vacía, la intendencia te mandó a casa temprano."], [1.5, "Rescataste a un turista. Salió en el diario, propina incluida."], [2, "Te contrataron para una fiesta privada en Punta. Doble."]] },
  chofer: { nombre: "Chofer de ómnibus", emoji: "🚌", sueldo: 25, desc: "Línea del interior, paradas que no existen en el mapa.",
    eventos: [[0.5, "Se rompió el ómnibus en Durazno. Medio día de sueldo."], [1.5, "Turno extra en la Terminal, cobrás y medio."], [2, "Viaje especial a un casamiento. Te pagaron doble y comiste gratis."]] },
  oficinista: { nombre: "Oficinista", emoji: "💼", sueldo: 22, desc: "Planillas, mails y aire acondicionado. Estable, sin gloria.",
    eventos: [[0.5, "Se cayó el sistema y te mandaron a casa sin las horas."], [1.5, "Cerraste el balance antes de tiempo. Bono chico."], [2, "Ascenso. Bueno, un ascenso de oficina: doble hoy y ya."]] },
  dj: { nombre: "DJ", emoji: "🎧", sueldo: 28, desc: "Fiestas, cumples de 15 y algún boliche. Cobrás cuando hay evento.",
    eventos: [[0.5, "Se suspendió la fiesta por lluvia. Cobraste la seña nomás."], [1.5, "Pasaste hasta las 7 de la mañana. Te dieron propina."], [2, "Te contrató un boliche de Punta para la temporada. Doble."]] },
  mecanico: { nombre: "Mecánico", emoji: "🔧", sueldo: 26, desc: "Manos negras y clientes que te dicen \"hace un ruidito raro\".",
    eventos: [[0.5, "Te equivocaste de junta y tuviste que desarmar todo de nuevo. Perdiste el día."], [1.5, "Arreglaste una caja que tres talleres habían rebotado. Pagaron sin chistar."], [2, "Te trajeron una cosechadora en plena zafra. Urgencia, tarifa doble."]] },
  mozo: { nombre: "Mozo", emoji: "🍽️", sueldo: 21, desc: "Bandeja, sonrisa y pies rotos. La propina es lo que salva.",
    eventos: [[0.5, "Se te cayó una bandeja llena y te la descontaron."], [1.5, "Mesa de doce que dejó buena propina."], [2, "Cubriste un casamiento entero. Cobraste doble y te llevaste comida."]] },
  feriante: { nombre: "Feriante", emoji: "🍅", sueldo: 23, desc: "Cuatro de la mañana, puesto armado, y a gritar precios.",
    eventos: [[0.5, "Llovió toda la mañana y no fue nadie. Media feria perdida."], [1.5, "Vendiste todo antes del mediodía y levantaste temprano."], [2, "Se te acercó un restorán a comprar por cajón. Día redondo."]] },
  taxista: { nombre: "Taxista", emoji: "🚕", sueldo: 24, desc: "Vueltas, tarifa dinámica y conversación obligatoria.",
    eventos: [[0.5, "Se te pinchó una goma y perdiste medio turno."], [1.5, "Agarraste hora pico con tarifa alta toda la tarde."], [2, "Viaje al aeropuerto ida y vuelta con espera paga. Doble."]] },
  enfermero: { nombre: "Enfermero", emoji: "🏥", sueldo: 27, desc: "Turnos de doce horas. Te agradecen poco y te necesitan siempre.",
    eventos: [[0.5, "Te mandaron a cubrir a un compañero y saliste tarde sin las horas."], [1.5, "Guardia tranquila con adicional nocturno."], [2, "Doble turno en emergencia. Te pagaron todo y con recargo."]] },
  maestra: { nombre: "Maestra", emoji: "📚", sueldo: 20, desc: "Treinta gurises, cero materiales y todo el amor del mundo.",
    eventos: [[0.5, "Se cortó la luz en la escuela y mandaron a todos a casa."], [1.5, "Diste clases particulares después de hora."], [2, "Te salió una suplencia doble en la escuela de al lado."]] },
  futbolista: { nombre: "Futbolista", emoji: "⚽", sueldo: 24, desc: "Ascenso uruguayo: cancha de tierra, sueño de Primera.",
    eventos: [[0.5, "Te sacaron roja a los diez minutos y te multaron."], [1.5, "Metiste el gol del triunfo. Premio por partido ganado."], [2, "Vino un veedor a verte y jugaste el partido de tu vida. Prima."]] },
  naranjita: { nombre: "Cuidacoches", emoji: "🅿️", sueldo: 18, desc: "Trapo en mano y \"tranquilo que te lo cuido\". Todo a la gorra.",
    eventos: [[0.5, "Vino la municipal y tuviste que levantar campamento."], [1.5, "Había partido en el Centenario y se llenó la cuadra."], [2, "Un tipo de traje te dejó un billete grande y ni esperó el vuelto."]] },
  streamer: { nombre: "Streamer", emoji: "📺", sueldo: 22, desc: "Ocho horas en vivo para catorce personas. Pero un día pegás.",
    eventos: [[0.5, "Se te cayó internet en la mitad del directo. Adiós audiencia."], [1.5, "Te cayeron unas suscripciones de la nada."], [2, "Un clip tuyo se hizo viral. Doble de todo esta semana."]] },
  panadero: { nombre: "Panadero", emoji: "🥖", sueldo: 23, desc: "Arrancás a las tres de la mañana y el barrio te quiere.",
    eventos: [[0.5, "Se te pasó la hornada entera y la tuviste que tirar."], [1.5, "Vendiste todos los bizcochos antes de las nueve."], [2, "Te encargaron el pan de un casamiento. Doble."]] },
  politico: { nombre: "Político", emoji: "🏛️", sueldo: 15, desc: "Paga poco, todos te odian, y encima te cae la prensa.",
    eventos: [[0.5, "Te escracharon en la puerta de tu casa. Cobrás la mitad por la vergüenza."], [1.5, "Inauguraste una placa. Viático."], [2, "Cobraste 'gastos de representación'. Mejor no preguntar."]] },
};

const EVENTOS_GENERALES = [
  [1, "Día normal, cobraste tu sueldo."],
  [1, "Nada raro hoy. Sueldo de siempre."],
  [1.5, "Horas extra: te pagaron y medio."],
  [0.5, "Llegaste tarde y te descontaron medio día."],
];

// ---------- tabla ----------
let tablaLista = false;
function tabla() {
  if (tablaLista) return globalThis.db;
  globalThis.db.exec(`
    CREATE TABLE IF NOT EXISTS laburos (
      chat TEXT NOT NULL,
      usuario TEXT NOT NULL,
      laburo TEXT NOT NULL,
      desde INTEGER NOT NULL,
      ultimo_cobro TEXT DEFAULT '',
      cobros INTEGER DEFAULT 0,
      PRIMARY KEY (chat, usuario)
    )
  `);
  tablaLista = true;
  return globalThis.db;
}

const pad = (n) => String(n).padStart(2, "0");
const claveDia = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function laburoDe(chat, usuario) {
  const row = tabla().prepare(`SELECT * FROM laburos WHERE chat = ? AND usuario = ?`).get(chat, usuario);
  if (!row || !OFICIOS[row.laburo]) return null;
  return { ...row, oficio: OFICIOS[row.laburo] };
}

// "🐄 Tambero" o "" — para mostrar al lado del nombre
export function etiquetaLaburo(chat, usuario) {
  const l = laburoDe(chat, usuario);
  if (!l) return "";
  const nivel = nivelDe(l.cobros);
  return `${l.oficio.emoji} ${l.oficio.nombre}${nivel > 1 ? ` nv.${nivel}` : ""}`;
}

// ---------- niveles ----------
// Cobros acumulados que pide un nivel: el 1 es gratis, el 2 pide NIVEL_DIAS_BASE, el 3 uno más, y así.
export function cobrosParaNivel(nivel) {
  let total = 0;
  for (let n = 2; n <= nivel; n++) total += LABURO.NIVEL_DIAS_BASE + (n - 2);
  return total;
}

export function nivelDe(cobros) {
  let nivel = 1;
  while (nivel < LABURO.NIVEL_MAX && cobros >= cobrosParaNivel(nivel + 1)) nivel++;
  return nivel;
}

// Factor que multiplica el sueldo por el nivel: 1 en nivel 1, 1.05 en nivel 2...
export const factorNivel = (nivel) => 1 + (nivel - 1) * LABURO.NIVEL_BONUS;

const pctNivel = (nivel) => Math.round((factorNivel(nivel) - 1) * 100);

// "nivel 3 (+10 %); faltan 5 cobros para el nivel 4" / "nivel 10 (+45 %), el máximo"
export function textoNivel(cobros) {
  const nivel = nivelDe(cobros);
  if (nivel >= LABURO.NIVEL_MAX) return `nivel ${nivel} (+${pctNivel(nivel)} %), el máximo`;
  const faltan = cobrosParaNivel(nivel + 1) - cobros;
  return `nivel ${nivel}${nivel > 1 ? ` (+${pctNivel(nivel)} %)` : ""}; ${faltan === 1 ? "falta 1 cobro" : `faltan ${faltan} cobros`} para el nivel ${nivel + 1}`;
}

// ---------- sueldo dinámico ----------
// Personas por oficio, contando todos los grupos (la misma persona con el mismo oficio en dos grupos cuenta una vez).
export function afiliadosPorOficio() {
  const conteo = Object.fromEntries(Object.keys(OFICIOS).map((k) => [k, 0]));
  for (const f of tabla().prepare(`SELECT laburo, COUNT(DISTINCT usuario) AS n FROM laburos GROUP BY laburo`).all()) {
    if (f.laburo in conteo) conteo[f.laburo] = f.n;
  }
  return conteo;
}

// Factor que multiplica el sueldo base de un oficio: 1 = sueldo base, 1.2 = +20 %, 0.7 = −30 %.
export function factorSueldo(clave, conteo = afiliadosPorOficio()) {
  const total = Object.values(conteo).reduce((s, n) => s + n, 0);
  const promedio = total / Object.keys(OFICIOS).length;
  const ajuste = (promedio - (conteo[clave] || 0)) * LABURO.DINAMICO_PASO;
  return 1 + Math.min(LABURO.DINAMICO_BONUS_MAX, Math.max(-LABURO.DINAMICO_PENALIZACION_MAX, ajuste));
}

// Sueldo base de hoy para un oficio, ya ajustado (mínimo 1).
export function sueldoActual(clave, conteo = afiliadosPorOficio()) {
  return Math.max(1, Math.round(OFICIOS[clave].sueldo * factorSueldo(clave, conteo)));
}

// "+15 %, 1 persona" / "−20 %, 3 personas" / "sueldo base, 2 personas"
export function textoAjuste(clave, conteo = afiliadosPorOficio()) {
  const n = conteo[clave] || 0;
  const pct = Math.round((factorSueldo(clave, conteo) - 1) * 100);
  const gente = `${n} ${n === 1 ? "persona" : "personas"}`;
  return pct === 0 ? `sueldo base, ${gente}` : `${pct > 0 ? "+" : "−"}${Math.abs(pct)} %, ${gente}`;
}

export function buscarOficio(texto) {
  const k = String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
  if (!k) return null;
  if (OFICIOS[k]) return k;
  const porNombre = Object.entries(OFICIOS).find(([, o]) => o.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "") === k);
  if (porNombre) return porNombre[0];
  if (k === "peondeestancia" || k === "estancia") return "peon";
  if (k === "omnibus" || k === "choferdeomnibus" || k === "colectivero") return "chofer";
  if (k === "oficina") return "oficinista";
  if (k === "cuidacoches" || k === "trapito") return "naranjita";
  if (k === "profesora" || k === "profesor" || k === "maestro" || k === "docente") return "maestra";
  if (k === "moza" || k === "camarero" || k === "camarera") return "mozo";
  if (k === "mecanica" || k === "taller") return "mecanico";
  if (k === "uber" || k === "remise") return "taxista";
  if (k === "enfermera") return "enfermero";
  if (k === "futbol" || k === "jugador") return "futbolista";
  return null;
}

// ---------- acciones ----------
export function tomarLaburo(chat, usuario, clave) {
  const oficio = OFICIOS[clave];
  if (!oficio) return { ok: false, error: "Ese laburo no existe. Mirá la lista con .laburos" };
  const actual = laburoDe(chat, usuario);
  if (actual?.laburo === clave) return { ok: false, error: `Ya sos ${oficio.nombre.toLowerCase()}. Andá a laburar: .cobrar` };

  if (actual) {
    const diasDesde = (Date.now() - actual.desde) / (24 * 60 * 60 * 1000);
    if (diasDesde < LABURO.CAMBIO_ESPERA_DIAS) {
      const faltan = Math.ceil(LABURO.CAMBIO_ESPERA_DIAS - diasDesde);
      return { ok: false, error: `Hace nada que agarraste ${actual.oficio.nombre.toLowerCase()}. Podés cambiar en ${faltan} ${faltan === 1 ? "día" : "días"}.` };
    }
    if (!gastarCoins(chat, usuario, LABURO.CAMBIO_COSTO, "cambio_laburo")) {
      return { ok: false, error: `Cambiar de laburo cuesta ${LABURO.CAMBIO_COSTO} UruCoins (trámites, vio) y tenés ${getSaldoCoins(chat, usuario)}.` };
    }
  }

  tabla()
    .prepare(`INSERT INTO laburos (chat, usuario, laburo, desde, ultimo_cobro, cobros) VALUES (?, ?, ?, ?, '', 0) ON CONFLICT(chat, usuario) DO UPDATE SET laburo = excluded.laburo, desde = excluded.desde, cobros = 0`)
    .run(chat, usuario, clave, Date.now());
  const costo = actual ? ` Pagaste ${LABURO.CAMBIO_COSTO} de trámites y arrancás de nivel 1.` : "";
  const conteo = afiliadosPorOficio();
  return { ok: true, mensaje: `${oficio.emoji} Listo, de ahora en más sos *${oficio.nombre.toLowerCase()}*.${costo} ${oficio.desc}\nCobrá una vez por día con .cobrar: hoy paga ${sueldoActual(clave, conteo)} (${textoAjuste(clave, conteo)} en el oficio).` };
}

export function renunciar(chat, usuario) {
  const actual = laburoDe(chat, usuario);
  if (!actual) return { ok: false, error: "No tenés laburo. Mirá .laburos" };
  tabla().prepare(`DELETE FROM laburos WHERE chat = ? AND usuario = ?`).run(chat, usuario);
  return { ok: true, mensaje: `Renunciaste a ${actual.oficio.nombre.toLowerCase()}. Ahora sos desocupado con orgullo. Cuando quieras, .laburos` };
}

export function cobrar(chat, usuario) {
  const actual = laburoDe(chat, usuario);
  if (!actual) return { ok: false, error: "No tenés laburo, no hay de dónde cobrar. Elegí uno con .laburos" };
  const hoy = claveDia();
  if (actual.ultimo_cobro === hoy) return { ok: false, error: `Ya cobraste hoy. El sueldo es una vez por día, ${actual.oficio.nombre.toLowerCase()}.` };

  // evento: 8 % doble, 12 % malo, 20 % bueno, 60 % normal (los del oficio pesan igual que los generales de su tipo)
  const r = randomInt(0, 100);
  const tipo = r < 8 ? 2 : r < 20 ? 0.5 : r < 40 ? 1.5 : 1;
  const candidatos = [...actual.oficio.eventos, ...EVENTOS_GENERALES].filter(([m]) => m === tipo);
  const [mult, texto] = candidatos[randomInt(0, candidatos.length)];

  // racha doble de la tienda (se lee directo para no importar tienda.js, que a su vez importa esto)
  const itemRacha = getItem(chat, usuario, "racha");
  const rachaMult = itemRacha && Date.now() <= Number(itemRacha.extra || 0) ? 2 : 1;
  // sueldo base del día: el del oficio ajustado por cuánta gente tiene (ver factorSueldo)
  const conteo = afiliadosPorOficio();
  const nivel = nivelDe(actual.cobros);
  const cobrado = Math.max(1, Math.round(sueldoActual(actual.laburo, conteo) * factorNivel(nivel) * mult * rachaMult));
  ganarCoins(chat, usuario, cobrado, "sueldo_laburo");
  tabla().prepare(`UPDATE laburos SET ultimo_cobro = ?, cobros = cobros + 1 WHERE chat = ? AND usuario = ?`).run(hoy, chat, usuario);

  const racha = rachaMult > 1 ? " (racha doble 🔥)" : "";
  const pct = Math.round((factorSueldo(actual.laburo, conteo) - 1) * 100);
  const nombre = actual.oficio.nombre.toLowerCase();
  const dinamico = pct === 0 ? "" : `\n${pct > 0 ? "📈" : "📉"} Hoy ${nombre} paga ${pct > 0 ? "+" : "−"}${Math.abs(pct)} %: hay ${pct > 0 ? "poca" : "mucha"} gente en el oficio (${conteo[actual.laburo]} en todos los grupos).`;
  const nivelTexto = nivel > 1 ? ` (nivel ${nivel}, +${pctNivel(nivel)} %)` : "";
  // este cobro ya cuenta para el nivel: si cruza el umbral, el nuevo bonus corre desde el próximo
  const nivelNuevo = nivelDe(actual.cobros + 1);
  const subida = nivelNuevo > nivel ? `\n⬆️ Subiste a nivel ${nivelNuevo} de ${nombre}: +${pctNivel(nivelNuevo)} % de sueldo de ahora en más${nivelNuevo >= LABURO.NIVEL_MAX ? ", el máximo" : ""}.` : "";
  return { ok: true, mensaje: `${actual.oficio.emoji} ${texto}\n🪙 Cobraste *${cobrado} UruCoins*${racha}${nivelTexto}. Tenés ${getSaldoCoins(chat, usuario)}.${dinamico}${subida}` };
}

// ---------- textos ----------
export function textoLaburos(chat, usuario) {
  const actual = laburoDe(chat, usuario);
  const conteo = afiliadosPorOficio();
  const lineas = Object.entries(OFICIOS).map(([clave, o]) => `${o.emoji} *${o.nombre}* — ${sueldoActual(clave, conteo)}/día (${textoAjuste(clave, conteo)}) · .laburo ${clave}\n${o.desc}`);
  const pie = actual ? `Ahora sos ${actual.oficio.nombre.toLowerCase()}, ${textoNivel(actual.cobros)}. Cambiar cuesta ${LABURO.CAMBIO_COSTO}, hay ${LABURO.CAMBIO_ESPERA_DIAS} días de espera y arrancás de nivel 1.` : "Elegí uno con .laburo <nombre>. El primero es gratis.";
  const topes = LABURO.DINAMICO_PENALIZACION_MAX > 0 ? `+${Math.round(LABURO.DINAMICO_BONUS_MAX * 100)} % / −${Math.round(LABURO.DINAMICO_PENALIZACION_MAX * 100)} %` : `+${Math.round(LABURO.DINAMICO_BONUS_MAX * 100)} %`;
  const explicacion = LABURO.DINAMICO_PENALIZACION_MAX > 0 ? `El sueldo sube en los oficios con poca gente y baja en los llenos (hasta ${topes})` : `El sueldo sube en los oficios con poca gente (hasta ${topes}); estar en uno lleno nunca te baja el sueldo`;
  return `💼 *LABUROS*\n\n${lineas.join("\n\n")}\n\n${pie} Cobrás una vez por día con .cobrar.\n${explicacion}, contando a la gente de todos los grupos del bot.\nCada cobro suma experiencia: cada nivel da +${Math.round(LABURO.NIVEL_BONUS * 100)} % de sueldo, hasta el nivel ${LABURO.NIVEL_MAX}.`;
}

export function topLaburantes(chat, n = 5) {
  return tabla().prepare(`SELECT usuario, laburo, cobros FROM laburos WHERE chat = ? ORDER BY cobros DESC LIMIT ?`).all(chat, n);
}
