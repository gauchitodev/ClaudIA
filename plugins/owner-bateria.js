import { leerBateria, estadoBateria, SIN_BATERIA } from "../lib/bateria.js";

// .bat: the battery of the phone or tablet the bot runs on (see lib/bateria.js). .estado has the same in one line.
const plugin = {};
plugin.cmd = ["bat", "bateria"];
plugin.onlyOwner = true;

plugin.run = async (m, { client }) => {
  const b = await leerBateria();
  if (!b) return client.sendText(m.chat, SIN_BATERIA, m);

  const estado = estadoBateria(b.estado);
  const temperatura = Number.isFinite(b.temperatura) ? `\n🌡️ Temperatura: ${b.temperatura.toFixed(1)} °C` : "";
  return client.sendText(m.chat, `🔋 Batería: *${b.porcentaje}%*${estado ? ` (${estado})` : ""}${temperatura}`, m);
};

export default plugin;
