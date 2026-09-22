import { podarActividad, ACTIVIDAD } from "../lib/actividad.js";

// .podar: saca el detalle horario más viejo que ACTIVIDAD.HORARIA_DIAS, en todos los grupos. Los totales por día y
// por persona (actividad_diaria) no se tocan: esto solo borra el desglose hora por hora, que es lo que engorda.
const plugin = {};
plugin.cmd = ["podar", "poda"];
plugin.onlyOwner = true;

plugin.run = async (m, { client }) => {
  const filas = podarActividad();
  const texto = filas > 0 ? `🗑️ Podé ${filas} ${filas === 1 ? "fila" : "filas"} de actividad por hora anteriores a ${ACTIVIDAD.HORARIA_DIAS} días.` : `🗑️ No había actividad por hora de más de ${ACTIVIDAD.HORARIA_DIAS} días para podar.`;
  await client.sendText(m.chat, texto, m);
};

export default plugin;
