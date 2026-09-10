import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as C from "../lib/clima.js";

const respuesta = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const lugar = (name, country_code, country, admin1, latitude, longitude, feature_code = "PPL", population) => ({ name, country_code, country, admin1, latitude, longitude, feature_code, population });
// Lugares reales del geocodificador de Open-Meteo (8/9/2026), recortados. El falso de abajo imita cómo busca: por el
// nombre, con "nombre, país o región" como calificador, y con countryCode.
const LUGARES = [
  lugar("Salto", "BR", "Brasil", "Estado de São Paulo", -23.2, -47.29, "PPLA2", 119736),
  lugar("Salto", "UY", "Uruguay", "Departamento de Salto", -31.38, -57.96, "PPLA", 99823),
  lugar("Salto", "AR", "Argentina", "Buenos Aires", -34.29, -60.25, "PPL", 40157),
  lugar("Madrid", "ES", "España", "Comunidad Autónoma de Madrid", 40.42, -3.7, "PPLC", 3255944),
  lugar("Madrid", "CO", "Colombia", "Cundinamarca", 4.73, -74.26, "PPL", 135000),
  lugar("Montevideo", "UY", "Uruguay", "Departamento de Montevideo", -34.9, -56.19, "PPLC", 1319108),
  lugar("Colonia", "DE", "Alemania", "Renania del Norte-Westfalia", 50.93, 6.95, "PPLA2", 963395),
  lugar("Colonia del Sacramento", "UY", "Uruguay", "Departamento de Colonia", -34.46, -57.84, "PPLA", 21714),
  lugar("Santiago", "CL", "Chile", "Región Metropolitana de Santiago", -33.46, -70.65, "PPLC", 4837295),
  lugar("Santiago Vázquez", "UY", "Uruguay", "Departamento de Montevideo", -34.79, -56.35, "PPL", 1468),
  lugar("Buenos Aires", "AR", "Argentina", "Ciudad Autónoma de Buenos Aires", -34.61, -58.38, "PPLC", 2891082),
  lugar("Buenos Aires", "UY", "Uruguay", "Departamento de Maldonado", -34.85, -55.1, "PPLX"),
];
const sinTildes = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function geocodificarFalso(url) {
  const q = new URL(url).searchParams;
  const [nombre, ...resto] = decodeURIComponent(q.get("name")).split(",").map((p) => sinTildes(p).trim());
  const calificador = resto.join(" ").trim();
  const pais = q.get("countryCode");
  const results = LUGARES.filter((x) => sinTildes(x.name).startsWith(nombre))
    .filter((x) => !calificador || [x.country, x.admin1].some((c) => sinTildes(c) === calificador || sinTildes(c).endsWith(` ${calificador}`)))
    .filter((x) => !pais || x.country_code === pais);
  return results.length ? { results } : {};
}
const PRONOSTICO = {
  timezone: "America/Montevideo",
  current: { time: "2026-09-08T14:00", interval: 900, temperature_2m: 13.6, relative_humidity_2m: 64, apparent_temperature: 12.5, weather_code: 2, wind_speed_10m: 7.0, wind_direction_10m: 314, wind_gusts_10m: 12.6, is_day: 1 },
  daily: { time: ["2026-09-08", "2026-09-09"], temperature_2m_max: [13.6, 13.4], temperature_2m_min: [6.4, 7.7], precipitation_probability_max: [0, 11], weather_code: [3, 3] },
};
const MVD = { nombre: "Montevideo", pais: "Uruguay", region: "Departamento de Montevideo", lat: -34.9, lon: -56.19 };
const TEXTO_MVD = [
  "⛅ *Montevideo, Uruguay* · parcialmente nublado",
  "🌡️ 13,6 °C, sensación 12,5 · hoy mín 6,4, máx 13,6",
  "💧 Humedad 64 % · 🌬️ viento NO 7 km/h",
  "☔ Hoy 0 % de lluvia · Mañana: nublado, 7,7 a 13,4 °C, 11 % de lluvia",
  "_Fuente: Open-Meteo, 14:00 hora local._",
].join("\n");

let pedidos;
beforeEach(() => {
  pedidos = [];
  C._dep.fetch = async (url) => {
    pedidos.push(url);
    if (url.startsWith(C.CLIMA.GEOCODER)) return respuesta(200, geocodificarFalso(url));
    return respuesta(200, structuredClone(PRONOSTICO));
  };
});
// cada test usa un instante distinto para que las cachés de 24 h y 10 min no se pisen entre tests
let reloj = Date.UTC(2030, 0, 1);
const ahora = () => (reloj += 48 * 60 * 60 * 1000);

test("buscarLugar prefiere la localidad uruguaya y entiende 'ciudad, país'", async () => {
  const t = ahora();
  assert.equal((await C.buscarLugar("Salto", t)).pais, "Uruguay");
  assert.equal(pedidos.length, 1, "la uruguaya sale en una sola consulta");
  assert.match(pedidos[0], /name=Salto&count=10&language=es&countryCode=UY$/);
  assert.equal((await C.buscarLugar("Colonia", t)).nombre, "Colonia del Sacramento", "aunque en el mundo gane la alemana");
  assert.equal((await C.buscarLugar("Santiago", t)).pais, "Chile", "un pueblito uruguayo no le gana a una capital");
  assert.equal((await C.buscarLugar("Buenos Aires", t)).pais, "Argentina", "ni un paraje sin población");
  assert.equal((await C.buscarLugar("Madrid", t)).pais, "España", "sin uruguaya, el primero del mundo");
  assert.equal(pedidos.length, 1 + 1 + 2 + 2 + 2, "las de afuera cuestan dos consultas: Uruguay y después el mundo");
  assert.match(pedidos.at(-1), /name=Madrid&count=10&language=es$/);

  pedidos = [];
  assert.equal((await C.buscarLugar("salto, argentina", t)).lat, -34.29, "con país, el de ese país");
  assert.match(pedidos[0], /name=salto%2C%20argentina&/, "el país va en la consulta, que el geocodificador lo entiende");
  assert.equal((await C.buscarLugar("Salto, sao paulo", t)).pais, "Brasil", "o la región, sin tildes");
  assert.equal((await C.buscarLugar("Colonia, Uruguay", t)).nombre, "Colonia del Sacramento");
  assert.equal((await C.buscarLugar("Salto, ar", t)).pais, "Argentina", "un código de país no lo entiende el geocodificador; se filtra acá");
  assert.equal(await C.buscarLugar("Salto, Francia", t), null, "si no hay en ese país, nada");
  assert.equal(await C.buscarLugar("zzz", t), null);
  assert.equal(await C.buscarLugar("", t), null);
  assert.equal(await C.buscarLugar(" , Uruguay", t), null);

  const antes = pedidos.length;
  await C.buscarLugar("SALTO, Argentina", t + 1000);
  assert.equal(pedidos.length, antes, "en caché 24 horas");
  await C.buscarLugar("Salto, Argentina", t + C.CLIMA.CACHE_LUGAR_MS + 1);
  assert.equal(pedidos.length, antes + 1, "vencida, vuelve a pedir");
});

test("textoClima arma el mensaje con lo de ahora, el día y mañana", () => {
  assert.equal(C.textoClima(MVD, PRONOSTICO), TEXTO_MVD);
});

test("variantes: noche, ráfagas, viento calmo, código raro y sin probabilidad de lluvia", () => {
  const con = (current = {}, daily = {}) => C.textoClima(MVD, { current: { ...PRONOSTICO.current, ...current }, daily: { ...PRONOSTICO.daily, ...daily } });
  assert.match(con({ weather_code: 0, is_day: 0 }), /^🌙 \*Montevideo, Uruguay\* · despejado\n/);
  assert.match(con({ weather_code: 0 }), /^☀️ /);
  assert.match(con({ weather_code: 3, is_day: 0 }), /^☁️ .* · nublado\n/, "de noche sin emoji propio, el de siempre");
  assert.match(con({ weather_code: 95 }), /^⛈️ .* · tormenta\n/);
  assert.match(con({ weather_code: 42 }), /^🌡️ .* · estado 42\n/, "un código que no está en la tabla no rompe");
  assert.match(con({ wind_speed_10m: 28.4, wind_direction_10m: 180, wind_gusts_10m: 47.2 }), /🌬️ viento S 28 km\/h, ráfagas 47\n/);
  assert.match(con({ wind_speed_10m: 1.4, wind_gusts_10m: 3 }), /🌬️ viento calmo\n/);
  assert.match(con({ temperature_2m: 20, apparent_temperature: -1.25 }), /🌡️ 20 °C, sensación -1,3 · /, "sin decimal inútil y con coma");
  assert.match(con({}, { precipitation_probability_max: [null, null] }), /\n☔ Mañana: nublado, 7,7 a 13,4 °C\n/, "sin probabilidad, se omite");
  assert.match(con({}, { temperature_2m_min: [6.4], temperature_2m_max: [13.6], weather_code: [3], precipitation_probability_max: [0] }), /\n☔ Hoy 0 % de lluvia\n/, "sin mañana, solo hoy");
  assert.match(con({ time: undefined }), /Open-Meteo, ahora hora local/);
  assert.equal(C.rumbo(0), "N");
  assert.equal(C.rumbo(359), "N");
  assert.equal(C.rumbo(22), "N");
  assert.equal(C.rumbo(23), "NE");
  assert.equal(C.rumbo(270), "O");
  assert.equal(C.rumbo(225), "SO");
});

test("textoClimaDe: Montevideo por defecto, pedido con los campos justos, caché de 10 minutos y errores claros", async () => {
  const t = ahora();
  assert.equal(await C.textoClimaDe("", t), TEXTO_MVD);
  assert.equal(pedidos.length, 2);
  assert.match(pedidos[0], /name=Montevideo&.*countryCode=UY/);
  const q = new URL(pedidos[1]).searchParams;
  assert.equal(pedidos[1].split("?")[0], C.CLIMA.URL);
  assert.equal(q.get("latitude"), "-34.9");
  assert.equal(q.get("longitude"), "-56.19");
  assert.equal(q.get("current"), "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day");
  assert.equal(q.get("daily"), "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code");
  assert.equal(q.get("timezone"), "auto");
  assert.equal(q.get("forecast_days"), "2");
  await C.textoClimaDe("  montevideo ", t + 5 * 60 * 1000);
  assert.equal(pedidos.length, 2, "mismo lugar dentro de los 10 minutos: nada nuevo");
  await C.textoClimaDe("Montevideo", t + C.CLIMA.CACHE_CLIMA_MS + 1);
  assert.equal(pedidos.length, 3, "pasados los 10 minutos, pide el clima de nuevo");

  assert.equal(await C.textoClimaDe("zzz", t), "No encontré «zzz». Probá con el nombre de la ciudad, o ciudad y país: .clima Salto, Argentina");
  C._dep.fetch = async () => respuesta(503, {});
  assert.equal(await C.textoClimaDe("Rocha", t), "No pude ubicar «Rocha» ahora (Open-Meteo respondió 503). Probá en un rato.");
  C._dep.fetch = async (url) => (url.startsWith(C.CLIMA.GEOCODER) ? respuesta(200, geocodificarFalso(url)) : respuesta(500, {}));
  assert.equal(await C.textoClimaDe("Madrid", t), "No pude consultar el clima de Madrid ahora (Open-Meteo respondió 500). Probá en un rato.");
  C._dep.fetch = async (url) => (url.startsWith(C.CLIMA.GEOCODER) ? respuesta(200, geocodificarFalso(url)) : respuesta(200, { error: true }));
  assert.equal(await C.textoClimaDe("Salto", t), "No pude consultar el clima de Salto ahora (respuesta incompleta). Probá en un rato.");
});

test("el plugin .clima responde en el chat, sin ciudad también", async () => {
  const P = (await import("../plugins/tools-clima.js")).default;
  assert.deepEqual(P.cmd, ["clima", "tiempo"]);
  const enviados = [];
  const client = { sendText: async (chat, texto) => enviados.push({ chat, texto }), sendPresenceUpdate: async () => {} };
  await P.run({ chat: "g@g.us" }, { client, text: "" });
  assert.equal(enviados[0].chat, "g@g.us");
  assert.match(enviados[0].texto, /^⛅ \*Montevideo, Uruguay\*/);
});
