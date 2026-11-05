import { parejaDe, solicitudDe, cancelarSolicitud, exParejasDe } from "../lib/parejas.js";
import { duracionLarga } from "../lib/tiempo.js";
import { generoDeVarios, concordarPlural } from "../lib/genero.js";

// .mipareja: who you're with, since when, and whether you're married. An unanswered request is voided on lookup.
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
  // "Casadas" when both are women (.genero, lib/genero.js); otherwise as always.
  const casados = concordarPlural(p.casadosDesde > 0 ? `*💍Casados:* ✅\n*⏳Tiempo casados:*\n${duracionLarga(Date.now() - p.casadosDesde)}` : `*💍Casados:* ❌`, generoDeVarios([m.sender, p.pareja]));
  const kz = await client.sendText(m.chat, txt.parejaMiPareja(m.sender, p.pareja, duracionLarga(Date.now() - p.desde), casados, exs.length), m);
  client.sendMessage(m.chat, { react: { text: "❤️", key: kz.key } });
};

export default plugin;
