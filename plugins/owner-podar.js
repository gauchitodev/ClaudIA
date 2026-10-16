import { podarActividad, ACTIVIDAD } from "../lib/actividad.js";
import { podarEnvios } from "../lib/envios.js";
import { podarUsos } from "../lib/usos.js";

// .podar: drops the hourly detail older than ACTIVIDAD.HORARIA_DIAS, in every group: the group's activity by hour, the
// count of what the bot sent and the count of the commands people use. The per-day and per-person totals
// (actividad_diaria) are left alone: this only deletes the day-by-day breakdowns, which are what grows.
const plugin = {};
plugin.cmd = ["podar", "poda"];
plugin.onlyOwner = true;

plugin.run = async (m, { client }) => {
  const filas = podarActividad();
  const envios = podarEnvios();
  const usos = podarUsos();
  const texto =
    filas + envios + usos > 0
      ? `🗑️ Podé ${filas} ${filas === 1 ? "fila" : "filas"} de actividad por hora, ${envios} de envíos del bot y ${usos} de usos de comandos, anteriores a ${ACTIVIDAD.HORARIA_DIAS} días.`
      : `🗑️ No había actividad por hora, envíos del bot ni usos de comandos de más de ${ACTIVIDAD.HORARIA_DIAS} días para podar.`;
  await client.sendText(m.chat, texto, m);
};

export default plugin;
