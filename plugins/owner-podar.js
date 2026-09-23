import { podarActividad, ACTIVIDAD } from "../lib/actividad.js";
import { podarEnvios } from "../lib/envios.js";

// .podar: drops the hourly detail older than ACTIVIDAD.HORARIA_DIAS, in every group: the group's activity by hour and
// the count of what the bot sent. The per-day and per-person totals (actividad_diaria) are left alone: this only
// deletes the hour-by-hour breakdowns, which are what grows.
const plugin = {};
plugin.cmd = ["podar", "poda"];
plugin.onlyOwner = true;

plugin.run = async (m, { client }) => {
  const filas = podarActividad();
  const envios = podarEnvios();
  const texto =
    filas + envios > 0
      ? `🗑️ Podé ${filas} ${filas === 1 ? "fila" : "filas"} de actividad por hora y ${envios} de envíos del bot, anteriores a ${ACTIVIDAD.HORARIA_DIAS} días.`
      : `🗑️ No había actividad por hora ni envíos del bot de más de ${ACTIVIDAD.HORARIA_DIAS} días para podar.`;
  await client.sendText(m.chat, texto, m);
};

export default plugin;
