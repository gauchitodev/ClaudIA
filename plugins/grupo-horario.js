import { fijarHorarioGrupo, quitarHorarioGrupo, textoHorarioGrupo, chequearHorariosGrupo } from "../lib/horario-grupo.js";

let plugin = {};
plugin.cmd = ["horariogrupo", "horario"];
plugin.onlyGroup = true;
plugin.onlyAdmin = true;
plugin.botAdmin = true;

// .horariogrupo 8:00-22:00 fija la franja y aplica el estado enseguida · .horariogrupo off la saca · sin nada, muestra
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
