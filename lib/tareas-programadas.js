// Tasks that run on their own every 5 minutes while the bot is connected: daily and weekly backup, birthday
// greetings, the marketplace's round and its catalogue, yt-dlp updates, the low battery notice, the football matches,
// the betting markets' last call, Claudia's diary of the groups that keep one.
// Each one decides for itself whether it's due (time of day, already done today, etc.).
import { chequearBackupProgramado } from "./backup.js";
import { chequearCumpleanos } from "./cumpleanos.js";
import { chequearPreguntaDelDia } from "./pregunta-dia.js";
import { programarTriviasDelDia } from "./trivia-relampago.js";
import { programarChangasDelDia } from "./changas.js";
import { programarSobresDelDia } from "./espias.js";
import { programarEncargosDelDia } from "./encargos.js";
import { chequearPueblos } from "./pueblo.js";
import { chequearRobosDeAutos } from "./tienda.js";
import { chequearBanco } from "./banco.js";
import { chequearElecciones } from "./elecciones.js";
import { chequearNovedades } from "./novedades.js";
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
import { chequearDiario } from "./diario.js";
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
    // The day's group changas, in the groups that asked for them (lib/changas.js).
    try {
      programarChangasDelDia();
    } catch (e) {
      console.error("[changas]", e);
    }
    // The day's secret-mission envelope, in the groups that play (lib/espias.js).
    try {
      programarSobresDelDia();
    } catch (e) {
      console.error("[espias]", e);
    }
    // The day's urgent errands, in the groups that asked for them (lib/encargos.js).
    try {
      programarEncargosDelDia();
    } catch (e) {
      console.error("[encargos]", e);
    }
    // Each town's day and its event, in the groups that are one (lib/pueblo.js).
    try {
      chequearPueblos();
    } catch (e) {
      console.error("[pueblo]", e);
    }
    // And, where safety is low, the car somebody bought in the shop may be stolen (lib/tienda.js).
    try {
      chequearRobosDeAutos();
    } catch (e) {
      console.error("[tienda]", e);
    }
    // Each town's Banco Central: its rate, the deposits that are up, the instalments and contracts due (lib/banco.js).
    chequearBanco(conexion.client).catch((e) => console.error("[banco]", e));
    // Each town's elections: the campaign from the 1st, the voting, the count, the juicios that ran out (lib/elecciones.js).
    chequearElecciones(conexion.client).catch((e) => console.error("[elecciones]", e));
    // The news of a big update, once to each town that hadn't heard (lib/novedades.js).
    chequearNovedades(conexion.client).catch((e) => console.error("[novedades]", e));
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
    // Her diary of the groups that keep one (lib/diario.js): what was said in the stretch of the day that just closed.
    // Before the memory lets go of what's older than 6 hours, right below: it reads what it needs as it starts.
    chequearDiario().catch((e) => console.error("[diario]", e));
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
