// Meteorología aeronáutica: METAR y TAF desde la API pública del Aviation Weather Center de la NOAA (sin clave).
// El METAR se decodifica a español con los campos que ya trae parseados la API más el texto crudo; el TAF se
// muestra crudo. Hay un caché corto por estación para no pegarle a la NOAA con cada pedido del grupo.
import { duracion } from "./tiempo.js";
import { textoSol } from "./aero-calculos.js";

export const AERO = {
  TIMEOUT_MS: 15000,
  CACHE_MS: 5 * 60 * 1000,
  MAX_ESTACIONES: 4,
  DEFAULT: "SUMU", // Carrasco
  URL: "https://aviationweather.gov/api/data",
  GEOCODER: "https://geocoding-api.open-meteo.com/v1/search",
  FIR: { id: "SUEO", nombre: "Montevideo" },
};

// Nombres comunes → ICAO, para escribir .metar carrasco o .metar punta. Se busca sin acentos ni mayúsculas.
export const ALIAS = {
  carrasco: "SUMU", montevideo: "SUMU", mvd: "SUMU",
  adami: "SUAA", melilla: "SUAA",
  punta: "SULS", pde: "SULS", laguna: "SULS", maldonado: "SULS",
  durazno: "SUDU", rivera: "SURV", salto: "SUSO", paysandu: "SUPU", melo: "SUMO", tacuarembo: "SUTB", artigas: "SUAG", colonia: "SUCA",
  ezeiza: "SAEZ", aeroparque: "SABE", buenosaires: "SAEZ", portoalegre: "SBPA", guarulhos: "SBGR", saopaulo: "SBGR", santiago: "SCEL", asuncion: "SGAS",
};

const normalizar = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// "sumu punta xx" → { icaos: ["SUMU", "SULS"], invalidas: ["xx"] }. Sin texto, el aeródromo por defecto.
export function resolverEstaciones(texto) {
  const partes = String(texto || "").split(/[\s,;]+/).filter(Boolean);
  if (!partes.length) return { icaos: [AERO.DEFAULT], invalidas: [] };
  const icaos = [];
  const invalidas = [];
  for (const p of partes) {
    const icao = ALIAS[normalizar(p)] || (/^[A-Za-z0-9]{4}$/.test(p) ? p.toUpperCase() : null);
    if (!icao) invalidas.push(p);
    else if (!icaos.includes(icao)) icaos.push(icao);
  }
  return { icaos: icaos.slice(0, AERO.MAX_ESTACIONES), invalidas };
}

// Para poder inyectar el fetch en los tests.
export const _dep = { fetch: (...args) => fetch(...args) };
const cache = new Map();

// tipo "metar" → lista de objetos (uno por estación con reporte); "taf" → texto crudo (vacío si no hay);
// "isigmet" → todos los SIGMET internacionales vigentes (no acepta filtro, se filtra por FIR acá).
export async function pedir(tipo, icaos = [], ahora = Date.now()) {
  const clave = `${tipo}:${icaos.join(",")}`;
  const guardado = cache.get(clave);
  if (guardado && guardado.hasta > ahora) return guardado.datos;
  const formato = tipo === "taf" ? "raw" : "json";
  const ids = icaos.length ? `ids=${encodeURIComponent(icaos.join(","))}&` : "";
  const res = await _dep.fetch(`${AERO.URL}/${tipo}?${ids}format=${formato}`, { signal: AbortSignal.timeout(AERO.TIMEOUT_MS) });
  if (res.status === 204) return tipo === "taf" ? "" : [];
  if (!res.ok) throw new Error(`la NOAA respondió ${res.status}`);
  const datos = tipo === "taf" ? (await res.text()).trim() : await res.json();
  cache.set(clave, { datos, hasta: ahora + AERO.CACHE_MS });
  return datos;
}

// ---------- decodificación del METAR ----------
const CATEGORIAS = { VFR: "🟢 VFR", MVFR: "🔵 MVFR", IFR: "🔴 IFR", LIFR: "🟣 LIFR" };
const NUBES = { FEW: "pocas", SCT: "dispersas", BKN: "quebradas", OVC: "cubierto", OVX: "oscurecido" };
const FENOMENOS = { DZ: "llovizna", RA: "lluvia", SN: "nieve", SG: "cinarra", PL: "hielo granulado", GR: "granizo", GS: "granizo chico", UP: "precipitación", BR: "neblina", FG: "niebla", FU: "humo", HZ: "calima", DU: "polvo", SA: "arena", VA: "ceniza volcánica", SQ: "turbonada", FC: "tornado o tromba", TS: "tormenta", SH: "chubascos de", FZ: "engelante", MI: "baja", BC: "bancos de", DR: "ventisca baja de", BL: "ventisca de", PR: "parcial", VC: "en las cercanías" };
const RE_FENOMENO = /^[-+]?(?:VC)?(?:MI|BC|PR|TS|BL|SH|DR|FZ)?(?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+$/;

function traducirFenomeno(codigo) {
  const intensidad = codigo.startsWith("+") ? "fuerte " : codigo.startsWith("-") ? "débil " : "";
  const partes = codigo.replace(/^[-+]/, "").match(/VC|MI|BC|PR|TS|BL|SH|DR|FZ|DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS/g) || [];
  return `${intensidad}${partes.map((p) => FENOMENOS[p] || p).join(" ")}`.trim();
}

// Visibilidad y fenómenos salen del texto crudo, que en esta región viene en metros; la API los da en millas.
function visibilidadDe(raw, visib) {
  const m = String(raw || "").match(/\s(\d{4})(?:\s|$)/);
  if (m) {
    const metros = Number(m[1]);
    return metros >= 9999 ? "10 km o más" : metros >= 1000 ? `${(metros / 1000).toFixed(metros % 1000 ? 1 : 0)} km` : `${metros} m`;
  }
  if (/\bCAVOK\b/.test(raw || "")) return "10 km o más (CAVOK)";
  if (visib === undefined || visib === null) return null;
  const millas = String(visib).endsWith("+") ? Number(String(visib).slice(0, -1)) : Number(visib);
  if (Number.isNaN(millas)) return null;
  return `${String(visib).endsWith("+") ? "más de " : ""}${(millas * 1.609).toFixed(millas < 2 ? 1 : 0)} km`;
}

function fenomenosDe(raw) {
  const cuerpo = String(raw || "").split(/\s(?:TEMPO|BECMG|NOSIG|RMK)\b/)[0];
  return cuerpo.split(/\s+/).slice(2).filter((t) => RE_FENOMENO.test(t)).map(traducirFenomeno);
}

function tendenciaDe(raw) {
  const m = String(raw || "").match(/\s((?:TEMPO|BECMG|NOSIG)\b.*)$/);
  return m ? m[1].replace(/\sRMK\b.*$/, "").trim() : null;
}

export function decodificarMetar(o, ahora = Date.now()) {
  const raw = o.rawOb || "";
  const hora = o.reportTime ? new Date(o.reportTime) : null;
  const hh = hora ? `${String(hora.getUTCHours()).padStart(2, "0")}:${String(hora.getUTCMinutes()).padStart(2, "0")}Z` : "";
  const haceMin = hora ? Math.max(0, Math.round((ahora - hora.getTime()) / 60000)) : null;
  const lineas = [`✈️ *${o.icaoId}* ${o.name ? o.name.replace(/,\s*[A-Z]{2},\s*[A-Z]{2}$/, "") : ""}${hh ? ` · ${hh}` : ""}${haceMin !== null ? ` (hace ${haceMin} min)` : ""}`.trim()];

  if (o.wspd === 0 || o.wdir === 0 && !o.wspd) lineas.push("🌬️ Viento calma");
  else if (o.wspd !== undefined && o.wspd !== null) {
    const dir = o.wdir === "VRB" || o.wdir === null ? "variable" : `${String(o.wdir).padStart(3, "0")}°`;
    lineas.push(`🌬️ Viento ${dir} ${o.wspd} kt${o.wgst ? ` (ráfagas ${o.wgst})` : ""}`);
  }

  const vis = visibilidadDe(raw, o.visib);
  if (vis) lineas.push(`👁️ Visibilidad ${vis}`);

  const fen = fenomenosDe(raw);
  if (fen.length) lineas.push(`🌧️ ${fen.join(", ")}`);

  const nubes = Array.isArray(o.clouds) ? o.clouds.filter((c) => c.cover && NUBES[c.cover]) : [];
  if (nubes.length) lineas.push(`☁️ Nubes: ${nubes.map((c) => `${c.cover} ${NUBES[c.cover]} a ${c.base} ft`).join(", ")}`);
  else if (/\b(CAVOK|CLR|SKC|NSC|NCD)\b/.test(raw) || (Array.isArray(o.clouds) && o.clouds.some((c) => /CLR|SKC|CAVOK/.test(c.cover || "")))) lineas.push("☁️ Cielo despejado");

  const temp = [];
  if (o.temp !== undefined && o.temp !== null) temp.push(`${o.temp} °C`);
  if (o.dewp !== undefined && o.dewp !== null) temp.push(`rocío ${o.dewp} °C`);
  if (o.altim !== undefined && o.altim !== null) temp.push(`QNH ${Math.round(o.altim)} hPa`);
  if (temp.length) lineas.push(`🌡️ ${temp.join(" · ")}`);

  if (o.fltCat && CATEGORIAS[o.fltCat]) lineas.push(`🛫 Categoría ${CATEGORIAS[o.fltCat]}`);
  const tendencia = tendenciaDe(raw);
  if (tendencia) lineas.push(`🔜 Tendencia: ${tendencia}`);
  lineas.push(`\`${raw}\``);
  return lineas.join("\n");
}

// ---------- textos de los comandos ----------
export async function textoMetar(texto, ahora = Date.now()) {
  const { icaos, invalidas } = resolverEstaciones(texto);
  const avisos = invalidas.length ? [`No entendí "${invalidas.join('", "')}": usá el código ICAO de 4 letras o un nombre conocido (.menuaero).`] : [];
  if (!icaos.length) return avisos.join("\n");
  let datos;
  try {
    datos = await pedir("metar", icaos, ahora);
  } catch (e) {
    return [`No pude consultar la NOAA ahora (${e.message}). Probá en un rato.`, ...avisos].join("\n");
  }
  const bloques = icaos.map((icao) => {
    const o = datos.find((d) => d.icaoId === icao);
    return o ? decodificarMetar(o, ahora) : `✈️ *${icao}*: sin METAR reciente. ¿Existe el aeródromo y reporta? Probá con .menuaero para ver los conocidos.`;
  });
  return [...bloques, ...avisos].join("\n\n");
}

export async function textoTaf(texto, ahora = Date.now()) {
  const { icaos, invalidas } = resolverEstaciones(texto);
  const avisos = invalidas.length ? [`No entendí "${invalidas.join('", "')}": usá el código ICAO de 4 letras o un nombre conocido (.menuaero).`] : [];
  if (!icaos.length) return avisos.join("\n");
  let raw;
  try {
    raw = await pedir("taf", icaos, ahora);
  } catch (e) {
    return [`No pude consultar la NOAA ahora (${e.message}). Probá en un rato.`, ...avisos].join("\n");
  }
  if (!raw) return [`Sin TAF para ${icaos.join(", ")}. No todos los aeródromos emiten pronóstico; en Uruguay lo hacen Carrasco y Laguna del Sauce.`, ...avisos].join("\n\n");
  return [`📋 *TAF* ${icaos.join(", ")} (horas en UTC)\n\`\`\`${raw}\`\`\``, ...avisos].join("\n\n");
}

// ---------- SIGMET ----------
const PELIGROS = { TS: ["tormentas", "f", true], TURB: ["turbulencia", "f", false], ICE: ["engelamiento", "m", false], MTW: ["ondas de montaña", "f", true], VA: ["ceniza volcánica", "f", false], TC: ["ciclón tropical", "m", false], DS: ["tormenta de polvo", "f", false], SS: ["tormenta de arena", "f", false], RDOACT: ["nube radiactiva", "f", false] };
const CALIFICADORES = { SEV: { f: "severa", m: "severo", fp: "severas" }, EMBD: { f: "embebidas", m: "embebido", fp: "embebidas" }, FRQ: { f: "frecuentes", m: "frecuente", fp: "frecuentes" }, OBSC: { f: "oscurecidas", m: "oscurecido", fp: "oscurecidas" }, SQL: { f: "en línea de turbonada", m: "en línea de turbonada", fp: "en línea de turbonada" }, ISOL: { f: "aisladas", m: "aislado", fp: "aisladas" }, OCNL: { f: "ocasionales", m: "ocasional", fp: "ocasionales" }, HVY: { f: "intensa", m: "intenso", fp: "intensas" }, MOD: { f: "moderada", m: "moderado", fp: "moderadas" } };
const CAMBIOS = { NC: "sin cambios", INTSF: "intensificándose", WKN: "debilitándose" };
const hhmmZ = (seg) => { const d = new Date(seg * 1000); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}Z`; };
const FL = (ft) => `FL${String(Math.round(ft / 100)).padStart(3, "0")}`;

export function describirSigmet(s, ahora = Date.now()) {
  const [nombre, genero, plural] = PELIGROS[s.hazard] || [s.hazard, "f", false];
  let peligro = nombre;
  if (s.hazard === "VA" && s.qualifier) peligro += ` del volcán ${s.qualifier}`;
  else if (s.qualifier && CALIFICADORES[s.qualifier]) peligro += ` ${CALIFICADORES[s.qualifier][plural ? "fp" : genero]}`;
  else if (s.qualifier) peligro += ` ${s.qualifier}`;
  const lineas = [`*SIGMET ${s.seriesId}* · ${peligro}`];
  const faltan = s.validTimeTo * 1000 - ahora;
  lineas.push(`⏱️ ${hhmmZ(s.validTimeFrom)} a ${hhmmZ(s.validTimeTo)}${faltan > 0 ? ` (quedan ${duracion(faltan)})` : ""}`);
  const niveles = s.base && s.top ? `${FL(s.base)} a ${FL(s.top)}` : s.top ? `hasta ${FL(s.top)}` : s.base ? `desde ${FL(s.base)}` : null;
  const mov = !s.dir || s.dir === "-" || !Number(s.spd) ? "estacionario" : `se mueve al ${s.dir} a ${Number(s.spd)} kt`;
  lineas.push(`📏 ${niveles ? `${niveles} · ` : ""}${mov}${CAMBIOS[s.chng] ? ` · ${CAMBIOS[s.chng]}` : ""}`);
  lineas.push(`\`${String(s.rawSigmet || "").replace(/\s+/g, " ").trim()}\``);
  return lineas.join("\n");
}

export async function textoSigmet(ahora = Date.now()) {
  let lista;
  try {
    lista = await pedir("isigmet", [], ahora);
  } catch (e) {
    return `No pude consultar la NOAA ahora (${e.message}). Probá en un rato.`;
  }
  const vigentes = lista.filter((s) => s.firId === AERO.FIR.id && s.validTimeTo * 1000 > ahora).sort((a, b) => a.validTimeFrom - b.validTimeFrom);
  const cabecera = `⚠️ *SIGMET · FIR ${AERO.FIR.nombre} (${AERO.FIR.id})* · consultado ${hhmmZ(ahora / 1000)}`;
  if (!vigentes.length) return `${cabecera}\n✅ Sin SIGMET vigente. Sin avisos de tormentas, turbulencia, engelamiento ni ceniza en la FIR.`;
  return [cabecera, ...vigentes.map((s) => describirSigmet(s, ahora))].join("\n\n");
}

// ---------- sol: ciudad → coordenadas con Open-Meteo, cálculo local ----------
const cacheLugares = new Map();
export async function geocodificar(nombre, ahora = Date.now()) {
  const clave = normalizar(nombre);
  const guardado = cacheLugares.get(clave);
  if (guardado && guardado.hasta > ahora) return guardado.lugar;
  const res = await _dep.fetch(`${AERO.GEOCODER}?name=${encodeURIComponent(nombre)}&count=1&language=es`, { signal: AbortSignal.timeout(AERO.TIMEOUT_MS) });
  if (!res.ok) throw new Error(`el geocodificador respondió ${res.status}`);
  const r = (await res.json()).results?.[0];
  const lugar = r ? { nombre: r.name, pais: r.country || "", region: r.admin1 || "", lat: r.latitude, lon: r.longitude, tz: r.timezone || "UTC" } : null;
  cacheLugares.set(clave, { lugar, hasta: ahora + 24 * 60 * 60 * 1000 });
  return lugar;
}

export async function textoSolDe(texto, ahora = Date.now()) {
  const nombre = String(texto || "").trim() || "Montevideo";
  let lugar;
  try {
    lugar = await geocodificar(nombre, ahora);
  } catch (e) {
    return `No pude ubicar "${nombre}" ahora (${e.message}). Probá en un rato.`;
  }
  if (!lugar) return `No encontré "${nombre}". Probá con el nombre de la ciudad, por ejemplo .sol Rivera o .sol Buenos Aires.`;
  return textoSol(lugar, ahora);
}

export function textoMenuAero() {
  const alias = Object.entries(ALIAS).filter(([, icao]) => icao.startsWith("SU")).map(([nombre, icao]) => `${nombre} → ${icao}`).join(" · ");
  return `✈️ *MENÚ AERO*
Meteorología aeronáutica, de la NOAA (Aviation Weather Center), y reloj. Horas en UTC.

▸ .metar — METAR de Carrasco, decodificado
▸ .metar SULS — el de otro aeródromo (código ICAO), hasta ${AERO.MAX_ESTACIONES} por pedido
▸ .metar punta salto — también por nombre
▸ .taf — TAF (pronóstico) de Carrasco; .taf SULS para otro
▸ .sigmet — avisos vigentes en la FIR Montevideo: tormentas, turbulencia, engelamiento, ceniza
▸ .cruzado 06 190 19 — viento cruzado y de frente para esa pista con ese viento (también .cruzado 06 19019G25KT)
▸ .reciproco 045 — rumbo recíproco; .reciproco 06L da la pista opuesta, y acepta varios de una
▸ .factorcarga 45 — factor de carga y velocidad de pérdida en el viraje; .factorcarga 45 50 con tu Vs; sin nada, la tabla
▸ .sol — salida, puesta y crepúsculo civil en Montevideo; .sol Rivera para otra ciudad
▸ .zulu — hora Zulu, hora de Uruguay y las 25 zonas horarias con su letra militar
▸ .dtg — lo mismo en formato DTG (061532Z SEP 26)

Nombres que entiende: ${alias}.
Categorías: 🟢 VFR · 🔵 MVFR · 🔴 IFR · 🟣 LIFR.`;
}
