// Central configuration for the hashtags Claudia records automatically.
// To add a new one (say #recomendado on Thursdays), add it here with its display name and emoji — there is no need
// to touch the detection logic or the existing commands.
export const HASHTAGS_CONFIG = {
  historiasrandom: { nombre: "Historias Random", emoji: "🎲" },
  quejadelunes: { nombre: "Queja de Lunes", emoji: "😤" },
  recomendado: { nombre: "Recomendación", emoji: "⭐" },
};

// Returns the Monday of a given date's week, as a "YYYY-MM-DD" key, to group entries by calendar week
// (Monday to Monday).
export function semanaDe(fechaMs) {
  const d = new Date(fechaMs);
  const dia = d.getDay(); // 0=Sunday, 1=Monday, ... 6=Saturday
  const offset = dia === 0 ? -6 : 1 - dia;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

// Returns a date's month as a "YYYY-MM" key in local time (not UTC), so a reaction at 23:00 on the last day of the
// month doesn't land in the next one.
export function mesDe(fechaMs = Date.now()) {
  const d = new Date(fechaMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
