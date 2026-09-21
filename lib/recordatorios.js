// Reminders: ".recordame en 2h sacar la pizza". They're stored as pending work in the database (surviving restarts)
// and the pending-work processor sends them at the right time, mentioning whoever asked.
import { crearPendiente, pendientesDeUsuario, cancelarPendiente } from "../database-functions.js";
import { parsearMomento, textoFecha, DIA_MS } from "./tiempo.js";

export const RECORDATORIOS = { MAX_POR_PERSONA: 10, MAX_DIAS: 60, MAX_LARGO: 200 };

// "en 2h sacar la pizza" -> { ms, texto }. It tries 3, 2 and 1 words as the moment ("en 2 h", "mañana 9:00", "20:30").
function separarMomento(args) {
  for (const n of [3, 2, 1]) {
    if (args.length < n) continue;
    const ms = parsearMomento(args.slice(0, n).join(" "));
    if (ms) return { ms, texto: args.slice(n).join(" ") };
  }
  return null;
}

export function crearRecordatorio(chat, usuario, args) {
  const sep = separarMomento(args || []);
  if (!sep) return { ok: false, error: "¿Cuándo? Ej: .recordame en 2h sacar la pizza · .recordame mañana 9:00 pagar la luz · .recordame 18/09 20:30 partido" };
  const texto = sep.texto.replace(/\s+/g, " ").trim();
  if (!texto) return { ok: false, error: "¿Qué te recuerdo? Ej: .recordame en 2h sacar la pizza" };
  if (texto.length > RECORDATORIOS.MAX_LARGO) return { ok: false, error: `Muy largo: máximo ${RECORDATORIOS.MAX_LARGO} letras.` };
  if (sep.ms <= Date.now() + 30 * 1000) return { ok: false, error: "Tiene que ser al menos medio minuto adelante." };
  if (sep.ms > Date.now() + RECORDATORIOS.MAX_DIAS * DIA_MS) return { ok: false, error: `Como mucho ${RECORDATORIOS.MAX_DIAS} días adelante.` };
  if (pendientesDeUsuario(usuario, "recordatorio").length >= RECORDATORIOS.MAX_POR_PERSONA) {
    return { ok: false, error: `Ya tenés ${RECORDATORIOS.MAX_POR_PERSONA} recordatorios pendientes. Borrá alguno con .olvidar <número>.` };
  }
  const id = crearPendiente(chat, usuario, "recordatorio", { texto }, sep.ms);
  return { ok: true, mensaje: `⏰ Listo, te lo recuerdo ${textoFecha(sep.ms)}: *${texto}* (#${id})` };
}

export function textoRecordatorios(usuario) {
  const lista = pendientesDeUsuario(usuario, "recordatorio");
  if (lista.length === 0) return "No tenés recordatorios pendientes. Creá uno con .recordame en 2h <texto>";
  return `⏰ *Tus recordatorios*\n${lista.map((p) => `#${p.id} · ${textoFecha(p.ejecutar_en)} · ${p.datos.texto}`).join("\n")}\n\nPara borrar uno: .olvidar <número>`;
}

export function olvidarRecordatorio(usuario, id) {
  if (!Number.isInteger(id)) return { ok: false, error: "Uso: .olvidar <número del recordatorio>. Los ves con .recordatorios" };
  if (!cancelarPendiente(id, usuario, "recordatorio")) return { ok: false, error: `No tenés ningún recordatorio #${id} pendiente.` };
  return { ok: true, mensaje: `🗑️ Recordatorio #${id} borrado.` };
}

// Called by the pending-work processor when the time comes.
export async function ejecutarRecordatorio(client, p) {
  await client.sendMessage(p.chat, { text: `⏰ @${p.usuario.split("@")[0]}, me pediste que te recuerde: *${p.datos.texto}*`, mentions: [p.usuario] });
}
