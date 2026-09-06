import { chequearAscenso } from "../lib/rangos.js";

// En cada mensaje de grupo revisa si la persona subió de rango (por días y mensajes) y lo anuncia.
const plugin = (m) => m;
plugin.before = async (m, { client, user, chat }) => {
  if (!m.isGroup || !m.message || m.fromMe || !user) return;
  // .monedas apagado: sube igual pero sin premio · .ascensos apagado: sube igual pero no se anuncia
  const aviso = chequearAscenso(m.chat, m.sender, user, Date.now(), { pagar: chat?.monedas !== 0 });
  if (aviso && chat?.ascensos !== 0) await client.sendMessage(m.chat, { text: aviso.texto, mentions: aviso.mentions });
};

export default plugin;
