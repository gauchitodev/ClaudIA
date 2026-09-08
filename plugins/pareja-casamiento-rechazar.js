import { responderCasamiento } from "../lib/parejas.js";
import { responderAdopcion, textoRespuestaAdopcion } from "../lib/familia.js";

// .no: rechaza la propuesta de casamiento de tu pareja, o la adopción que te ofrecieron.
const plugin = {};
plugin.cmd = ["no"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client }) => {
  const adopcion = textoRespuestaAdopcion(m.sender, responderAdopcion(m.sender, false));
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
