// Cálculos aeronáuticos sin ninguna API: viento cruzado y eventos solares (salida, puesta y crepúsculo civil).
const rad = (g) => (g * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

// ---------- viento cruzado ----------
// pista: "06", "6", "060", "24L" → rumbo en grados. Viento: dirección 0-360 y velocidad en kt, ráfaga opcional.
export function rumboDePista(texto) {
  const m = String(texto || "").trim().toUpperCase().match(/^(\d{1,3})[LRC]?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const rumbo = m[1].length === 3 ? n : n * 10;
  if (rumbo < 0 || rumbo > 360) return null;
  return rumbo === 0 ? 360 : rumbo;
}

function componentes(rumbo, dir, vel) {
  const angulo = ((dir - rumbo + 540) % 360) - 180; // -180..180: positivo = viento desde la derecha
  const frente = vel * Math.cos(rad(angulo));
  const cruzada = vel * Math.sin(rad(angulo));
  return { angulo, frente, cruzada: Math.abs(cruzada), lado: Math.abs(cruzada) < 0.5 ? null : cruzada > 0 ? "derecha" : "izquierda" };
}

export function vientoCruzado(rumboPista, dirViento, velocidad, rafaga = null) {
  const opuesta = ((rumboPista + 180 - 1) % 360) + 1;
  const r = { rumboPista, dirViento, velocidad, rafaga, actual: componentes(rumboPista, dirViento, velocidad), opuesta: { rumbo: opuesta, ...componentes(opuesta, dirViento, velocidad) } };
  if (rafaga) r.conRafaga = { actual: componentes(rumboPista, dirViento, rafaga), opuesta: componentes(opuesta, dirViento, rafaga) };
  return r;
}

// ".cruzado 06 190 19", "06 190/19", "06 19019KT", "06 190 19G25", "060 19019G25KT"
export function parsearCruzado(texto) {
  const partes = String(texto || "").trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (partes.length < 2) return { error: "Uso: .cruzado <pista> <dirección> <velocidad>, por ejemplo .cruzado 06 190 19 (o .cruzado 06 19019G25KT con el grupo del METAR)." };
  const rumbo = rumboDePista(partes[0]);
  if (rumbo === null) return { error: `No entendí la pista "${partes[0]}": poné el número, como 06, 24 o 060.` };
  const resto = partes.slice(1).join(" ");
  if (/^VRB/.test(resto)) return { error: "Con viento variable no hay componente fija: a lo sumo tomá la velocidad como cruzada." };
  const m = resto.match(/^(\d{3})(\d{2,3})(?:G(\d{2,3}))?(?:KT|MPS)?$/) || resto.match(/^(\d{1,3})[\s/](\d{1,3})(?:\s*G\s*(\d{1,3}))?(?:\s*KT)?$/);
  if (!m) return { error: "No entendí el viento: poné dirección y velocidad, como 190 19, 190/19 o 19019G25KT." };
  const dir = Number(m[1]);
  const vel = Number(m[2]);
  const rafaga = m[3] ? Number(m[3]) : null;
  if (dir < 0 || dir > 360) return { error: "La dirección del viento va de 0 a 360." };
  return { rumbo, pista: partes[0], dir, vel, rafaga };
}

const nombrePista = (rumbo) => String(Math.round(rumbo / 10) || 36).padStart(2, "0");
const kt = (n) => `${Math.round(Math.abs(n))} kt`;

function lineasComponentes(c) {
  const frente = c.frente >= 0.5 ? `🟢 De frente: ${kt(c.frente)}` : c.frente <= -0.5 ? `🔴 De cola: ${kt(c.frente)}` : "⚪ Sin componente de frente ni de cola";
  const cruzada = c.lado ? `${c.cruzada >= 15 ? "🔴" : c.cruzada >= 8 ? "🟡" : "🟢"} Cruzada: ${kt(c.cruzada)} desde la ${c.lado}` : "🟢 Sin cruzada";
  return [cruzada, frente];
}

export function textoCruzado(texto) {
  const p = parsearCruzado(texto);
  if (p.error) return `❌ ${p.error}`;
  const r = vientoCruzado(p.rumbo, p.dir, p.vel, p.rafaga);
  const lineas = [`✈️ *Viento cruzado* · pista ${nombrePista(p.rumbo)} (${String(p.rumbo).padStart(3, "0")}°) · viento ${String(p.dir).padStart(3, "0")}° ${p.vel} kt${p.rafaga ? ` con ráfagas de ${p.rafaga}` : ""}`, ...lineasComponentes(r.actual)];
  if (r.conRafaga) lineas.push(`💨 Con la ráfaga: cruzada ${kt(r.conRafaga.actual.cruzada)}, ${r.conRafaga.actual.frente >= 0 ? "de frente" : "de cola"} ${kt(r.conRafaga.actual.frente)}`);
  const o = r.opuesta;
  const mejor = o.frente > r.actual.frente + 0.5;
  lineas.push(`↩️ Pista ${nombrePista(o.rumbo)} (${String(o.rumbo).padStart(3, "0")}°): ${o.frente >= 0.5 ? `${kt(o.frente)} de frente` : o.frente <= -0.5 ? `${kt(o.frente)} de cola` : "sin frente ni cola"}${o.lado ? `, cruzada ${kt(o.cruzada)} desde la ${o.lado}` : ""}.${mejor ? ` Conviene la ${nombrePista(o.rumbo)}.` : ""}`);
  return lineas.join("\n");
}

// ---------- sol ----------
// Ecuaciones del calculador solar de la NOAA. Devuelve los instantes (ms UTC) de salida, puesta y crepúsculo civil
// para una fecha civil (año, mes, día) en un punto; null donde el evento no ocurre (día o noche polar).
function jdMedianoche(a, m, d) {
  if (m <= 2) {
    a -= 1;
    m += 12;
  }
  const A = Math.floor(a / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (a + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

function solar(jd) {
  const T = (jd - 2451545) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = rad(M);
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const declinacion = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda))));
  const y = Math.tan(rad(eps / 2)) ** 2;
  const L0r = rad(L0);
  const ecuacionTiempo = 4 * deg(y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  return { declinacion, ecuacionTiempo };
}

// minutos UTC desde la medianoche del evento; "polar" indica día o noche continua
function minutosEvento(jd, lat, lon, zenit, puesta) {
  let minutos = 720;
  for (let i = 0; i < 2; i++) {
    const { declinacion, ecuacionTiempo } = solar(jd + minutos / 1440);
    const cosHA = Math.cos(rad(zenit)) / (Math.cos(rad(lat)) * Math.cos(rad(declinacion))) - Math.tan(rad(lat)) * Math.tan(rad(declinacion));
    if (cosHA < -1) return { polar: "dia" };
    if (cosHA > 1) return { polar: "noche" };
    const HA = deg(Math.acos(cosHA));
    minutos = 720 - 4 * (lon + (puesta ? -HA : HA)) - ecuacionTiempo;
  }
  return { minutos };
}

export function eventosSolares(lat, lon, anio, mes, dia) {
  const jd = jdMedianoche(anio, mes, dia);
  const base = Date.UTC(anio, mes - 1, dia);
  const instante = (r) => (r.minutos === undefined ? null : base + r.minutos * 60000);
  const salida = minutosEvento(jd, lat, lon, 90.833, false);
  const puesta = minutosEvento(jd, lat, lon, 90.833, true);
  return {
    polar: salida.polar || null,
    salida: instante(salida),
    puesta: instante(puesta),
    crepusculoInicio: instante(minutosEvento(jd, lat, lon, 96, false)),
    crepusculoFin: instante(minutosEvento(jd, lat, lon, 96, true)),
  };
}

export const horaEn = (ms, tz) => new Intl.DateTimeFormat("es-UY", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms));
export function fechaLocal(ms, tz) {
  const [a, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)).split("-").map(Number);
  return { anio: a, mes: m, dia: d };
}

export function textoSol(lugar, ahora = Date.now()) {
  const { anio, mes, dia } = fechaLocal(ahora, lugar.tz);
  const ev = eventosSolares(lugar.lat, lugar.lon, anio, mes, dia);
  const donde = `☀️ *${lugar.nombre}${lugar.pais ? `, ${lugar.pais}` : ""}* · ${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")} · hora local`;
  if (ev.polar === "dia") return `${donde}\nHoy el sol no se pone: día polar.`;
  if (ev.polar === "noche") return `${donde}\nHoy el sol no sale: noche polar.`;
  const largo = ev.puesta - ev.salida;
  const h = Math.floor(largo / 3600000);
  const min = Math.round((largo % 3600000) / 60000);
  const lineas = [donde, `🌅 Sale ${horaEn(ev.salida, lugar.tz)} · 🌇 se pone ${horaEn(ev.puesta, lugar.tz)} · día de ${h} h ${min} min`];
  if (ev.crepusculoInicio && ev.crepusculoFin) lineas.push(`🌆 Crepúsculo civil: de ${horaEn(ev.crepusculoInicio, lugar.tz)} a ${horaEn(ev.salida, lugar.tz)} y de ${horaEn(ev.puesta, lugar.tz)} a ${horaEn(ev.crepusculoFin, lugar.tz)}`);
  const estado = ahora < ev.salida ? "todavía es de noche" : ahora < ev.puesta ? "el sol está arriba" : ahora < (ev.crepusculoFin || ev.puesta) ? "está anocheciendo" : "ya es de noche";
  lineas.push(`Ahora: ${estado}.`);
  return lineas.join("\n");
}

// ---------- rumbo recíproco ----------
// El opuesto de un rumbo, en 1..360 (el 0 se escribe 360).
export const reciproco = (rumbo) => ((rumbo + 180 - 1) % 360) + 1;
const grados = (r) => `${String(r).padStart(3, "0")}°`;

// "045", "45", "360", "06", "24L" → { tipo: "rumbo" | "pista", ... } o null. Una o dos cifras hasta 36 es una pista;
// con tres cifras es un rumbo (018 = 18°).
export function parsearRumbo(texto) {
  const t = String(texto || "").trim().toUpperCase();
  let m = t.match(/^(\d{1,2})([LRC])?$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 36) {
    const n = Number(m[1]);
    return { tipo: "pista", pista: `${String(n).padStart(2, "0")}${m[2] || ""}`, lado: m[2] || "", rumbo: n * 10 };
  }
  m = t.match(/^(\d{1,3})[°º]?$/);
  if (!m) return null;
  const r = Number(m[1]);
  if (r > 360) return null;
  return { tipo: "rumbo", rumbo: r === 0 ? 360 : r };
}

// ".reciproco 045", ".reciproco 06L", ".reciproco 045 270 18"
export function textoReciproco(texto) {
  const partes = String(texto || "").trim().split(/[\s,]+/).filter(Boolean);
  if (!partes.length) return "Uso: .reciproco <rumbo o pista>, por ejemplo .reciproco 045, .reciproco 06L, o varios: .reciproco 045 270 18. Con una o dos cifras hasta 36 lo tomo como pista; con tres cifras es rumbo (018 = 18°).";
  const lineas = ["✈️ *Rumbo recíproco*"];
  for (const p of partes) {
    const r = parsearRumbo(p);
    if (!r) {
      lineas.push(`❌ "${p}": poné un rumbo de 0 a 360 o una pista como 06 o 24L.`);
      continue;
    }
    const op = reciproco(r.rumbo);
    if (r.tipo === "pista") lineas.push(`🛬 Pista ${r.pista} ↔ ${nombrePista(op)}${{ L: "R", R: "L", C: "C" }[r.lado] || ""} (${grados(r.rumbo)} ↔ ${grados(op)})`);
    else lineas.push(`🧭 ${grados(r.rumbo)} ↔ ${grados(op)}`);
  }
  return lineas.join("\n");
}

// ---------- factor de carga en viraje ----------
// En un viraje nivelado n = 1 / cos(ángulo de banqueo); la velocidad de pérdida se multiplica por √n.
export const factorDeCarga = (angulo) => 1 / Math.cos(rad(angulo));
const coma = (n, d = 2) => n.toFixed(d).replace(".", ",");
const LIMITE_NORMAL_G = 3.8; // categoría normal (FAR 23)
const redondeado = (n) => Math.round(n * 100) / 100; // cos(60°) da 1,9999999999999996 en coma flotante

// ".factorcarga 45", ".factorcarga 45 50" (con velocidad de pérdida de 50 kt), sin nada muestra la tabla
export function textoFactorCarga(texto) {
  const partes = String(texto || "").trim().split(/[\s,]+/).filter(Boolean);
  if (!partes.length) {
    const filas = [15, 30, 45, 60, 75].map((a) => {
      const n = factorDeCarga(a);
      return `${a}° → ${coma(n)} G · Vs ×${coma(Math.sqrt(n))}${redondeado(n) > LIMITE_NORMAL_G ? " 🔴" : redondeado(n) >= 2 ? " 🟡" : ""}`;
    });
    return `✈️ *Factor de carga en viraje nivelado*\n${filas.join("\n")}\n\nUso: .factorcarga 45, o .factorcarga 45 50 para ver la velocidad de pérdida con una Vs de 50 kt.`;
  }
  const angulo = Number(partes[0].replace(/[°º]/g, ""));
  if (!Number.isFinite(angulo) || angulo < 0) return "❌ Poné el ángulo de banqueo en grados, por ejemplo .factorcarga 45.";
  if (angulo >= 90) return "❌ A 90° no queda sustentación para sostener la altura: el factor de carga tiende a infinito. Probá con menos de 90.";
  const vs = partes[1] ? Number(partes[1].replace(/kt$/i, "")) : null;
  if (partes[1] && (!Number.isFinite(vs) || vs <= 0)) return "❌ La velocidad de pérdida va en nudos, por ejemplo .factorcarga 45 50.";
  const n = factorDeCarga(angulo);
  const raiz = Math.sqrt(n);
  const lineas = [`✈️ *Factor de carga* · viraje nivelado de ${coma(angulo, angulo % 1 ? 1 : 0)}°`, `⚖️ n = ${coma(n)} G (1 / cos ${coma(angulo, angulo % 1 ? 1 : 0)}°)`, `📈 Velocidad de pérdida: ×${coma(raiz)}, un ${Math.round((raiz - 1) * 100)} % más${vs ? ` → ${Math.round(vs * raiz)} kt con una Vs de ${vs} kt` : ""}`];
  if (redondeado(n) > LIMITE_NORMAL_G) lineas.push(`🔴 Supera el límite de la categoría normal (${coma(LIMITE_NORMAL_G, 1)} G).`);
  else if (redondeado(n) >= 2) lineas.push("🟡 Ya vas a 2 G o más: ojo con la velocidad y la pérdida acelerada.");
  return lineas.join("\n");
}
