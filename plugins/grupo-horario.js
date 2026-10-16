import { fijarHorarioGrupo, quitarHorarioGrupo, textoHorarioGrupo, chequearHorariosGrupo } from "../lib/horario-grupo.js";

const plugin = {};
plugin.cmd = ["horariogrupo", "horario"];
plugin.onlyGroup = true;
plugin.onlyAdmin = true;
// Without botAdmin: with the bot no longer admin, the schedule can't be kept, and .horariogrupo off is how it's taken
// away; the command used to refuse it for that very reason. Applying it is what needs admin, and that failure is told.

// .horariogrupo 8:00-22:00 sets the window and applies the state right away · .horariogrupo off clears it · with nothing, it shows
plugin.run = async (m, { client, text }) => {
  const pedido = (text || "").trim().toLowerCase();
  if (!pedido) return client.sendText(m.chat, textoHorarioGrupo(m.chat), m);
  if (/^(off|no|quitar|sacar|borrar|siempre)$/.test(pedido)) return client.sendText(m.chat, (await quitarHorarioGrupo(m.chat, client)).mensaje, m);
  const r = fijarHorarioGrupo(m.chat, pedido);
  if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
  await client.sendText(m.chat, r.mensaje, m);
  await chequearHorariosGrupo(new Date(), client);
};

export default plugin;
