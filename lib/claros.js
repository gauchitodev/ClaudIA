// Claros de Inumet: la observación horaria de las estaciones del país (viento, visibilidad, tiempo presente, cielo,
// nubes, temperatura, rocío, humedad y presión) que Inumet publica en su página de productos aeronáuticos. No hay API:
// se lee la página con un user agent de navegador y se guarda una hora. El claro sale a la hora en punto (hora
// local), así que la lectura programada es a los 10 minutos de cada hora; .claro actualizar fuerza una lectura.
import { load } from "cheerio";
import { offsetDeZona } from "./aero-reloj.js";

export const CLAROS = {
  URL: "https://www.inumet.gub.uy/aeronautica/productos-aeronauticos",
  UA: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  MINUTO_LECTURA: 10, // minuto de cada hora en que se lee la página
  CACHE_MS: 60 * 60 * 1000,
  ENTRE_FORZADAS_MS: 60 * 1000, // .claro actualizar no golpea Inumet más de una vez por minuto
  TIMEOUT_MS: 20000,
  ZONA: "America/Montevideo",
  FUENTE: "Inumet",
};

// Inyectable para los tests.
export const _dep = {
  pedir: async (url) => {
    const res = await fetch(url, { headers: { "user-agent": CLAROS.UA, accept: "text/html,application/xhtml+xml", "accept-language": "es-UY,es;q=0.9" }, signal: AbortSignal.timeout(CLAROS.TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Inumet respondió ${res.status}`);
    return res.text();
  },
};

if (!globalThis.clarosCache) globalThis.clarosCache = { datos: null, leido: 0 };

const numero = (t) => {
  const n = Number(String(t).replace(",", "."));
  return t === "" || t === "-" || !Number.isFinite(n) ? null : n;
};
// "160 / 10", "160 / 10 / 20" (con ráfaga), "-" sin dato
export function parsearViento(texto) {
  const m = String(texto || "").match(/^(\d{1,3})\s*\/\s*(\d{1,3})(?:\s*\/\s*(\d{1,3}))?$/);
  if (!m) return null;
  return { dir: Number(m[1]), vel: Number(m[2]), rafaga: m[3] ? Number(m[3]) : null };
}

// El HTML de la página → { fecha, hora, estaciones: [...] }. Lanza si no está la tabla.
export function parsearClaros(html) {
  const $ = load(html);
  const div = $("#div_claros");
  if (!div.length) throw new Error("la página no trae la tabla de claros");
  const parrafos = div.find("p").map((i, p) => $(p).text().replace(/\s+/g, " ").trim()).get();
  const fecha = parrafos.map((p) => p.match(/Fecha:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1]).find(Boolean) || "";
  const hora = parrafos.map((p) => p.match(/hora\s+(\d{1,2}:\d{2})/)?.[1]).find(Boolean) || "";
  const estaciones = div
    .find("tbody tr")
    .map((i, tr) => {
      const td = $(tr).find("td");
      const celda = (j) => $(td[j]).text().replace(/\s+/g, " ").trim();
      const crudo = celda(0);
      const [ciudad, ...resto] = crudo.replace(/\*/g, "").trim().split(/\s+-\s+/);
      return {
        ciudad: ciudad.trim(),
        detalle: resto.join(" - ").trim(),
        automatica: crudo.includes("*"),
        viento: parsearViento(celda(1)),
        visibilidad: numero(celda(2)),
        tiempo: { codigo: celda(3), descripcion: $(td[3]).find("[title]").attr("title") || "" },
        cielo: celda(4),
        nubes: celda(5),
        temp: numero(celda(6)),
        rocio: numero(celda(7)),
        hr: numero(celda(8)),
        pnm: numero(celda(9)),
        pest: numero(celda(10)),
      };
    })
    .get()
    .filter((e) => e.ciudad);
  if (!estaciones.length) throw new Error("la tabla de claros vino vacía");
  return { fecha, hora, estaciones };
}

// Devuelve { datos, leido, deCache, reciente }. Con la caché vigente no toca la página; forzar la saltea, salvo que
// la última lectura sea de hace menos de un minuto.
export async function leerClaros({ forzar = false, ahora = Date.now() } = {}) {
  const c = globalThis.clarosCache;
  if (c.datos && !forzar && ahora - c.leido < CLAROS.CACHE_MS) return { datos: c.datos, leido: c.leido, deCache: true };
  if (c.datos && forzar && ahora - c.leido < CLAROS.ENTRE_FORZADAS_MS) return { datos: c.datos, leido: c.leido, deCache: true, reciente: true };
  const datos = parsearClaros(await _dep.pedir(CLAROS.URL));
  c.datos = datos;
  c.leido = ahora;
  return { datos, leido: ahora, deCache: false };
}

// Milisegundos hasta el próximo minuto de lectura (hh:10 en hora local).
export function msHastaLectura(ahora = Date.now()) {
  const pared = ahora + offsetDeZona(CLAROS.ZONA, ahora) * 60000;
  const enLaHora = pared % 3600000;
  const objetivo = CLAROS.MINUTO_LECTURA * 60000;
  return enLaHora < objetivo ? objetivo - enLaHora : 3600000 - enLaHora + objetivo;
}

// Lectura programada: a los 10 de cada hora, con reintento a los 5 minutos si Inumet no responde.
export function iniciarClaros() {
  const programar = (ms) => setTimeout(async () => {
    try {
      await leerClaros({ forzar: true });
      programar(msHastaLectura());
    } catch (e) {
      console.error("[claros] no se pudo leer Inumet:", String(e.message || e).slice(0, 200));
      programar(Math.min(5 * 60 * 1000, msHastaLectura()));
    }
  }, ms);
  programar(msHastaLectura());
}

// ---- búsqueda y textos ----
const normalizar = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const ALIAS = { montevideo: "carrasco", sumu: "carrasco", mvd: "carrasco", punta: "lagunadelsauce", puntadeleste: "lagunadelsauce", pde: "lagunadelsauce", maldonado: "lagunadelsauce", suls: "lagunadelsauce", laguna: "lagunadelsauce", adami: "melilla", suaa: "melilla", sudu: "durazno", surv: "rivera", suso: "salto", supu: "paysandu", sumo: "melo", suag: "artigas", suca: "colonia", "33": "treintaytres", sanjosedemayo: "sanjose" };

export function buscarEstacion(datos, texto) {
  const q = normalizar(texto);
  if (!q) return null;
  const buscado = ALIAS[q] || q;
  return datos.estaciones.find((e) => normalizar(e.ciudad) === buscado) || datos.estaciones.find((e) => normalizar(e.ciudad).startsWith(buscado)) || datos.estaciones.find((e) => normalizar(`${e.ciudad} ${e.detalle}`).includes(buscado)) || null;
}

const num = (n, d = 1) => (n === null ? "sin dato" : n.toFixed(d).replace(".", ",").replace("-", "−"));
const textoViento = (v) => (!v ? "sin dato" : v.vel === 0 ? "calma" : `${String(v.dir).padStart(3, "0")}° ${v.vel} kt${v.rafaga ? `, ráfagas de ${v.rafaga}` : ""}`);
const hace = (leido, ahora) => {
  const min = Math.round((ahora - leido) / 60000);
  return min < 1 ? "recién" : min === 1 ? "hace 1 min" : `hace ${min} min`;
};
const pie = (leido, ahora) => `_Fuente: ${CLAROS.FUENTE}. Leído ${hace(leido, ahora)}; se lee a los ${CLAROS.MINUTO_LECTURA} de cada hora. .claro actualizar fuerza una lectura._`;

export function textoEstacion(e, datos, leido, ahora = Date.now()) {
  const lineas = [
    `🌤️ *Claro ${CLAROS.FUENTE} · ${e.ciudad}*${e.detalle ? ` — ${e.detalle}` : ""}${e.automatica ? " (estación automática)" : ""}`,
    `🕒 Observación de las ${datos.hora} (hora local) del ${datos.fecha}`,
    `💨 Viento: ${textoViento(e.viento)}`,
    `👁️ Visibilidad: ${e.visibilidad === null ? "sin dato" : `${num(e.visibilidad, 0)} km`}`,
    `🌦️ Tiempo presente: ${e.tiempo.codigo || "sin dato"}${e.tiempo.descripcion ? ` (${e.tiempo.descripcion})` : ""}`,
    `☁️ Cielo: ${e.cielo || "sin dato"}${e.nubes ? ` · ${e.nubes}` : ""}`,
    `🌡️ ${num(e.temp)} °C · rocío ${num(e.rocio)} °C · HR ${e.hr === null ? "sin dato" : `${num(e.hr, 0)} %`}`,
    `🔽 Presión: ${num(e.pnm)} hPa a nivel del mar · ${num(e.pest)} hPa en la estación`,
    pie(leido, ahora),
  ];
  return lineas.join("\n");
}

export function textoListaClaros(datos, leido, ahora = Date.now()) {
  const filas = datos.estaciones.map((e) => `• ${e.ciudad}: ${textoViento(e.viento)} · ${e.visibilidad === null ? "vis. sin dato" : `${num(e.visibilidad, 0)} km`} · ${e.cielo || "cielo sin dato"} · ${num(e.temp)} °C`);
  return [`🌤️ *Claros ${CLAROS.FUENTE}* · observaciones de las ${datos.hora} (hora local) del ${datos.fecha}`, ...filas, "", `.claro <ciudad> para el detalle de una estación.`, pie(leido, ahora)].join("\n");
}

// .claro [ciudad] · .claro actualizar [ciudad]
export async function textoClaro(texto, ahora = Date.now()) {
  const partes = String(texto || "").trim().split(/\s+/).filter(Boolean);
  const forzar = /^(actualizar|forzar|refrescar|update)$/i.test(partes[0] || "");
  const ciudad = (forzar ? partes.slice(1) : partes).join(" ");
  let lectura;
  try {
    lectura = await leerClaros({ forzar, ahora });
  } catch (e) {
    const c = globalThis.clarosCache;
    if (!c.datos) return `No pude leer los claros de ${CLAROS.FUENTE} ahora (${String(e.message || e).slice(0, 120)}). Probá en un rato.`;
    lectura = { datos: c.datos, leido: c.leido, deCache: true, fallo: String(e.message || e).slice(0, 120) };
  }
  const { datos, leido } = lectura;
  const avisos = [];
  if (lectura.fallo) avisos.push(`⚠️ ${CLAROS.FUENTE} no respondió (${lectura.fallo}); te muestro la última lectura.`);
  if (lectura.reciente) avisos.push(`ℹ️ Ya se leyó ${hace(leido, ahora)}; para no cansar a ${CLAROS.FUENTE} no se vuelve a pedir antes de un minuto.`);
  if (ciudad) {
    const e = buscarEstacion(datos, ciudad);
    if (!e) return [`No encontré la estación "${ciudad}". Las que hay: ${datos.estaciones.map((x) => x.ciudad).join(", ")}.`, ...avisos].join("\n");
    return [textoEstacion(e, datos, leido, ahora), ...avisos].join("\n");
  }
  return [textoListaClaros(datos, leido, ahora), ...avisos].join("\n");
}
