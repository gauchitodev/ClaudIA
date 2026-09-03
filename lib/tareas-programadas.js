// Tareas que corren solas cada 5 minutos mientras el bot está conectado: backup diario y semanal, y saludos de
// cumpleaños. Cada una decide por su cuenta si le toca (hora del día, ya hecho hoy, etc.).
import { chequearBackupProgramado } from "./backup.js";
import { chequearCumpleanos } from "./cumpleanos.js";
import { chequearPreguntaDelDia } from "./pregunta-dia.js";
import { programarTriviasDelDia } from "./trivia-relampago.js";
import { chequearRecapSemanal } from "./recap.js";

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
  };
  setInterval(correr, 5 * 60 * 1000);
  setTimeout(correr, 60 * 1000); // primera pasada al minuto de arrancar
}
