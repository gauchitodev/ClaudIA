// Memoria del grupo: cosas que el propio grupo le anota a Claudia (".recordá que Fulano siempre llega tarde") y que
// ella tiene presentes en las charlas, además de la memoria por persona. Cualquiera puede anotar; borra quien lo
// anotó o un admin. Tope de entradas por grupo para que el prompt no crezca sin límite.
import { agregarMemoriaGrupo, memoriaGrupo, getMemoriaGrupo, borrarMemoriaGrupo, limpiarMemoriaGrupo } from "../database-functions.js";

export const MEMORIA = { MAX_POR_GRUPO: 40, MAX_LARGO: 200, MIN_LARGO: 5 };

export function recordar(chat, autor, texto) {
  const limpio = String(texto || "")
    .replace(/^(que|q)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (limpio.length < MEMORIA.MIN_LARGO) return { ok: false, error: "¿Qué tengo que recordar? Ej: .recordá que Fulano siempre llega tarde" };
  if (limpio.length > MEMORIA.MAX_LARGO) return { ok: false, error: `Muy largo: máximo ${MEMORIA.MAX_LARGO} letras.` };
  if (/contraseñ|password|tarjeta|cbu|cuenta bancaria|direccion|dirección|enfermedad/i.test(limpio)) return { ok: false, error: "Eso no lo guardo: nada de contraseñas, plata, direcciones ni salud." };
  if (memoriaGrupo(chat).length >= MEMORIA.MAX_POR_GRUPO) return { ok: false, error: `Ya tengo ${MEMORIA.MAX_POR_GRUPO} cosas anotadas de este grupo. Borrá alguna con .memoria borrar <número>.` };
  const id = agregarMemoriaGrupo(chat, limpio, autor);
  return { ok: true, id, mensaje: `🧠 Anotado (#${id}): ${limpio}` };
}

export function textoMemoria(chat) {
  const lista = memoriaGrupo(chat);
  if (lista.length === 0) return "No tengo nada anotado de este grupo todavía. Contame algo con .recordá que ...";
  return `🧠 *Lo que sé del grupo* (${lista.length}/${MEMORIA.MAX_POR_GRUPO})\n${lista.map((x) => `#${x.id} · ${x.texto}`).join("\n")}\n\nPara borrar: .memoria borrar <número> (quien lo anotó o un admin) · .memoria limpiar (admin)`;
}

export function borrar(chat, usuario, id, esAdmin) {
  const entrada = Number.isInteger(id) ? getMemoriaGrupo(chat, id) : null;
  if (!entrada) return { ok: false, error: `No hay ninguna anotación #${id} en este grupo. Mirá la lista con .memoria` };
  if (entrada.autor !== usuario && !esAdmin) return { ok: false, error: "Esa la anotó otra persona: la puede borrar quien la anotó o un admin." };
  borrarMemoriaGrupo(chat, id);
  return { ok: true, mensaje: `🗑️ Olvidado: ${entrada.texto}` };
}

export function limpiar(chat) {
  const n = limpiarMemoriaGrupo(chat);
  return { ok: true, mensaje: n ? `🗑️ Olvidé las ${n} cosas que tenía anotadas del grupo.` : "No había nada anotado." };
}

// Texto para el prompt de Claudia, o "" si no hay nada.
export function textoParaPrompt(chat) {
  const lista = memoriaGrupo(chat);
  if (lista.length === 0) return "";
  return `Cosas del grupo que ellos mismos te pidieron que tengas presentes: ${lista.map((x) => `"${x.texto}"`).join(" · ")}`;
}
