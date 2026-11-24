// Puts lib/parche-baileys.js's fix on the installed Baileys. npm runs it after every install (package.json's
// postinstall); by hand it's `node scripts/parchar-baileys.mjs`, and then the bot has to be restarted to load it. It
// never fails an install: without the fix the bot works as it did before, and .estado says which one it has. Given a
// folder, it's that package instead of the installed one, which is how the tests run it.
import { ponerParche } from "../lib/parche-baileys.js";

const { estado, cambio, error } = ponerParche(process.argv[2]);
if (cambio) console.log("🩹 Baileys: puse el arreglo de las sesiones (lib/parche-baileys.js).");
else if (estado === "puesto") console.log("🩹 Baileys: el arreglo de las sesiones ya estaba puesto.");
else if (estado === "falta") console.warn(`⚠️ Baileys: no pude poner el arreglo de las sesiones: ${error?.message || error}`);
else console.warn("⚠️ Baileys: el arreglo de las sesiones no le calza a la versión instalada. Puede que ya venga arreglada: ver lib/parche-baileys.js.");
