// Group hours: outside the window the bot closes the group (admins only) and opens it again when it starts.
// Runs every 5 minutes from tareas-programadas.js; the state it left is kept in chats.grupoCerradoPorHorario so the
// change isn't repeated and a manual close by an admin inside the window isn't overridden.
import { getChat, updateChat, chatsConHorarioGrupo } from "../database-functions.js";
import { parsearHorario, franjaDesdeTexto, franjaAbierta, textoHorario } from "./horario-juegos.js";
import { textoFecha } from "./tiempo.js";
import { anotarCierre } from "./inactivos.js";

// Without admin (or out of the group) WhatsApp refuses the change. It used to be asked again every 5 minutes, forever,
// and nobody heard about it: now it waits an hour between tries, and the group is told once (chats.horarioGrupoFalla
// keeps since when, so a restart doesn't tell it again).
export const HORARIO_GRUPO = { REINTENTO_MS: 60 * 60 * 1000 };
if (!globalThis.horarioGrupoReintento) globalThis.horarioGrupoReintento = new Map(); // chat -> no new try before this

const sinFalla = (chat) => {
  globalThis.horarioGrupoReintento.delete(chat);
  updateChat(chat, { horarioGrupoFalla: 0 });
};

export function fijarHorarioGrupo(chat, texto) {
  const h = parsearHorario(texto);
  if (!h) return { ok: false, error: "No entendí el horario. Poné desde y hasta, por ejemplo .horariogrupo 8:00-22:00 (puede cruzar medianoche: 9:00-01:00)." };
  updateChat(chat, { horarioGrupo: `${h.desde}-${h.hasta}` });
  sinFalla(chat); // setting it again (after getting admin back, say) tries right away
  return { ok: true, horario: h, mensaje: `🌙 Listo: el grupo queda abierto ${textoHorario(h)} y fuera de eso lo cierro yo (solo escriben los admins). Con .horariogrupo off se saca.` };
}

export async function quitarHorarioGrupo(chat, client = globalThis.client) {
  const fila = getChat(chat);
  updateChat(chat, { horarioGrupo: "", grupoCerradoPorHorario: 0 });
  sinFalla(chat);
  const abrio = fila?.grupoCerradoPorHorario ? await abrirOCerrar(chat, false, client).then(() => true, () => false) : true;
  if (!abrio) return { ok: true, mensaje: "🌙 Listo, saqué el horario del grupo. Lo dejé cerrado porque no pude abrirlo (no soy admin): abrilo a mano." };
  return { ok: true, mensaje: "🌙 Listo, saqué el horario del grupo: queda abierto hasta que un admin lo cierre a mano." };
}

export function textoHorarioGrupo(chat, ahora = Date.now()) {
  const fila = getChat(chat);
  const h = franjaDesdeTexto(fila?.horarioGrupo);
  if (!h) return "🌙 Este grupo no tiene horario: está abierto hasta que un admin lo cierre a mano.\n\nPara ponerle uno: .horariogrupo 8:00-22:00";
  const falla = fila?.horarioGrupoFalla ? `\n\n⚠️ Desde ${textoFecha(fila.horarioGrupoFalla, ahora)} no lo puedo cumplir: WhatsApp no me deja abrir ni cerrar el grupo (¿sigo siendo admin?). Si ya me lo devolvieron, .horariogrupo ${h.desde}-${h.hasta} lo intenta al toque.` : "";
  return `🌙 El grupo está abierto ${textoHorario(h)}; fuera de eso lo cierro yo.${falla}\n\n.horariogrupo off lo saca, .horariogrupo 9:00-23:00 lo cambia.`;
}

async function abrirOCerrar(chat, cerrar, client, cuando = Date.now()) {
  await client.groupSettingUpdate(chat, cerrar ? "announcement" : "not_announcement");
  anotarCierre(chat, cerrar, cuando); // the time it's closed doesn't count for .inactivos
}

// Returns how many groups changed state.
export async function chequearHorariosGrupo(ahora = new Date(), client = globalThis.client) {
  let cambios = 0;
  for (const fila of chatsConHorarioGrupo()) {
    const h = franjaDesdeTexto(fila.horarioGrupo);
    if (!h) continue;
    const abierto = franjaAbierta(h, ahora);
    const cerradoPorMi = fila.grupoCerradoPorHorario === 1;
    if (abierto === !cerradoPorMi) continue;
    if (ahora.getTime() < (globalThis.horarioGrupoReintento.get(fila.remoteJid) || 0)) continue;
    try {
      await abrirOCerrar(fila.remoteJid, !abierto, client, ahora.getTime());
    } catch (e) {
      console.error(`[horario del grupo] no pude ${abierto ? "abrir" : "cerrar"} ${fila.remoteJid} (¿soy admin?):`, e.message);
      globalThis.horarioGrupoReintento.set(fila.remoteJid, ahora.getTime() + HORARIO_GRUPO.REINTENTO_MS);
      if (!fila.horarioGrupoFalla) {
        updateChat(fila.remoteJid, { horarioGrupoFalla: ahora.getTime() });
        const aviso = `🌙 No pude ${abierto ? "abrir" : "cerrar"} el grupo como dice el horario: para eso necesito ser admin. Cuando me lo devuelvan sigo sola; si no, un admin lo saca con .horariogrupo off.`;
        await client.sendMessage(fila.remoteJid, { text: aviso }).catch(() => {}); // out of the group, there's no one to tell
      }
      continue;
    }
    globalThis.horarioGrupoReintento.delete(fila.remoteJid);
    updateChat(fila.remoteJid, { grupoCerradoPorHorario: abierto ? 0 : 1, horarioGrupoFalla: 0 });
    const texto = abierto ? `☀️ Grupo abierto. Horario: ${textoHorario(h)}.` : `🌙 Grupo cerrado hasta las ${h.desde}. Los admins pueden escribir.`;
    // The change is done whatever happens to the notice: a failed send used to be taken for a failed change.
    await client.sendMessage(fila.remoteJid, { text: texto }).catch((e) => console.error("[horario del grupo] no pude avisar:", e.message));
    cambios++;
  }
  return cambios;
}
