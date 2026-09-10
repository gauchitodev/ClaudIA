// Clima actual y de mañana con Open-Meteo (open-meteo.com): gratis y sin clave para uso no comercial. Primero se
// ubica la ciudad con su geocodificador, prefiriendo la uruguaya entre homónimas ("Salto" es el de acá, no el de
// Brasil), y después se pide el pronóstico para esas coordenadas. Reemplazó al plugin de OpenWeather, que precisaba
// una clave que nadie configuró.

export const CLIMA = {
  URL: "https://api.open-meteo.com/v1/forecast",
  GEOCODER: "https://geocoding-api.open-meteo.com/v1/search",
  TIMEOUT_MS: 15000,
  CACHE_LUGAR_MS: 24 * 60 * 60 * 1000,
  CACHE_CLIMA_MS: 10 * 60 * 1000, // Open-Meteo actualiza cada 15 minutos; con esto un grupo entero no la martilla
  DEFAULT: "Montevideo",
  PAIS: "UY",
  POBLACION_MIN: 2000, // una localidad uruguaya más chica no le gana a una ciudad del mundo con el mismo nombre
  RAFAGA_MIN: 30, // km/h; por debajo no vale la pena nombrar las ráfagas
};

// Inyectable para los tests.
export const _dep = { fetch: (...a) => fetch(...a) };

const normalizar = (t) =>
  String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

async function pedirJson(url) {
  const res = await _dep.fetch(url, { signal: AbortSignal.timeout(CLIMA.TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}`);
  return res.json();
}

// ---------- lugar ----------
const cacheLugares = new Map();

const buscar = async (nombre, extra = "") => (await pedirJson(`${CLIMA.GEOCODER}?name=${encodeURIComponent(nombre)}&count=10&language=es${extra}`)).results || [];

// Sin país, primero se busca solo en Uruguay, y vale si es una localidad de verdad ("Colonia" es Colonia del Sacramento,
// "San José" es San José de Mayo); si no, el primer resultado del mundo, que Open-Meteo ordena por relevancia y
// población. Con "ciudad, país" (o región) se lo pasa entero, que el geocodificador lo entiende, y si eso no da nada se
// filtra a mano entre las homónimas ("Salto, ar"). Devuelve { nombre, pais, region, lat, lon } o null.
export async function buscarLugar(texto, ahora = Date.now()) {
  const [nombre, ...resto] = String(texto || "").split(",").map((p) => p.trim());
  if (!nombre) return null;
  const filtro = normalizar(resto.join(" "));
  const clave = `${normalizar(nombre)}|${filtro}`;
  const guardado = cacheLugares.get(clave);
  if (guardado && guardado.hasta > ahora) return guardado.lugar;

  let elegido;
  if (filtro) {
    elegido = (await buscar(`${nombre}, ${resto.join(", ")}`))[0];
    if (!elegido) {
      const lista = await buscar(nombre);
      const region = (x) => normalizar(x.admin1) === filtro || normalizar(x.admin1).endsWith(` ${filtro}`);
      elegido = lista.find((x) => normalizar(x.country_code) === filtro) || lista.find((x) => normalizar(x.country).startsWith(filtro) || region(x));
    }
  } else {
    const local = (x) => String(x.feature_code || "").startsWith("PPL") && x.population >= CLIMA.POBLACION_MIN;
    elegido = (await buscar(nombre, `&countryCode=${CLIMA.PAIS}`)).find(local) || (await buscar(nombre))[0];
  }
  const lugar = elegido ? { nombre: elegido.name, pais: elegido.country || elegido.country_code || "", region: elegido.admin1 || "", lat: elegido.latitude, lon: elegido.longitude } : null;
  cacheLugares.set(clave, { lugar, hasta: ahora + CLIMA.CACHE_LUGAR_MS });
  return lugar;
}

// ---------- pronóstico ----------
const cacheClimas = new Map();

export async function pedirClima(lugar, ahora = Date.now()) {
  const clave = `${lugar.lat},${lugar.lon}`;
  const guardado = cacheClimas.get(clave);
  if (guardado && guardado.hasta > ahora) return guardado.datos;
  const q = new URLSearchParams({
    latitude: lugar.lat,
    longitude: lugar.lon,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
    timezone: "auto",
    forecast_days: "2",
  });
  const datos = await pedirJson(`${CLIMA.URL}?${q}`);
  if (!datos.current || !datos.daily) throw new Error("respuesta incompleta");
  cacheClimas.set(clave, { datos, hasta: ahora + CLIMA.CACHE_CLIMA_MS });
  return datos;
}

// ---------- textos ----------
// Códigos WMO de estado del tiempo que usa Open-Meteo: [emoji de día, texto, emoji de noche si cambia].
const CODIGOS = {
  0: ["☀️", "despejado", "🌙"],
  1: ["🌤️", "mayormente despejado", "🌙"],
  2: ["⛅", "parcialmente nublado", "☁️"],
  3: ["☁️", "nublado"],
  45: ["🌫️", "niebla"],
  48: ["🌫️", "niebla con escarcha"],
  51: ["🌦️", "llovizna leve"],
  53: ["🌦️", "llovizna"],
  55: ["🌧️", "llovizna intensa"],
  56: ["🌧️", "llovizna helada"],
  57: ["🌧️", "llovizna helada intensa"],
  61: ["🌧️", "lluvia leve"],
  63: ["🌧️", "lluvia"],
  65: ["🌧️", "lluvia intensa"],
  66: ["🌧️", "lluvia helada"],
  67: ["🌧️", "lluvia helada intensa"],
  71: ["🌨️", "nieve leve"],
  73: ["🌨️", "nieve"],
  75: ["🌨️", "nieve intensa"],
  77: ["🌨️", "granos de nieve"],
  80: ["🌦️", "chaparrones leves"],
  81: ["🌧️", "chaparrones"],
  82: ["⛈️", "chaparrones fuertes"],
  85: ["🌨️", "chaparrones de nieve"],
  86: ["🌨️", "chaparrones de nieve fuertes"],
  95: ["⛈️", "tormenta"],
  96: ["⛈️", "tormenta con granizo"],
  99: ["⛈️", "tormenta con granizo fuerte"],
};

export function describirCodigo(codigo, esDia = true) {
  const c = CODIGOS[codigo];
  if (!c) return { emoji: "🌡️", texto: `estado ${codigo}` };
  return { emoji: !esDia && c[2] ? c[2] : c[0], texto: c[1] };
}

const RUMBOS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
export const rumbo = (grados) => RUMBOS[Math.round(((Number(grados) % 360) + 360) % 360 / 45) % 8];

// 13.6 → "13,6"; 13.0 → "13"
const num = (n) => Number(n).toFixed(1).replace(/\.0$/, "").replace(".", ",");
const lluvia = (p) => (p == null ? "" : `${Math.round(p)} % de lluvia`);

export function textoClima(lugar, datos) {
  const c = datos.current;
  const d = datos.daily;
  const hoy = describirCodigo(c.weather_code, c.is_day !== 0);
  const manana = describirCodigo(d.weather_code?.[1]);
  const viento = Math.round(c.wind_speed_10m);
  const rafagas = Math.round(c.wind_gusts_10m);
  const lineas = [
    `${hoy.emoji} *${lugar.nombre}${lugar.pais ? `, ${lugar.pais}` : ""}* · ${hoy.texto}`,
    `🌡️ ${num(c.temperature_2m)} °C, sensación ${num(c.apparent_temperature)} · hoy mín ${num(d.temperature_2m_min[0])}, máx ${num(d.temperature_2m_max[0])}`,
    `💧 Humedad ${Math.round(c.relative_humidity_2m)} % · 🌬️ ${viento < 2 ? "viento calmo" : `viento ${rumbo(c.wind_direction_10m)} ${viento} km/h`}${rafagas >= CLIMA.RAFAGA_MIN ? `, ráfagas ${rafagas}` : ""}`,
  ];
  const hoyLluvia = lluvia(d.precipitation_probability_max?.[0]);
  const partes = [];
  if (hoyLluvia) partes.push(`Hoy ${hoyLluvia}`);
  if (d.temperature_2m_min[1] != null) {
    const mananaLluvia = lluvia(d.precipitation_probability_max?.[1]);
    partes.push(`Mañana: ${manana.texto}, ${num(d.temperature_2m_min[1])} a ${num(d.temperature_2m_max[1])} °C${mananaLluvia ? `, ${mananaLluvia}` : ""}`);
  }
  if (partes.length) lineas.push(`☔ ${partes.join(" · ")}`);
  lineas.push(`_Fuente: Open-Meteo, ${String(c.time || "").slice(11, 16) || "ahora"} hora local._`);
  return lineas.join("\n");
}

// .clima [ciudad o "ciudad, país"]. Sin nada, Montevideo.
export async function textoClimaDe(texto, ahora = Date.now()) {
  const consulta = String(texto || "").trim() || CLIMA.DEFAULT;
  let lugar;
  try {
    lugar = await buscarLugar(consulta, ahora);
  } catch (e) {
    return `No pude ubicar «${consulta}» ahora (${e.message}). Probá en un rato.`;
  }
  if (!lugar) return `No encontré «${consulta}». Probá con el nombre de la ciudad, o ciudad y país: .clima Salto, Argentina`;
  try {
    return textoClima(lugar, await pedirClima(lugar, ahora));
  } catch (e) {
    return `No pude consultar el clima de ${lugar.nombre} ahora (${e.message}). Probá en un rato.`;
  }
}
