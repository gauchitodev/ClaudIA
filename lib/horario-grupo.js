// Group hours: outside the window the bot closes the group (admins only) and opens it again when it starts.
// Runs every 5 minutes from tareas-programadas.js; the state it left is kept in chats.grupoCerradoPorHorario so the
// change isn't repeated and a manual close by an admin inside the window isn't overridden.
import { getChat, updateChat, chatsConHorarioGrupo } from "../database-functions.js";
import { parsearHorario, franjaDesdeTexto, franjaAbierta, textoHorario } from "./horario-juegos.js";

export function fijarHorarioGrupo(chat, texto) {
  const h = parsearHorario(texto);
  if (!h) return { ok: false, error: "No entendí el horario. Poné desde y hasta, por ejemplo .horariogrupo 8:00-22:00 (puede cruzar medianoche: 9:00-01:00)." };
  updateChat(chat, { horarioGrupo: `${h.desde}-${h.hasta}` });
  return { ok: true, horario: h, mensaje: `🌙 Listo: el grupo queda abierto ${textoHorario(h)} y fuera de eso lo cierro yo (solo escriben los admins). Con .horariogrupo off se saca.` };
}

export async function quitarHorarioGrupo(chat, client = globalThis.client) {
  const fila = getChat(chat);
  updateChat(chat, { horarioGrupo: "", grupoCerradoPorHorario: 0 });
  if (fila?.grupoCerradoPorHorario) await abrirOCerrar(chat, false, client).catch(() => {});
  return { ok: true, mensaje: "🌙 Listo, saqué el horario del grupo: queda abierto hasta que un admin lo cierre a mano." };
}

export function textoHorarioGrupo(chat) {
  const h = franjaDesdeTexto(getChat(chat)?.horarioGrupo);
  if (!h) return "🌙 Este grupo no tiene horario: está abierto hasta que un admin lo cierre a mano.\n\nPara ponerle uno: .horariogrupo 8:00-22:00";
  return `🌙 El grupo está abierto ${textoHorario(h)}; fuera de eso lo cierro yo.\n\n.horariogrupo off lo saca, .horariogrupo 9:00-23:00 lo cambia.`;
}

async function abrirOCerrar(chat, cerrar, client) {
  await client.groupSettingUpdate(chat, cerrar ? "announcement" : "not_announcement");
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
    try {
      await abrirOCerrar(fila.remoteJid, !abierto, client);
      updateChat(fila.remoteJid, { grupoCerradoPorHorario: abierto ? 0 : 1 });
      const texto = abierto ? `☀️ Grupo abierto. Horario: ${textoHorario(h)}.` : `🌙 Grupo cerrado hasta las ${h.desde}. Los admins pueden escribir.`;
      await client.sendMessage(fila.remoteJid, { text: texto });
      cambios++;
    } catch (e) {
      console.error(`[horario del grupo] no pude ${abierto ? "abrir" : "cerrar"} ${fila.remoteJid} (¿soy admin?):`, e.message);
    }
  }
  return cambios;
}
