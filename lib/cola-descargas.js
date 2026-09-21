// Global download queue: it processes ONE download at a time across the whole bot.
// It keeps several simultaneous downloads from swamping the tablet (RAM, bandwidth, YouTube's limits).

if (!globalThis.colaDescargas) {
  globalThis.colaDescargas = {
    tareas: [],      // the tasks waiting
    procesando: false, // whether a download is running right now
  };
}

// Adds a task to the queue. The task is an async function that does the download and the send.
// Returns how many tasks are AHEAD of this one (0 = it runs right away).
export function encolarDescarga(tarea) {
  const cola = globalThis.colaDescargas;
  const posicionAdelante = cola.tareas.length + (cola.procesando ? 1 : 0);
  cola.tareas.push(tarea);
  procesarCola();
  return posicionAdelante;
}

// Works through the queue one task at a time.
async function procesarCola() {
  const cola = globalThis.colaDescargas;
  if (cola.procesando) return; // one is already running, don't start another
  if (cola.tareas.length === 0) return; // there is nothing to do

  cola.procesando = true;
  while (cola.tareas.length > 0) {
    const tarea = cola.tareas.shift();
    try {
      await tarea();
    } catch (e) {
      console.error("[cola-descargas] error en una tarea:", e.message);
    }
  }
  cola.procesando = false;
}
