import { chequearAscenso } from "../lib/rangos.js";

// En cada mensaje de grupo revisa si la persona subió de rango (por días y mensajes) y lo anuncia.
let plugin = (m) => m;
plugin.before = async function (m, { client, user }) {
  if (!m.isGroup || !m.message || m.fromMe || !user) return;
  const aviso = chequearAscenso(m.chat, m.sender, user);
  if (aviso) await client.sendMessage(m.chat, { text: aviso.texto, mentions: aviso.mentions });
};

export default plugin;
