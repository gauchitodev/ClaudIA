// A fix for Baileys, put on the installed package until Baileys brings its own. As published (7.0.0-rc14, the latest
// when this was written), each time it asks WhatsApp for someone's devices again, which on a send is every five minutes
// at most, it opens a new session with that person's phone, though the one it had was fine: getUSyncDevices calls
// assertSessions(lids, true) for every LID the answer names, where its own comment says "newly mapped". The phone never
// hears of the new session and goes on writing with its own. libsignal keeps forty of them and tries the newest first,
// stepping its ratchet where it stands when it doesn't fit: what the bot sends that phone next can't be opened there
// ("Esperando el mensaje"), and once the phone's own session is no longer among the ones kept, neither can the bot open
// what the phone sends (Bad MAC). Linked devices aren't touched: those LIDs are people, and a person is device 0.
// Reported to Baileys as issue #2901, with a fix proposed in #2902; neither had been answered by 2026-11-24.
//
// The fix is the one the report runs with: no forcing there. A session is still made where there's none, and a resend
// or a change of identity still force theirs, on their own paths. In the compiled file that's one line, the very one
// that building the fixed source gives.
//
// It goes on twice over: after an install (package.json's postinstall, scripts/parchar-baileys.mjs), and as main.js
// starts, for an update that reinstalled nothing. Once Baileys comes fixed, the line isn't there to find ("otro"):
// test/parche-baileys.test.mjs fails then, and all of this goes.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const PARCHE = {
  // Inside the package.
  ARCHIVO: "lib/Socket/messages-send.js",
  ANTES: "await assertSessions(lids, true);",
  DESPUES: "await assertSessions(lids);",
};

// The installed package's folder: wherever this file's own import of it would come from.
const carpetaDeBaileys = () => fileURLToPath(new URL("..", import.meta.resolve("@whiskeysockets/baileys")));

const veces = (texto, parte) => texto.split(parte).length - 1;

// The file and how it stands: "falta" (the line as Baileys publishes it), "puesto" (as the fix leaves it), or "otro"
// (neither, or more than once: not the file this was written for).
function mirar(carpeta = carpetaDeBaileys()) {
  const ruta = path.join(carpeta, PARCHE.ARCHIVO);
  const texto = fs.readFileSync(ruta, "utf8");
  const antes = veces(texto, PARCHE.ANTES);
  const despues = veces(texto, PARCHE.DESPUES);
  return { ruta, texto, estado: antes === 1 && despues === 0 ? "falta" : antes === 0 && despues === 1 ? "puesto" : "otro" };
}

// How the installed Baileys stands, as it is on the disk now. A package that isn't there, or can't be read, is "otro".
export function estadoDelParche(carpeta) {
  try {
    return mirar(carpeta).estado;
  } catch {
    return "otro";
  }
}

// Puts the fix on where it's missing, and touches nothing otherwise. Returns { estado, cambio }: cambio says the file
// was written just now, which a process that had already loaded it has to restart for. And error, when it's missing
// and couldn't be written. The file is swapped whole: one cut short would be a Baileys that doesn't load.
export function ponerParche(carpeta) {
  let visto;
  try {
    visto = mirar(carpeta);
  } catch (error) {
    return { estado: "otro", cambio: false, error };
  }
  if (visto.estado !== "falta") return { estado: visto.estado, cambio: false };
  const nuevo = `${visto.ruta}.nuevo-${process.pid}`;
  try {
    fs.writeFileSync(nuevo, visto.texto.replace(PARCHE.ANTES, PARCHE.DESPUES));
    fs.renameSync(nuevo, visto.ruta);
  } catch (error) {
    fs.rmSync(nuevo, { force: true });
    return { estado: "falta", cambio: false, error };
  }
  return { estado: "puesto", cambio: true };
}

// What main.js does as it starts, ahead of everything else. When npm installed, the fix is already on. After an update
// that reinstalled nothing it goes on here, but this process has loaded the file as it was: it stops, and
// start-process.js launches the next one, which loads the fixed one. Nothing is going yet, so there's nothing to leave
// half done. Where it can't be put on, the bot goes on as it was, and says so. Returns how it stands.
export function ponerParcheAlArrancar({ poner = ponerParche, salir = (codigo) => process.exit(codigo) } = {}) {
  const { estado, cambio, error } = poner();
  if (cambio) {
    console.log("🩹 Le puse a Baileys el arreglo de las sesiones (lib/parche-baileys.js). Reinicio para cargarlo.");
    salir(1);
  } else if (estado === "falta") {
    console.warn(`⚠️ No pude ponerle a Baileys el arreglo de las sesiones (lib/parche-baileys.js): ${error?.message || error}. Sigo sin él.`);
  } else if (estado === "otro") {
    console.warn("⚠️ El arreglo de las sesiones no le calza al Baileys instalado (lib/parche-baileys.js). Sigo sin él.");
  }
  return estado;
}

export function versionDeBaileys(carpeta) {
  try {
    return JSON.parse(fs.readFileSync(path.join(carpeta ?? carpetaDeBaileys(), "package.json"), "utf8")).version || null;
  } catch {
    return null;
  }
}

// .estado's line: which Baileys the bot has, and whether the fix is on it. That's how to tell, on a tablet seen through
// WhatsApp, that an update took. Read off the disk each time: main.js puts the fix on before it starts, so what's
// there is what's loaded. "Falta" is a bot that hasn't restarted since the update, which reloads this plugin on its
// own, or one that couldn't write the file.
export function lineaDeBaileys(version = versionDeBaileys(), estado = estadoDelParche()) {
  const cual = `🧩 Baileys ${version || "?"}`;
  if (estado === "puesto") return `${cual} · con el arreglo de las sesiones`;
  if (estado === "falta") return `${cual} · ⚠️ sin el arreglo de las sesiones: se pone solo al reiniciar el bot (si sigue así, mirá el log)`;
  return `${cual} · ⚠️ el arreglo de las sesiones no le calza: puede que ya venga arreglada`;
}
