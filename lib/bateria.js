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
  // minutes leaves it alone for this long, and meanwhile reads only the system files. .bat and .estado still try it.
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

// "cargando ⚡". Termux:API says CHARGING or NOT_CHARGING, and the system files Charging or Not charging.
export function estadoBateria(estado) {
  const crudo = String(estado || "").trim();
  return ESTADOS[crudo.toUpperCase().replace(/\s+/g, "_")] || crudo.toLowerCase();
}

// What .bat and .estado say when there is nothing to read.
export const SIN_BATERIA = "No pude leer la batería. Falta instalar termux-api (pkg install termux-api) y la app Termux:API de F-Droid.";

// ---------- low battery ----------
// Below each of these percentages, and not charging, the owner hears it in private, once per discharge: the bot goes
// with the device, and with it every group. On the charger again, or past REARMAR, they're ready to tell again; with
// REARMAR above the first one, a short charge to 11 % and unplugged doesn't bring the same notice twice.
export const BATERIA_BAJA = { AVISOS: [10, 5], REARMAR: 15 };
if (!globalThis.bateriaBajaAvisada) globalThis.bateriaBajaAvisada = new Set(); // the percentages already told about

const TEXTOS_BAJA = {
  10: (p) => `🔋 Me queda ${p} % de batería y no estoy cargando. Enchufame antes de que me apague.`,
  5: (p) => `🪫 Me queda ${p} % de batería y no estoy cargando: me puedo apagar en cualquier momento. ¡Enchufame ya!`,
};

// Charging or full: what's plugged in keeps up. "Connected without charging" doesn't, and neither does a status the
// device didn't give.
const cargando = (estado) => ["CHARGING", "FULL"].includes(String(estado || "").trim().toUpperCase().replace(/\s+/g, "_"));

// Every 5 minutes (lib/tareas-programadas.js). Returns the percentage it told the owner about, or null.
export async function chequearBateriaBaja() {
  const b = await leerBateria({ respetarPausa: true });
  if (!b) return null; // without Termux:API there's nothing to watch
  const avisadas = globalThis.bateriaBajaAvisada;
  if (cargando(b.estado) || b.porcentaje >= BATERIA_BAJA.REARMAR) {
    avisadas.clear();
    return null;
  }
  // Only the lowest one it's under: from 12 % straight to 4 % (between two checks, or across a restart), a single
  // notice, the urgent one, and the 10 % one isn't sent after it.
  const cruzadas = BATERIA_BAJA.AVISOS.filter((umbral) => b.porcentaje < umbral);
  const umbral = Math.min(...cruzadas);
  if (!cruzadas.length || avisadas.has(umbral)) return null;
  const nuevas = cruzadas.filter((u) => !avisadas.has(u));
  for (const u of nuevas) avisadas.add(u);
  // Not sent (no connection right then): it's tried again on the next check.
  if (await avisarOwner(TEXTOS_BAJA[umbral](b.porcentaje), "bateria-baja")) return umbral;
  for (const u of nuevas) avisadas.delete(u);
  return null;
}
