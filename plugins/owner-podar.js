import { podarActividad, ACTIVIDAD } from "../lib/actividad.js";

// .podar: drops the hourly detail older than ACTIVIDAD.HORARIA_DIAS, in every group. The per-day and per-person
// totals (actividad_diaria) are left alone: this only deletes the hour-by-hour breakdown, which is what grows.
const plugin = {};
plugin.cmd = ["podar", "poda"];
plugin.onlyOwner = true;

plugin.run = async (m, { client }) => {
  const filas = podarActividad();
  const texto = filas > 0 ? `🗑️ Podé ${filas} ${filas === 1 ? "fila" : "filas"} de actividad por hora anteriores a ${ACTIVIDAD.HORARIA_DIAS} días.` : `🗑️ No había actividad por hora de más de ${ACTIVIDAD.HORARIA_DIAS} días para podar.`;
  await client.sendText(m.chat, texto, m);
};

export default plugin;
