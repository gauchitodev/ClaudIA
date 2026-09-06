import { parejaDe, solicitudDe, cancelarSolicitud, exParejasDe } from "../lib/parejas.js";
import { duracionLarga } from "../lib/tiempo.js";

// .mipareja: con quién estás, desde cuándo, y si están casados. Un pedido sin respuesta se anula al consultar.
const plugin = {};
plugin.cmd = ["mipareja"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client }) => {
  const exs = exParejasDe(m.sender);
  const p = parejaDe(m.sender);
  if (!p) {
    const pendiente = solicitudDe(m.sender);
    if (pendiente) {
      cancelarSolicitud(m.sender);
      return client.sendText(m.chat, txt.parejaMiParejaSinRespuesta(pendiente.para), m);
    }
    const kz = await client.sendText(m.chat, txt.parejaNoTiene(m.sender, exs.length), m);
    return client.sendMessage(m.chat, { react: { text: "🤣", key: kz.key } });
  }
  const casados = p.casadosDesde > 0 ? `*💍Casados:* ✅\n*⏳Tiempo casados:*\n${duracionLarga(Date.now() - p.casadosDesde)}` : `*💍Casados:* ❌`;
  const kz = await client.sendText(m.chat, txt.parejaMiPareja(m.sender, p.pareja, duracionLarga(Date.now() - p.desde), casados, exs.length), m);
  client.sendMessage(m.chat, { react: { text: "❤️", key: kz.key } });
};

export default plugin;
