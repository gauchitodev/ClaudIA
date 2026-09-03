// Tareas que corren solas cada 5 minutos mientras el bot está conectado: backup diario y semanal, y saludos de
// cumpleaños. Cada una decide por su cuenta si le toca (hora del día, ya hecho hoy, etc.).
import { chequearBackupProgramado } from "./backup.js";
import { chequearCumpleanos } from "./cumpleanos.js";

export function iniciarTareasProgramadas() {
  const correr = () => {
    if (!globalThis.botConectado) return;
    chequearBackupProgramado().catch((e) => console.error("[backup]", e));
    chequearCumpleanos().catch((e) => console.error("[cumpleaños]", e));
  };
  setInterval(correr, 5 * 60 * 1000);
  setTimeout(correr, 60 * 1000); // primera pasada al minuto de arrancar
}
