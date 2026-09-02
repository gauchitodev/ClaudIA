// Configuración central de hashtags que Claudia registra automáticamente.
// Para sumar uno nuevo (ej. #recomendado los jueves), agregalo acá con su nombre para mostrar
// y su emoji — no hace falta tocar la lógica de detección ni la de los comandos existentes.
export const HASHTAGS_CONFIG = {
  historiasrandom: { nombre: "Historias Random", emoji: "🎲" },
  quejadelunes: { nombre: "Queja de Lunes", emoji: "😤" },
  recomendado: { nombre: "Recomendación", emoji: "⭐" },
};

// Devuelve el lunes de la semana de una fecha dada, como clave "YYYY-MM-DD",
// para agrupar las entradas por semana calendario (de lunes a lunes).
export function semanaDe(fechaMs) {
  const d = new Date(fechaMs);
  const dia = d.getDay(); // 0=domingo, 1=lunes, ... 6=sábado
  const offset = dia === 0 ? -6 : 1 - dia;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

// Devuelve el mes de una fecha como clave "YYYY-MM" en hora local (no UTC), para que una reacción
// a las 23:00 del último día del mes no caiga en el mes siguiente.
export function mesDe(fechaMs = Date.now()) {
  const d = new Date(fechaMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
