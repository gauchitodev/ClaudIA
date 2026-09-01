// Cola global de descargas: procesa UNA descarga por vez en todo el bot.
// Evita que varias descargas simultáneas saturen la tablet (RAM, ancho de banda, límites de YouTube).

if (!globalThis.colaDescargas) {
  globalThis.colaDescargas = {
    tareas: [],      // lista de tareas esperando
    procesando: false, // si hay una descarga en curso ahora mismo
  };
}

// Agrega una tarea a la cola. La tarea es una función async que hace la descarga+envío.
// Devuelve cuántas tareas hay ADELANTE de esta (0 = se procesa ya mismo).
export function encolarDescarga(tarea) {
  const cola = globalThis.colaDescargas;
  const posicionAdelante = cola.tareas.length + (cola.procesando ? 1 : 0);
  cola.tareas.push(tarea);
  procesarCola();
  return posicionAdelante;
}

// Procesa la cola de a una tarea por vez.
async function procesarCola() {
  const cola = globalThis.colaDescargas;
  if (cola.procesando) return; // ya hay una en curso, no arrancar otra
  if (cola.tareas.length === 0) return; // no hay nada que hacer

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
