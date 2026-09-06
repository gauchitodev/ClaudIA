// Reloj aeronáutico: hora Zulu (UTC), hora local y las 25 zonas horarias del sistema de letras militar (Z para UTC,
// A a M hacia el este, N a Y hacia el oeste; la J es la hora local de quien habla y no tiene huso), en formato normal
// y en DTG (Date-Time Group: día, hora y minutos, letra del huso, mes y año; ej. 061532Z SEP 26).
export const RELOJ = { ZONA_LOCAL: "America/Montevideo", NOMBRE_LOCAL: "Uruguay" };

const FONETICO = { A: "Alfa", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo", F: "Foxtrot", G: "Golf", H: "Hotel", I: "India", K: "Kilo", L: "Lima", M: "Mike", N: "November", O: "Oscar", P: "Papa", Q: "Quebec", R: "Romeo", S: "Sierra", T: "Tango", U: "Uniform", V: "Victor", W: "Whiskey", X: "X-ray", Y: "Yankee", Z: "Zulu" };
const ESTE = "ABCDEFGHIKLM"; // +1 a +12
const OESTE = "NOPQRSTUVWXY"; // -1 a -12
const MESES_DTG = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// Las 25 zonas del sistema de letras, de oeste a este. "offset" en horas.
export const ZONAS = [...[...OESTE].map((letra, i) => ({ letra, offset: -(i + 1) })).reverse(), { letra: "Z", offset: 0 }, ...[...ESTE].map((letra, i) => ({ letra, offset: i + 1 }))].map((z) => ({ ...z, nombre: FONETICO[z.letra] }));

// Husos que no caen en hora entera y no tienen letra; se calculan con su zona IANA para respetar el horario de verano.
export const OTRAS = [
  ["Terranova", "America/St_Johns"],
  ["Irán", "Asia/Tehran"],
  ["Afganistán", "Asia/Kabul"],
  ["India", "Asia/Kolkata"],
  ["Nepal", "Asia/Kathmandu"],
  ["Myanmar", "Asia/Yangon"],
  ["Australia central", "Australia/Adelaide"],
  ["Chatham", "Pacific/Chatham"],
  ["Tonga", "Pacific/Tongatapu"],
  ["Kiribati", "Pacific/Kiritimati"],
];

const pad2 = (n) => String(n).padStart(2, "0");

// Desfase de una zona IANA respecto de UTC, en minutos, en ese instante.
export function offsetDeZona(tz, ms) {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms));
  const v = Object.fromEntries(partes.filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
  const pared = Date.UTC(v.year, v.month - 1, v.day, v.hour % 24, v.minute, v.second);
  return Math.round((pared - Math.floor(ms / 1000) * 1000) / 60000);
}

// Letra militar de un desfase en minutos, o null si no es hora entera.
export function letraDe(offsetMin) {
  if (offsetMin % 60 !== 0) return null;
  const h = offsetMin / 60;
  if (h === 0) return "Z";
  if (h > 0 && h <= 12) return ESTE[h - 1];
  if (h < 0 && h >= -12) return OESTE[-h - 1];
  return null;
}

// Hora de pared de un huso: un Date cuyos campos UTC son la hora local de ese huso.
const enHuso = (ms, offsetMin) => new Date(ms + offsetMin * 60000);
const hhmm = (d) => `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
const hhmmss = (d) => `${hhmm(d)}:${pad2(d.getUTCSeconds())}`;
export const textoOffset = (min) => (min === 0 ? "UTC±0" : `UTC${min < 0 ? "−" : "+"}${Math.floor(Math.abs(min) / 60)}${Math.abs(min) % 60 ? `:${pad2(Math.abs(min) % 60)}` : ""}`);
const difDia = (zulu, d) => {
  const dias = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(zulu.getUTCFullYear(), zulu.getUTCMonth(), zulu.getUTCDate())) / 86400000);
  return dias === 0 ? "" : dias > 0 ? " +1d" : " −1d";
};

// Date-Time Group: 061532Z SEP 26.
export function dtg(ms, offsetMin, letra) {
  const d = enHuso(ms, offsetMin);
  return `${pad2(d.getUTCDate())}${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${letra} ${MESES_DTG[d.getUTCMonth()]} ${pad2(d.getUTCFullYear() % 100)}`;
}

const fechaLarga = (ms) => new Intl.DateTimeFormat("es-UY", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(ms));

// .zulu
export function textoReloj(ahora = Date.now()) {
  const zulu = new Date(ahora);
  const offLocal = offsetDeZona(RELOJ.ZONA_LOCAL, ahora);
  const letraLocal = letraDe(offLocal);
  const lineas = [`🕒 *Hora Zulu:* ${hhmmss(zulu)} Z · ${fechaLarga(ahora)}`, `📍 *${RELOJ.NOMBRE_LOCAL}:* ${hhmmss(enHuso(ahora, offLocal))} (${textoOffset(offLocal)}${letraLocal ? `, ${letraLocal}` : ""})`, "", "*Zonas horarias (letras militares):*"];
  for (const zona of ZONAS) {
    const d = enHuso(ahora, zona.offset * 60);
    lineas.push(`${zona.letra} (${textoOffset(zona.offset * 60)}) ${hhmm(d)}${difDia(zulu, d)}${zona.offset * 60 === offLocal ? " ← acá" : ""}`);
  }
  lineas.push("", "*Medias horas y otras:*", OTRAS.map(([nombre, tz]) => `${nombre} ${textoOffset(offsetDeZona(tz, ahora))} ${hhmm(enHuso(ahora, offsetDeZona(tz, ahora)))}`).join(" · "));
  lineas.push("", "_La J es la hora local de quien habla y no tiene huso fijo._");
  return lineas.join("\n");
}

// .dtg
export function textoDtg(ahora = Date.now()) {
  const offLocal = offsetDeZona(RELOJ.ZONA_LOCAL, ahora);
  const letraLocal = letraDe(offLocal) || "J";
  const lineas = [`🕒 *DTG Zulu:* ${dtg(ahora, 0, "Z")}`, `📍 *${RELOJ.NOMBRE_LOCAL}:* ${dtg(ahora, offLocal, letraLocal)}`, "", "*Todas las zonas:*"];
  for (const zona of ZONAS) lineas.push(`${zona.nombre}: ${dtg(ahora, zona.offset * 60, zona.letra)}${zona.offset * 60 === offLocal ? " ← acá" : ""}`);
  lineas.push("", "_DTG: día, hora y minutos, letra del huso, mes y año. Las medias horas no tienen letra._");
  return lineas.join("\n");
}
