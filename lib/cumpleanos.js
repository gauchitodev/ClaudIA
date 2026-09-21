// Group birthdays: everyone notes theirs with .cumple 14/03 and on the day, from 9 onwards, Claudia wishes them a
// happy birthday and mentions them in the group they signed up in. No coins, no prizes. The check runs every 5
// minutes from tareas-programadas.js and is recorded so nobody gets greeted twice on the same day.
import { setCumple, getCumple, borrarCumple, cumplesDeChat, cumplesDeHoy, periodoCerrado, marcarPeriodoCerrado, getUser } from "../database-functions.js";
import { preguntarIA } from "./ia.js";
import { DIA_MS } from "./tiempo.js";
import { elegirAlAzar } from "./azar.js";

export const CUMPLE = { HORA_SALUDO: 9 };
export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_POR_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const mencion = (lid) => `@${lid.split("@")[0]}`;

export function registrarCumple(chat, usuario, texto) {
  const t = String(texto || "").trim();
  if (!t) {
    const c = getCumple(chat, usuario);
    return c ? { ok: true, mensaje: `🎂 Tu cumple está anotado el ${c.dia} de ${MESES[c.mes - 1]}. Para cambiarlo: .cumple 14/03 · para borrarlo: .cumple borrar` } : { ok: false, error: "Anotá tu cumple con .cumple 14/03 (día/mes)" };
  }
  if (/^(borrar|quitar|eliminar)$/i.test(t)) {
    return borrarCumple(chat, usuario) ? { ok: true, mensaje: "🗑️ Listo, borré tu cumple." } : { ok: false, error: "No tenías cumple anotado." };
  }
  const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.]\d{2,4})?$/);
  if (!m) return { ok: false, error: "No entendí la fecha. Poné día/mes, por ejemplo .cumple 14/03" };
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > DIAS_POR_MES[mes - 1]) return { ok: false, error: "Esa fecha no existe." };
  setCumple(chat, usuario, dia, mes);
  return { ok: true, mensaje: `🎂 Anotado: tu cumple es el ${dia} de ${MESES[mes - 1]}. Ese día te saludo en el grupo.` };
}

// days until the next birthday with that day and month (0 = it's today)
export function diasHasta(dia, mes, ahora = new Date()) {
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  let fecha = new Date(ahora.getFullYear(), mes - 1, dia);
  if (fecha < hoy) fecha = new Date(ahora.getFullYear() + 1, mes - 1, dia);
  return Math.round((fecha - hoy) / DIA_MS);
}

export function textoCumples(chat) {
  const lista = cumplesDeChat(chat);
  if (lista.length === 0) return { texto: "Nadie anotó su cumple todavía. Anotá el tuyo con .cumple 14/03", mentions: [] };
  const ordenados = lista.map((c) => ({ ...c, faltan: diasHasta(c.dia, c.mes) })).sort((a, b) => a.faltan - b.faltan);
  const lineas = ordenados.map((c) => `${String(c.dia).padStart(2, "0")}/${String(c.mes).padStart(2, "0")} ${mencion(c.usuario)} — ${c.faltan === 0 ? "¡es hoy! 🎉" : c.faltan === 1 ? "mañana" : `en ${c.faltan} días`}`);
  return { texto: `🎂 *Cumpleaños del grupo*\n${lineas.join("\n")}`, mentions: ordenados.map((c) => c.usuario) };
}

async function saludoPara(usuario) {
  const user = getUser(usuario);
  const nombre = user?.apodo || user?.pushName || "";
  const fijos = [
    `🎂 ¡Feliz cumple ${mencion(usuario)}! Que la pases lindo hoy 🎉`,
    `🎉 Hoy cumple ${mencion(usuario)}, ¡felicidades! Que venga un año bueno 🎂`,
    `🥳 ¡Feliz cumpleaños ${mencion(usuario)}! A festejar como corresponde 🎂`,
  ];
  let texto = elegirAlAzar(fijos);
  if (globalThis.geminiApiKey) {
    const numero = usuario.split("@")[0];
    const r = await preguntarIA(
      `Hoy es el cumpleaños de ${nombre || "una persona del grupo"}${user?.memoria ? ` (lo que sabés de esta persona por charlas anteriores: ${user.memoria})` : ""}. Escribí un saludo de cumpleaños para el grupo, corto (2 o 3 frases), cálido y con tu onda, sin inventar datos. Empezá el mensaje con el texto exacto "@${numero}" para mencionarla. Solo el saludo, sin comillas ni explicaciones.`,
    ).catch(() => ({ ok: false }));
    if (r.ok && r.texto && r.texto.length < 500) texto = r.texto.includes(`@${numero}`) ? r.texto : `${mencion(usuario)} ${r.texto}`;
  }
  return { texto, mentions: [usuario] };
}

// Runs every 5 minutes from tareas-programadas.js
export async function chequearCumpleanos() {
  const ahora = new Date();
  if (ahora.getHours() < CUMPLE.HORA_SALUDO) return;
  const hoy = `${ahora.getFullYear()}-${ahora.getMonth() + 1}-${ahora.getDate()}`;
  for (const c of cumplesDeHoy(ahora.getDate(), ahora.getMonth() + 1)) {
    const tipo = `cumple:${c.usuario}`;
    if (periodoCerrado(c.chat, tipo, hoy)) continue;
    marcarPeriodoCerrado(c.chat, tipo, hoy);
    try {
      const saludo = await saludoPara(c.usuario);
      await globalThis.client.sendMessage(c.chat, { text: saludo.texto, mentions: saludo.mentions });
    } catch (e) {
      console.error("[cumpleaños] no se pudo saludar:", e.message);
    }
  }
}
