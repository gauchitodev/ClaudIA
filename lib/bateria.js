// The battery of the phone or tablet the bot runs on: .bat shows it to the owner and .estado has a line for it.
// It comes from termux-battery-status, which needs the Termux:API app (from F-Droid, like Termux: each source signs its
// builds differently) and "pkg install termux-api". Failing that, from the system's battery files, which not every
// device lets an app read without root.
import { spawn } from "child_process";
import { readFile } from "fs/promises";
import { avisarOwner } from "./avisos.js";

// termux-battery-status is a script that runs Termux's API helper as its child, not in its place, and the helper waits
// for the Termux:API app to connect: forever, if the app isn't there or doesn't answer. A timeout that killed only the
// script left the helper behind, adopted by init, one per check, and Android 12 and later kill the phantom processes past
// 32, counting every app's (Termux's README): the bot can be one of them. So the script runs as the leader of a process
// group of its own (detached), and the timeout kills the whole group.
function ejecutar(comando, args, { timeout }) {
  return new Promise((resolve, reject) => {
    const hijo = spawn(comando, args, { detached: true, stdio: ["ignore", "pipe", "ignore"] });
    let salida = "";
    let reloj = null;
    // Not installed (ENOENT) comes as an event, and one with nobody listening would bring the bot down.
    hijo.once("error", (e) => {
      clearTimeout(reloj);
      reject(e);
    });
    hijo.once("close", (codigo) => {
      clearTimeout(reloj);
      if (codigo === 0) resolve({ stdout: salida });
      else reject(new Error(`${comando} terminó con el código ${codigo}`));
    });
    hijo.stdout?.setEncoding("utf8").on("data", (parte) => (salida += parte));
    reloj = setTimeout(() => {
      try {
        process.kill(-hijo.pid, "SIGKILL");
      } catch {}
      reject(Object.assign(new Error(`${comando} no contestó en ${timeout / 1000} s`), { code: "ETIMEDOUT" }));
    }, timeout);
  });
}

// Swappable from the tests.
export const _dep = { ejecutar, leer: (ruta) => readFile(ruta, "utf8"), ahora: () => Date.now() };

export const TERMUX_API = {
  // Without the Termux:API app the command doesn't answer: it's given up on after this long.
  TIMEOUT_MS: 8000,
  // And it won't answer the next time either (the app isn't installed, or Android put it to sleep): the check every 5
  // minutes leaves it alone for this long, and meanwhile reads only the system files. .bat and .estado still try it,
  // and so does the check unless the last reading said the battery was fine (chequearBateriaBaja).
  PAUSA_MS: 30 * 60 * 1000,
};
// Until when the check every 5 minutes leaves Termux:API alone (Date.now() ms; 0 when it doesn't).
let pausaTermuxApiHasta = 0;
const ARCHIVOS = "/sys/class/power_supply/battery/";

const ESTADOS = {
  CHARGING: "cargando ⚡",
  DISCHARGING: "descargando 🔋",
  FULL: "completa ✅",
  NOT_CHARGING: "conectada sin cargar 🔌",
  UNKNOWN: "estado desconocido",
};

// { porcentaje, estado, temperatura } (the last two may be missing), or null when it can't be read. respetarPausa is for
// the check every 5 minutes: it doesn't ask Termux:API while that's on pause (TERMUX_API.PAUSA_MS).
export async function leerBateria({ respetarPausa = false } = {}) {
  if (!respetarPausa || _dep.ahora() >= pausaTermuxApiHasta) {
    try {
      const { stdout } = await _dep.ejecutar("termux-battery-status", [], { timeout: TERMUX_API.TIMEOUT_MS });
      pausaTermuxApiHasta = 0; // it answered: the check can ask it again
      const d = JSON.parse(stdout);
      // Every field is optional: Termux:API leaves out the ones Android doesn't give. Without "percentage", level/scale.
      const porcentaje = Number.isFinite(d.percentage) ? d.percentage : d.level >= 0 && d.scale > 0 ? Math.round((d.level / d.scale) * 100) : null;
      if (porcentaje != null) return { porcentaje, estado: d.status, temperatura: d.temperature };
    } catch (e) {
      if (e?.code === "ETIMEDOUT") pausaTermuxApiHasta = _dep.ahora() + TERMUX_API.PAUSA_MS;
    }
  }
  try {
    const capacidad = (await _dep.leer(`${ARCHIVOS}capacity`)).trim();
    const estado = (await _dep.leer(`${ARCHIVOS}status`).catch(() => "")).trim();
    if (capacidad && Number.isFinite(Number(capacidad))) return { porcentaje: Number(capacidad), estado };
  } catch {}
  return null;
}

// Termux:API says CHARGING or NOT_CHARGING, and the system files Charging or Not charging: both as Termux:API says it.
const clave = (estado) => String(estado || "").trim().toUpperCase().replace(/\s+/g, "_");

// "cargando ⚡".
export function estadoBateria(estado) {
  return ESTADOS[clave(estado)] || String(estado || "").trim().toLowerCase();
}

// What .bat and .estado say when there is nothing to read.
export const SIN_BATERIA = "No pude leer la batería. Falta instalar termux-api (pkg install termux-api) y la app Termux:API de F-Droid.";

// ---------- low battery ----------
// Below each of these percentages, and not charging, the owner hears it in private, once per discharge: the bot goes
// with the device, and with it every group. Only past REARMAR are they ready to tell again, not when it charges: a loose
// cable that plugs and unplugs by itself, or a short charge to 11 % before unplugging, would bring the same notice
// again and again.
// ENTRE_LECTURAS_MS: how old the check before may be for a drop since then to say the charger doesn't keep up.
export const BATERIA_BAJA = { AVISOS: [10, 5], REARMAR: 15, ENTRE_LECTURAS_MS: 15 * 60 * 1000 };
if (!globalThis.bateriaBajaAvisada) globalThis.bateriaBajaAvisada = new Set(); // the percentages already told about
// The same for "the charger doesn't keep up", told apart: after an "Enchufame", a weak charger plugged in still has to
// be told about.
if (!globalThis.bateriaNoAlcanzaAvisada) globalThis.bateriaNoAlcanzaAvisada = new Set();
// The previous check's reading, { porcentaje, estado, fecha }: whether a charge still goes down.
if (globalThis.bateriaLecturaAnterior === undefined) globalThis.bateriaLecturaAnterior = null;

// Why it isn't charging, said to the owner: unplugged ("descarga"), plugged in but not charging ("sinCargar": a bad
// charger or cable, where "Enchufame" makes no sense), or charging while it still goes down ("noAlcanza": a weak
// charger, or the tablet using more than it gets).
const TEXTOS_BAJA = {
  10: {
    descarga: (p) => `🔋 Me queda ${p} % de batería y no estoy cargando. Enchufame antes de que me apague.`,
    sinCargar: (p) => `🔌 Me queda ${p} % de batería: estoy enchufada, pero no carga. Revisá el cargador o el cable antes de que me apague.`,
    noAlcanza: (p) => `🔌 Me queda ${p} % de batería y sigue bajando, aunque estoy cargando: el cargador no da abasto. Probá con otro antes de que me apague.`,
  },
  5: {
    descarga: (p) => `🪫 Me queda ${p} % de batería y no estoy cargando: me puedo apagar en cualquier momento. ¡Enchufame ya!`,
    sinCargar: (p) => `🪫 Me queda ${p} % de batería y no carga, aunque estoy enchufada: me puedo apagar en cualquier momento. ¡Revisá el cargador ya!`,
    noAlcanza: (p) => `🪫 Me queda ${p} % de batería y sigue bajando, aunque estoy cargando: me puedo apagar en cualquier momento. ¡Cambiá el cargador ya!`,
  },
};

// Charging or full: what's plugged in keeps up. "Connected without charging" doesn't, nor does a status the device
// didn't give, nor a charge that still goes down (noAlcanza, below).
const cargando = (estado) => ["CHARGING", "FULL"].includes(clave(estado));

// Every 5 minutes (lib/tareas-programadas.js). Returns the percentage it told the owner about, or null.
export async function chequearBateriaBaja() {
  const anterior = globalThis.bateriaLecturaAnterior;
  // The pause after a timeout only holds with the battery fine at the last reading: on a device whose system files can't
  // be read, a single slow answer at 6 % left it half an hour without readings, and the urgent notice came late, or
  // never. With no reading yet (the first check after a restart) it isn't known to be fine either. Asking again leaves
  // nothing behind, since the timeout kills the helper too (ejecutar).
  const b = await leerBateria({ respetarPausa: anterior?.porcentaje >= BATERIA_BAJA.REARMAR });
  if (!b) return null; // without Termux:API there's nothing to watch
  globalThis.bateriaLecturaAnterior = { porcentaje: b.porcentaje, estado: clave(b.estado), fecha: _dep.ahora() };
  if (b.porcentaje >= BATERIA_BAJA.REARMAR) {
    globalThis.bateriaBajaAvisada.clear();
    globalThis.bateriaNoAlcanzaAvisada.clear();
    return null;
  }
  // Charging at this check and at the one before, a recent one, and lower now: the charger doesn't keep up, and the
  // device dies all the same. A drop since a reading taken unplugged is the time it was unplugged, and across a gap (no
  // reading for a while, a restart) it may have been unplugged meanwhile.
  const noAlcanza = clave(b.estado) === "CHARGING" && anterior?.estado === "CHARGING" && _dep.ahora() - anterior.fecha <= BATERIA_BAJA.ENTRE_LECTURAS_MS && b.porcentaje < anterior.porcentaje;
  if (cargando(b.estado) && !noAlcanza) return null; // nothing to tell, and what was told stays told
  const avisadas = noAlcanza ? globalThis.bateriaNoAlcanzaAvisada : globalThis.bateriaBajaAvisada;
  // Only the lowest one it's under: from 12 % straight to 4 % (between two checks, or across a restart), a single
  // notice, the urgent one, and the 10 % one isn't sent after it.
  const cruzadas = BATERIA_BAJA.AVISOS.filter((umbral) => b.porcentaje < umbral);
  const umbral = Math.min(...cruzadas);
  if (!cruzadas.length || avisadas.has(umbral)) return null;
  const nuevas = cruzadas.filter((u) => !avisadas.has(u));
  for (const u of nuevas) avisadas.add(u);
  // Not sent (no connection right then): it's tried again on the next check, against the same earlier reading when what
  // doesn't keep up is the charger (a percentage that stays put wouldn't be going down from the one just read).
  const motivo = noAlcanza ? "noAlcanza" : clave(b.estado) === "NOT_CHARGING" ? "sinCargar" : "descarga";
  if (await avisarOwner(TEXTOS_BAJA[umbral][motivo](b.porcentaje), "bateria-baja")) return umbral;
  for (const u of nuevas) avisadas.delete(u);
  if (noAlcanza) globalThis.bateriaLecturaAnterior = anterior;
  return null;
}
