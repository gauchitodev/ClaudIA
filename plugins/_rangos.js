import { chequearAscenso } from "../lib/rangos.js";

// On every group message it checks whether the person climbed a rank (by days and messages) and announces it.
const plugin = (m) => m;
plugin.before = async (m, { client, user, chat }) => {
  if (!m.isGroup || !m.message || m.fromMe || !user) return;
  // .monedas off: they still climb but without a prize · .ascensos off: they still climb but it isn't announced
  const aviso = chequearAscenso(m.chat, m.sender, user, Date.now(), { pagar: chat?.monedas !== 0 });
  if (aviso && chat?.ascensos !== 0) await client.sendMessage(m.chat, { text: aviso.texto, mentions: aviso.mentions });
};

export default plugin;
