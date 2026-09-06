// Tareas que corren solas cada 5 minutos mientras el bot está conectado: backup diario y semanal, saludos de
// cumpleaños, actualización de yt-dlp. Cada una decide por su cuenta si le toca (hora del día, ya hecho hoy, etc.).
import { chequearBackupProgramado } from "./backup.js";
import { chequearCumpleanos } from "./cumpleanos.js";
import { chequearPreguntaDelDia } from "./pregunta-dia.js";
import { programarTriviasDelDia } from "./trivia-relampago.js";
import { chequearRecapSemanal } from "./recap.js";
import { chequearHorariosGrupo } from "./horario-grupo.js";
import { chequearPublicaciones } from "./compraventa.js";
import { chequearActualizacionYtDlp } from "./ytdlp.js";
import { iniciarClaros } from "./claros.js";

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
  iniciarClaros(); // los claros de Inumet se leen a los 10 de cada hora, con su propio reloj
  setTimeout(correr, 60 * 1000); // primera pasada al minuto de arrancar
}
