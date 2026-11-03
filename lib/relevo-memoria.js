// Claudia's short-term memory (lib/contexto-chat.js) outlives a restart of main.js without touching the disk:
// start-process.js, which relaunches it, keeps a copy in its own RAM. main.js tells it each change as it happens, over
// the channel cluster.fork() opens between the two, and asks for the copy when it starts again. Updating the bot is
// cutting main.js (README, "Actualizar") and the supervisor stays up, so the memory is there when it comes back; only a
// full restart (the tablet, Termux, a new npm start) loses it. It used to go with every update: .resumen right after
// one had nothing to tell.
// Only node:cluster and the memory: start-process.js loads this, and the less it carries the less can take it down.
import cluster from "node:cluster";
import { crearMemoria, restaurarMemoria, reiniciarMemoria, alCambiarMemoria, memoriaDesde, contextoChat } from "./contexto-chat.js";

export const RELEVO = {
  ESPERA_MS: 5000, // how long main.js waits for the copy before starting empty (a slow tablet, a supervisor from before)
  SIN_PEDIR_MS: 60 * 1000, // a main.js that ran this long without asking for the copy left it behind
};

// The channel to the supervisor, or null when there's none: the tests, or main.js run by hand.
export function canalDelProceso() {
  if (!cluster.isWorker || typeof process.send !== "function") return null;
  return {
    // With a callback: without one, a send on a closed channel raises an "error" on process, which takes main.js down.
    enviar: (mensaje) => {
      try {
        if (process.connected) process.send(mensaje, () => {});
      } catch {
        // the supervisor is gone: nothing to tell
      }
    },
    escuchar: (fn) => process.on("message", fn),
    dejar: (fn) => process.off("message", fn),
  };
}

// main.js, as it starts: the copy back, if the supervisor has one, and from then on every change goes to it. Nothing
// is left listening, and with no channel it does nothing. Returns { restaurada, mensajes }.
export async function recuperarMemoria({ canal = canalDelProceso(), ahora = Date.now() } = {}) {
  if (!canal) return { restaurada: false, mensajes: 0 };
  const copia = await new Promise((resolve) => {
    let listo = false;
    const terminar = (valor) => {
      if (listo) return;
      listo = true;
      clearTimeout(reloj);
      canal.dejar(oir);
      resolve(valor);
    };
    const oir = (mensaje) => {
      if (mensaje?.tipo === "memoria:copia") terminar(mensaje.copia);
    };
    // A late answer finds nobody listening: by then main.js went on with what it had.
    const reloj = setTimeout(() => terminar(null), RELEVO.ESPERA_MS);
    canal.escuchar(oir);
    canal.enviar({ tipo: "memoria:pido" });
  });
  const restaurada = copia ? restaurarMemoria(copia, ahora) : false;
  // Only now: told any earlier, what was just restored would go back to the copy as if it were new.
  alCambiarMemoria((cambio) => canal.enviar({ tipo: "memoria:cambio", cambio }));
  // Nothing usable came back (no answer, a broken copy): the copy starts over too, so it doesn't keep what this one
  // doesn't have, a deletion included.
  if (!restaurada) reiniciarMemoria(memoriaDesde());
  return { restaurada, mensajes: restaurada ? [...contextoChat.values()].reduce((n, lista) => n + lista.length, 0) : 0 };
}

// start-process.js: the copy, and what each main.js it forks gets (trabajadorNuevo). Only the newest main.js counts:
// what an earlier one says after the newest has its copy would land on top of it. The copy follows the main.js that
// asked for it; one that ran a while without asking (a version from before this, say) left it behind, so the next
// one that asks gets it emptied. Nothing a main.js sends, however broken, takes the supervisor down.
export function crearCopiaDeMemoria({ memoria = crearMemoria() } = {}) {
  let ultimo = 0;
  let vigente = true;
  return {
    memoria,
    trabajadorNuevo() {
      const numero = ++ultimo;
      let pidio = false;
      let fallos = 0;
      return {
        atender(mensaje, responder, ahora = Date.now()) {
          try {
            if (numero !== ultimo || !mensaje || typeof mensaje !== "object") return;
            if (mensaje.tipo === "memoria:pido") {
              if (!vigente) memoria.aplicarCambio({ op: "reiniciar", desde: ahora });
              vigente = true;
              pidio = true;
              responder({ tipo: "memoria:copia", copia: memoria.instantanea(ahora) });
            } else if (mensaje.tipo === "memoria:cambio" && pidio) {
              memoria.aplicarCambio(mensaje.cambio);
            }
          } catch (e) {
            if (fallos++ === 0) console.error("[memoria] el supervisor no pudo atender a main.js:", e?.message || e);
          }
        },
        termino(duroMs) {
          if (!pidio && duroMs >= RELEVO.SIN_PEDIR_MS) vigente = false;
        },
      };
    },
  };
}
