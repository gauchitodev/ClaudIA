import { join } from "path";
import { setupPrimary, fork } from "cluster";
import { proximoReinicio } from "./lib/reinicio.js";
import { crearCopiaDeMemoria } from "./lib/relevo-memoria.js";

// Quick crashes in a row: a bot that dies as it starts waits longer each time before the next attempt
// (lib/reinicio.js).
let fallosSeguidos = 0;

// The copy of Claudia's short-term memory (lib/relevo-memoria.js): it outlives each main.js, so cutting it to update
// doesn't lose what the groups said.
const copiaDeMemoria = crearCopiaDeMemoria();
const avisarFallo = (e) => {
  if (e) console.error("[memoria] no se pudo contestar a main.js:", e.message || e);
};

function start(file) {
  const args = [join(import.meta.dirname, file), ...process.argv.slice(2)];
  setupPrimary({ exec: args[0], args: args.slice(1) });
  const inicio = Date.now();
  const p = fork();
  const relevo = copiaDeMemoria.trabajadorNuevo();
  p.on("message", (mensaje) =>
    relevo.atender(mensaje, (respuesta) => {
      try {
        p.send(respuesta, avisarFallo);
      } catch (e) {
        avisarFallo(e);
      }
    }),
  );
  // Unheard, an "error" from the worker (a reply to one that had just died) would take the supervisor down.
  p.on("error", (e) => console.error("[memoria]", e?.message || e));
  p.on("exit", (code) => {
    relevo.termino(Date.now() - inicio);
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
