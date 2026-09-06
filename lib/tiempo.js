// Fechas y horas escritas en lenguaje simple, en la hora local de la tablet.
// Lo usan los mercados de apuestas (hora de cierre), los recordatorios y .estado.
export const DIA_MS = 24 * 60 * 60 * 1000;

const normalizar = (t) =>
  String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

// Acepta: "20:30" (hoy, o mañana si ya pasó), "hoy 20:30", "mañana 20:30", "18/09 20:30", "en 2h", "en 90m", "en 1d".
// Devuelve el momento en milisegundos, o null si no se entiende.
export function parsearMomento(texto, ahora = Date.now()) {
  const t = normalizar(texto).replace(/\s+/g, " ");
  let m;
  if ((m = t.match(/^en (\d{1,3}) ?(m|min|h|hs|d)$/))) {
    const n = Number(m[1]);
    const unidad = m[2][0];
    return ahora + n * (unidad === "m" ? 60 * 1000 : unidad === "h" ? 60 * 60 * 1000 : DIA_MS);
  }
  if ((m = t.match(/^(manana |hoy )?(\d{1,2}):(\d{2})$/))) {
    const hora = Number(m[2]);
    const minutos = Number(m[3]);
    if (hora > 23 || minutos > 59) return null;
    const d = new Date(ahora);
    d.setHours(hora, minutos, 0, 0);
    if (m[1]?.startsWith("manana")) d.setDate(d.getDate() + 1);
    else if (!m[1] && d.getTime() <= ahora) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  if ((m = t.match(/^(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})$/))) {
    const [dia, mes, hora, minutos] = m.slice(1).map(Number);
    if (hora > 23 || minutos > 59 || mes < 1 || mes > 12 || dia < 1) return null;
    const d = new Date(ahora);
    d.setHours(hora, minutos, 0, 0);
    d.setMonth(mes - 1, dia);
    if (d.getDate() !== dia || d.getMonth() !== mes - 1) return null; // 31/02 y similares
    if (d.getTime() <= ahora) d.setFullYear(d.getFullYear() + 1);
    return d.getTime();
  }
  return null;
}

// "hoy 20:30", "mañana 09:15", "el 18/9 20:30"
export function textoFecha(ms, ahora = Date.now()) {
  const d = new Date(ms);
  const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const mismoDia = (a, b) => a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (mismoDia(d, new Date(ahora))) return `hoy ${hora}`;
  if (mismoDia(d, new Date(ahora + DIA_MS))) return `mañana ${hora}`;
  return `el ${d.getDate()}/${d.getMonth() + 1} ${hora}`;
}

// "2 d 3 h", "3 h 5 min", "45 min", "12 s"
export function duracion(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const min = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${min} min`;
  if (min > 0) return `${min} min`;
  return `${s} s`;
}

// "1 año, 2 meses, 3 días" (los segundos solo si pasó menos de un día). Lo usan .mipareja y .listaparejas.
export function duracionLarga(ms) {
  let s = Math.max(0, Math.floor(ms / 1000));
  const partes = [];
  for (const [uno, varios, seg] of [
    ["año", "años", 31536000],
    ["mes", "meses", 2592000],
    ["día", "días", 86400],
    ["hora", "horas", 3600],
    ["minuto", "minutos", 60],
  ]) {
    const n = Math.floor(s / seg);
    if (n >= 1) {
      partes.push(`${n} ${n === 1 ? uno : varios}`);
      s -= n * seg;
    }
  }
  if (ms < DIA_MS && s >= 1) partes.push(`${s} ${s === 1 ? "segundo" : "segundos"}`);
  return partes.length ? partes.join(", ") : "0 segundos";
}

// "3 días 2 horas", "45 minutos", "10 segundos" a milisegundos. Devuelve 0 si no entiende nada.
export function parsearDuracion(texto) {
  let total = 0;
  for (const m of normalizar(texto).matchAll(/(\d+)\s*(dias?|horas?|hs?|minutos?|min|segundos?|s)\b/g)) {
    const n = Number(m[1]);
    const u = m[2];
    total += n * (u.startsWith("d") ? DIA_MS : u.startsWith("h") ? 3600000 : u.startsWith("m") ? 60000 : 1000);
  }
  return total;
}
