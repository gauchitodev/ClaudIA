import { join } from "path";
import { setupPrimary, fork } from "cluster";
import { proximoReinicio } from "./lib/reinicio.js";

// Quick crashes in a row: a bot that dies as it starts waits longer each time before the next attempt
// (lib/reinicio.js).
let fallosSeguidos = 0;

function start(file) {
  const args = [join(import.meta.dirname, file), ...process.argv.slice(2)];
  setupPrimary({ exec: args[0], args: args.slice(1) });
  const inicio = Date.now();
  const p = fork();
  p.on("exit", (code) => {
    if (code === 0) return;
    const { fallos, espera } = proximoReinicio(fallosSeguidos, Date.now() - inicio);
    fallosSeguidos = fallos;
    if (espera === 0) {
      console.log(`Reiniciando proceso...`);
      start(file);
      return;
    }
    console.log(`Reiniciando proceso en ${Math.round(espera / 1000)} s (se cayó al arrancar ${fallos} ${fallos === 1 ? "vez" : "veces"} seguidas)...`);
    setTimeout(() => start(file), espera);
  });
}
start("main.js");
