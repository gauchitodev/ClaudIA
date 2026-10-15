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

// The keys of the weeks before the current one, newest first. It steps back by calendar from this week's Monday at
// noon, so a daylight-saving change can't skip a week.
export function semanasAnteriores(ahora = Date.now(), cuantas = 1) {
  const d = new Date(ahora);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(12, 0, 0, 0);
  return Array.from({ length: cuantas }, () => {
    d.setDate(d.getDate() - 7);
    return semanaDe(d.getTime());
  });
}

// The same for months.
export function mesesAnteriores(ahora = Date.now(), cuantos = 1) {
  const d = new Date(ahora);
  d.setDate(1);
  d.setHours(12, 0, 0, 0);
  return Array.from({ length: cuantos }, () => {
    d.setMonth(d.getMonth() - 1);
    return mesDe(d.getTime());
  });
}

// "la semana pasada", or "la semana del 5/10" for an older one (a closing that was left behind). The key is the local
// Monday written in UTC, which east of Greenwich lands on the Sunday before: the text shows the Monday.
export function semanaEnTexto(semana, ahora = Date.now()) {
  if (semana === semanasAnteriores(ahora)[0]) return "la semana pasada";
  const [anio, mes, dia] = semana.split("-").map(Number);
  const lunes = new Date(anio, mes - 1, dia);
  if (lunes.getDay() === 0) lunes.setDate(lunes.getDate() + 1);
  return `la semana del ${lunes.getDate()}/${lunes.getMonth() + 1}`;
}
