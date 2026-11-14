// Tasks that run on their own every 5 minutes while the bot is connected: daily and weekly backup, birthday
// greetings, the marketplace's round and its catalogue, yt-dlp updates, the low battery notice, the football matches,
// the betting markets' last call.
// Each one decides for itself whether it's due (time of day, already done today, etc.).
import { chequearBackupProgramado } from "./backup.js";
import { chequearCumpleanos } from "./cumpleanos.js";
import { chequearPreguntaDelDia } from "./pregunta-dia.js";
import { programarTriviasDelDia } from "./trivia-relampago.js";
import { chequearRecapSemanal } from "./recap.js";
import { chequearHorariosGrupo } from "./horario-grupo.js";
import { chequearPublicaciones, mostrarCatalogos } from "./compraventa.js";
import { chequearActualizacionYtDlp } from "./ytdlp.js";
import { iniciarClaros } from "./claros.js";
import { iniciarVistazos } from "./vistazos.js";
import { chequearBateriaBaja } from "./bateria.js";
import { chequearPartidos } from "./partidos.js";
import { chequearUltimosLlamados } from "./ultimo-llamado.js";
import { podarMemoria } from "./contexto-chat.js";
import { conexion } from "./conexion.js";

export function iniciarTareasProgramadas() {
  const correr = () => {
    if (!conexion.botConectado) return;
    chequearBackupProgramado().catch((e) => console.error("[backup]", e));
    chequearCumpleanos().catch((e) => console.error("[cumpleaños]", e));
    chequearPreguntaDelDia().catch((e) => console.error("[pregunta del día]", e));
    try {
      programarTriviasDelDia();
    } catch (e) {
      console.error("[trivia relámpago]", e);
    }
    chequearRecapSemanal().catch((e) => console.error("[recap]", e));
    chequearHorariosGrupo().catch((e) => console.error("[horario del grupo]", e));
    // The catalogue after the day's round, whatever came of it: it's the list its take-downs leave.
    chequearPublicaciones()
      .catch((e) => console.error("[compraventa]", e))
      .then(() => mostrarCatalogos())
      .catch((e) => console.error("[catálogo]", e));
    chequearActualizacionYtDlp().catch((e) => console.error("[yt-dlp]", e));
    chequearBateriaBaja().catch((e) => console.error("[batería]", e));
    // The football matches: the ones ahead, the markets that wait for a result, Peñarol's and Nacional's
    // (lib/partidos.js).
    chequearPartidos().catch((e) => console.error("[partidos]", e));
    // The betting markets whose bets close in about three hours, shown again (lib/ultimo-llamado.js).
    chequearUltimosLlamados().catch((e) => console.error("[último llamado]", e));
    // Claudia's memory keeps the last 6 hours, also in a chat that went quiet after a burst (lib/contexto-chat.js).
    try {
      podarMemoria();
    } catch (e) {
      console.error("[memoria corta]", e);
    }
  };
  setInterval(correr, 5 * 60 * 1000);
  iniciarClaros(); // Inumet's claros are read ten past each hour, on their own clock
  iniciarVistazos(); // Claudia's glances (her initiative) check every minute whether one is due
  setTimeout(correr, 60 * 1000); // primera pasada al minuto de arrancar
}
