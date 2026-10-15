// The battery of the phone or tablet the bot runs on: .bat shows it to the owner and .estado has a line for it.
// It comes from termux-battery-status, which needs the Termux:API app (from F-Droid, like Termux: each source signs its
// builds differently) and "pkg install termux-api". Failing that, from the system's battery files, which not every
// device lets an app read without root.
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";

// Swappable from the tests.
export const _dep = { ejecutar: promisify(execFile), leer: (ruta) => readFile(ruta, "utf8") };

// Without the Termux:API app the command doesn't answer: it's given up on after this long.
const TIMEOUT_MS = 8000;
const ARCHIVOS = "/sys/class/power_supply/battery/";

const ESTADOS = {
  CHARGING: "cargando ⚡",
  DISCHARGING: "descargando 🔋",
  FULL: "completa ✅",
  NOT_CHARGING: "conectada sin cargar 🔌",
  UNKNOWN: "estado desconocido",
};

// { porcentaje, estado, temperatura } (the last two may be missing), or null when it can't be read.
export async function leerBateria() {
  try {
    const { stdout } = await _dep.ejecutar("termux-battery-status", [], { timeout: TIMEOUT_MS });
    const d = JSON.parse(stdout);
    // Every field is optional: Termux:API leaves out the ones Android doesn't give. Without "percentage", level/scale.
    const porcentaje = Number.isFinite(d.percentage) ? d.percentage : d.level >= 0 && d.scale > 0 ? Math.round((d.level / d.scale) * 100) : null;
    if (porcentaje != null) return { porcentaje, estado: d.status, temperatura: d.temperature };
  } catch {}
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
