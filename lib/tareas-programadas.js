// Tasks that run on their own every 5 minutes while the bot is connected: daily and weekly backup, birthday
// greetings, yt-dlp updates. Each one decides for itself whether it's due (time of day, already done today, etc.).
import { chequearBackupProgramado } from "./backup.js";
import { chequearCumpleanos } from "./cumpleanos.js";
import { chequearPreguntaDelDia } from "./pregunta-dia.js";
import { programarTriviasDelDia } from "./trivia-relampago.js";
import { chequearRecapSemanal } from "./recap.js";
import { chequearHorariosGrupo } from "./horario-grupo.js";
import { chequearPublicaciones } from "./compraventa.js";
import { chequearActualizacionYtDlp } from "./ytdlp.js";
import { iniciarClaros } from "./claros.js";
import { iniciarVistazos } from "./vistazos.js";

export function iniciarTareasProgramadas() {
  const correr = () => {
    if (!globalThis.botConectado) return;
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
    chequearPublicaciones().catch((e) => console.error("[compraventa]", e));
    chequearActualizacionYtDlp().catch((e) => console.error("[yt-dlp]", e));
  };
  setInterval(correr, 5 * 60 * 1000);
  iniciarClaros(); // Inumet's claros are read ten past each hour, on their own clock
  iniciarVistazos(); // Claudia's glances (her initiative) check every minute whether one is due
  setTimeout(correr, 60 * 1000); // primera pasada al minuto de arrancar
}
