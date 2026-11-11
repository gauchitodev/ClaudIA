// .resumen (plugins/resumen.js): an AI summary of what a group said lately, for whoever wasn't there. How far back is
// the asker's call: 15 minutes unless they say ("2h", "30m", "1h30"), 6 hours at most, which is what the memory keeps
// (lib/contexto-chat.js). The same request again within 5 minutes gets the same summary without asking the AI; another
// one makes a new summary, one a minute per group at most. A long while goes to the AI in parts, each the size one
// request always had, and then the parts are put together. Its state lives here, so saving the plugin keeps it.
import { mensajesRecientes, historialCompletoDesde, fueComando, ingresoDe, versionDe, MEMORIA_CORTA } from "./contexto-chat.js";
import { preguntarIA } from "./ia.js";
import { tratoDeLaCharla } from "./genero.js";
import { sinMenciones } from "./menciones.js";

export const RESUMENES = {
  POR_DEFECTO_MIN: 15,
  MIN_MIN: 1,
  MAX_MIN: MEMORIA_CORTA.HORAS_MS / 60000, // what the memory keeps: more would promise what isn't there
  CACHE_MS: 5 * 60 * 1000, // the same request within this gets the same summary
  ENTRE_RESUMENES_MS: 60 * 1000, // between new summaries in a group
  MAX_CARACTERES: 40000, // per request: about what the 200 messages the memory used to keep made, which always went fine
  MAX_PARTES: 4, // requests in a row for one summary, plus the one that joins them
  MIN_MENSAJES: 5,
  MARCA_CADA_MIN: 30,
};

// chat -> Map(minutes asked -> the summary made): for the same request again. Each one keeps what it covered and the
// chat's version (versionDe) when it was made, so a deletion or an edit since leaves it out.
export const resumenesGuardados = new Map();
// chat -> when the AI was last asked for a new summary: set before asking, so two at once don't both go, and removed if
// it failed, so it can be asked again at once.
export const ultimoResumen = new Map();

const normalizar = (t) =>
  String(t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

const HORAS = "h|hs|hr|hrs|hora|horas";
const MINUTOS = "m|min|mins|minuto|minutos";
const CON_HORAS = new RegExp(`^(\\d+(?:[.,]\\d+)?) ?(?:${HORAS})(?: ?y)?(?: ?(\\d+) ?(?:${MINUTOS})?)?$`);
const SOLO_MINUTOS = new RegExp(`^(\\d+) ?(?:${MINUTOS})$`);
const NUMERO = /^\d+(?:[.,]\d+)?$/;

function minutosDe(texto) {
  let m;
  if ((m = texto.match(CON_HORAS))) return Math.round(Number(m[1].replace(",", ".")) * 60) + Number(m[2] || 0);
  if ((m = texto.match(SOLO_MINUTOS))) return Number(m[1]);
  if (!NUMERO.test(texto)) return null;
  const n = Number(texto.replace(",", "."));
  // A bare number: up to 6 it's hours, as .resumen 2 always was; above that, minutes (.resumen 30). A decimal, hours.
  return /[.,]/.test(texto) || n <= 6 ? Math.round(n * 60) : n;
}

// How far back a request goes, in minutes: { minutos, acotada } (acotada: it asked for more than the most there is).
// What doesn't read as a time gets the default, and "2 horas porfa" reads as 2 hours: the longest start that does.
export function duracionPedida(args = []) {
  const palabras = (Array.isArray(args) ? args : [args]).map(normalizar).filter(Boolean);
  let minutos = null;
  for (let k = Math.min(4, palabras.length); k >= 1 && minutos === null; k--) minutos = minutosDe(palabras.slice(0, k).join(" "));
  if (minutos === null) return { minutos: RESUMENES.POR_DEFECTO_MIN, acotada: false };
  if (minutos > RESUMENES.MAX_MIN) return { minutos: RESUMENES.MAX_MIN, acotada: true };
  return { minutos: Math.max(RESUMENES.MIN_MIN, minutos), acotada: false };
}

// "15 min", "1 h", "1 h 30 min": duracion() (lib/tiempo.js) says "1 h 0 min".
export function textoDuracion(minutos) {
  const h = Math.floor(minutos / 60);
  const min = Math.round(minutos - h * 60);
  if (!h) return `${min} min`;
  return min ? `${h} h ${min} min` : `${h} h`;
}

// The while, with its article in agreement: "de los últimos 15 min", "del último minuto", "de la última hora y 20 min",
// "de las últimas 3 h 20 min"; with "en", "en los últimos 15 min".
export function ultimos(ms, preposicion = "de") {
  const minutos = Math.max(1, Math.round(ms / 60000));
  if (minutos === 1) return preposicion === "de" ? "del último minuto" : `${preposicion} el último minuto`;
  if (minutos < 60) return `${preposicion} los últimos ${minutos} min`;
  if (minutos < 120) return `${preposicion} la última hora${minutos > 60 ? ` y ${minutos - 60} min` : ""}`;
  return `${preposicion} las últimas ${textoDuracion(minutos)}`;
}

// "14:30", in the tablet's local time.
const hora = (ms) => {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// What's left of the minute between summaries, rounded up: "45 s", "1 min". Rounded down, half a second left read
// "esperá 0 s", and a request in the same millisecond, "1 min" one time and "59 s" the next.
const faltan = (ms) => {
  const s = Math.ceil(ms / 1000);
  return s >= 60 ? "1 min" : `${s} s`;
};

// "a las 14:30", "a la 1:05".
export const aLas = (ms) => `a la${new Date(ms).getHours() === 1 ? "" : "s"} ${hora(ms)}`;
const deLas = (ms) => aLas(ms).replace(/^a /, "de ");

// The messages as lines for the prompt. With marcas, a "— 14:30 —" before the first message of each half hour, so a
// long while can be told by its times.
export function transcripcion(lista, { marcas = false } = {}) {
  const lineas = [];
  let franja = null;
  for (const x of lista) {
    if (marcas) {
      const d = new Date(x.fecha);
      const minuto = d.getMinutes() - (d.getMinutes() % RESUMENES.MARCA_CADA_MIN);
      const inicio = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), minuto).getTime();
      if (inicio !== franja) lineas.push(`— ${hora(inicio)} —`);
      franja = inicio;
    }
    lineas.push(`- ${x.esBot ? "Claudia (vos)" : x.nombre}: ${x.texto}`);
  }
  return lineas;
}

// The messages in blocks, oldest first, none longer than one request takes (room left for the marks), at most
// maxPartes: { bloques, cortado }. Filled from the newest back, so if they don't all fit, what's left out is the
// oldest.
export function partir(lista, { maxCaracteres = RESUMENES.MAX_CARACTERES, maxPartes = RESUMENES.MAX_PARTES } = {}) {
  const presupuesto = maxCaracteres - 200;
  const bloques = [];
  let actual = [];
  let largo = 0;
  for (let i = lista.length - 1; i >= 0; i--) {
    const x = lista[i];
    const n = (x.esBot ? 13 : x.nombre.length) + x.texto.length + 5;
    if (actual.length && largo + n > presupuesto) {
      bloques.push(actual.reverse());
      if (bloques.length === maxPartes) return { bloques: bloques.reverse(), cortado: true };
      actual = [];
      largo = 0;
    }
    actual.push(x);
    largo += n;
  }
  if (actual.length) bloques.push(actual.reverse());
  return { bloques: bloques.reverse(), cortado: false };
}

// More lines the longer the while: 6 hours in the 4 to 8 of old came out squeezed, without what came first.
const largoPedido = (periodoMs) => (periodoMs <= 60 * 60 * 1000 ? "de 4 a 8" : periodoMs <= 3 * 60 * 60 * 1000 ? "de 6 a 10" : "de 8 a 12");

const instruccion = (largo, marcas) =>
  `(Instrucción para vos, no la muestres: hacé un resumen para alguien que no estuvo, ${largo} líneas, con tu tono de siempre. Cubrí todo el período, no solo lo último. Contá de qué se habló y quién dijo qué cuando importe, sin inventar nada que no esté ahí. No uses @ ni menciones. Si hay varios temas sueltos, listalos con guiones${marcas ? ", y si ayuda, decí más o menos a qué hora fue cada uno" : ""}.)`;

// How the people in those messages set to be addressed (.genero, lib/genero.js), as a line of its own before the
// instruction: a summary says who said what, and it went by their names.
const conTrato = (lista) => {
  const trato = tratoDeLaCharla(lista);
  return trato ? `${trato}\n\n` : "";
};

const consultaUnica = (lista, periodoMs, marcas) =>
  `Estos son los mensajes del grupo ${ultimos(periodoMs)}, del más viejo al más nuevo${marcas ? " (las líneas como «— 14:30 —» marcan cada media hora)" : ""}:\n${transcripcion(lista, { marcas }).join("\n")}\n\n${conTrato(lista)}${instruccion(largoPedido(periodoMs), marcas)}`;

const rango = (bloque) => `${deLas(bloque[0].fecha)} ${aLas(bloque.at(-1).fecha)}`;

const consultaParte = (bloque, i, n) =>
  `Estos son mensajes del grupo, parte ${i + 1} de ${n} (${rango(bloque)}), del más viejo al más nuevo:\n${transcripcion(bloque, { marcas: true }).join("\n")}\n\n${conTrato(bloque)}(Instrucción para vos, no la muestres: es un borrador para armar después un resumen, no va al grupo. Resumí esta parte en hasta 8 líneas: de qué se habló, quién dijo qué cuando importe y más o menos a qué hora, sin inventar nada que no esté ahí. No uses @ ni menciones.)`;

const consultaJuntar = (parciales, periodoMs) =>
  `Estos son, en orden, los resúmenes de las partes de lo que habló el grupo ${ultimos(periodoMs)}:\n\n${parciales.map((p, i) => `Parte ${i + 1} (${rango(p.bloque)}):\n${p.texto}`).join("\n\n")}\n\n${conTrato(parciales.flatMap((p) => p.bloque))}${instruccion(largoPedido(periodoMs), true)}`;

// The summary as it goes out: what it covers and how many messages, with whatever the asker should know.
function encabezado(hecho, { acotada = false, hace = null } = {}) {
  const avisos = [];
  if (hecho.desdeEntro) avisos.push("desde que entraste");
  else if (hecho.cortadoDesde !== null) avisos.push(`era demasiado: arranqué ${aLas(hecho.cortadoDesde)}`);
  else if (hecho.recortado) avisos.push(acotada ? "no tengo guardado más atrás" : `pediste ${textoDuracion(hecho.minutos)}, pero no tengo guardado más atrás`);
  if (acotada) avisos.push(`lo máximo son ${textoDuracion(RESUMENES.MAX_MIN)}`);
  if (hace !== null) avisos.push(hace < 60 * 1000 ? "lo hice recién" : `lo hice hace ${textoDuracion(Math.round(hace / 60000))}`);
  return `📝 *Resumen ${ultimos(hecho.periodoMs)}* (${hecho.cantidad} mensajes${avisos.map((a) => `; ${a}`).join("")})\n\n${hecho.cuerpo}`;
}

// The summary made for the same while, if it still goes: within CACHE_MS, with no deletion or edit since, and only to
// someone who was there for all it covers (what was said before they came in isn't theirs to read).
function guardadoPara(chat, minutos, entro, ahora) {
  const delChat = resumenesGuardados.get(chat);
  if (!delChat) return null;
  for (const [clave, hecho] of delChat) if (ahora - hecho.creado >= RESUMENES.CACHE_MS) delChat.delete(clave);
  if (!delChat.size) resumenesGuardados.delete(chat);
  const hecho = delChat.get(minutos);
  return hecho && hecho.version === versionDe(chat) && entro <= hecho.desde ? hecho : null;
}

// The whole of .resumen for someone in a chat: returns { texto } to send, with deLaCache when it's a summary made
// before. escribiendo: the "typing..." before each request to the AI; a failure there doesn't stop anything.
export async function pedirResumen(chat, quien, args = [], { escribiendo = () => {}, ahora = Date.now() } = {}) {
  const { minutos, acotada } = duracionPedida(args);
  const pedidoMs = minutos * 60 * 1000;
  // Someone who just came in gets only what was said since then: it used to tell them what had been said before.
  const entro = ingresoDe(chat, quien);
  const desdeEntro = entro > ahora - pedidoMs;
  const desde = desdeEntro ? entro : ahora - pedidoMs;

  const guardado = desdeEntro ? null : guardadoPara(chat, minutos, entro, ahora);
  if (guardado) return { texto: encabezado(guardado, { acotada, hace: ahora - guardado.creado }), deLaCache: true };

  // What the summary really covers: nothing from before the memory began, or from what a burst pushed out of it.
  const completo = historialCompletoDesde(chat, desde);
  const lista = mensajesRecientes(chat, desde).filter((x) => !fueComando(x));
  const version = versionDe(chat);
  // Before the limit: saying there's nothing to tell costs no request.
  if (lista.length < RESUMENES.MIN_MENSAJES) {
    if (desdeEntro) return { texto: "Desde que entraste casi no hubo mensajes, y de lo de antes no te cuento 🤐" };
    const sinGuardar = completo - desde > 60 * 1000 ? ` Ojo que no tengo guardado de antes de hace ${textoDuracion(Math.round((ahora - completo) / 60000))}.` : "";
    return { texto: `Casi no hubo mensajes ${ultimos(pedidoMs, "en")}.${sinGuardar}` };
  }

  const ultimo = ultimoResumen.get(chat) || 0;
  if (ahora - ultimo < RESUMENES.ENTRE_RESUMENES_MS) return { texto: `Recién hice un resumen; esperá ${faltan(RESUMENES.ENTRE_RESUMENES_MS - (ahora - ultimo))} para pedir otro.` };
  ultimoResumen.set(chat, ahora);

  const { bloques, cortado } = partir(lista);
  const usados = cortado ? bloques.flat() : lista;
  const cubreDesde = cortado ? usados[0].fecha : completo;
  const periodoMs = ahora - cubreDesde;
  const preguntar = async (consulta) => {
    try {
      escribiendo();
    } catch {
      // the "typing..." is a nicety
    }
    try {
      return await preguntarIA(consulta);
    } catch {
      return { ok: false };
    }
  };

  // One request for what fits in one; otherwise one per part, one at a time (the per-minute limits, lib/gemini.js), and
  // one more that puts them together.
  let r;
  if (bloques.length === 1) {
    r = await preguntar(consultaUnica(usados, periodoMs, periodoMs >= 60 * 60 * 1000));
  } else {
    const parciales = [];
    for (const [i, bloque] of bloques.entries()) {
      const parte = await preguntar(consultaParte(bloque, i, bloques.length));
      if (!parte?.ok || !parte.texto) {
        r = parte;
        break;
      }
      parciales.push({ bloque, texto: parte.texto.trim() });
    }
    if (parciales.length === bloques.length) r = await preguntar(consultaJuntar(parciales, periodoMs));
  }
  if (!r?.ok || !r.texto) {
    ultimoResumen.delete(chat);
    return { texto: r?.porHoy ? "Se me acabó la cuota de la IA por hoy, no puedo resumir 😅" : "Se me trabó el resumen, probá de nuevo en un rato." };
  }

  const hecho = {
    minutos,
    desde: cubreDesde,
    creado: ahora,
    version,
    cantidad: usados.length,
    periodoMs,
    recortado: !cortado && completo - desde > 60 * 1000,
    cortadoDesde: cortado ? cubreDesde : null,
    desdeEntro,
    cuerpo: sinMenciones(r.texto),
  };
  // A newcomer's is theirs alone: it starts when they came in.
  if (!desdeEntro) {
    if (!resumenesGuardados.has(chat)) resumenesGuardados.set(chat, new Map());
    resumenesGuardados.get(chat).set(minutos, hecho);
  }
  return { texto: encabezado(hecho, { acotada }) };
}
