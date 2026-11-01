import { responderCasamiento } from "../lib/parejas.js";
import { responderAdopcion, textoRespuestaAdopcion, porAdoptar } from "../lib/familia.js";
import { comoLoEsperan } from "../lib/identidad.js";

// .no: turns down your partner's marriage proposal, or the adoption you were offered.
const plugin = {};
plugin.cmd = ["no"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, participants }) => {
  // Asked by their LID, whoever writes from their number alone answers from it (lib/identidad.js).
  const hijo = await comoLoEsperan(client, m, participants, porAdoptar(m.sender));
  const adopcion = textoRespuestaAdopcion(m.sender, responderAdopcion(hijo, false));
  if (adopcion) return client.sendMessage(m.chat, adopcion, { quoted: m });
  const r = responderCasamiento(m.sender, false);
  if (!r.ok) {
    if (r.motivo === "sinPareja") return client.sendText(m.chat, txt.parejaCasamientoNull, m);
    if (r.motivo === "yaCasados") return client.sendText(m.chat, txt.parejaCasamientoAlready, m);
    return;
  }
  const kz = await client.sendText(m.chat, txt.parejaCasamientoRechazar(m.sender, r.pareja), m);
  client.sendMessage(m.chat, { react: { text: "💔", key: kz.key } });
};

export default plugin;
