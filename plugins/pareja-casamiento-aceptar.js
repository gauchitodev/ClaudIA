import { setTimeout as esperar } from "node:timers/promises";
import { responderCasamiento } from "../lib/parejas.js";
import { responderAdopcion, textoRespuestaAdopcion } from "../lib/familia.js";

// .si: acepta la propuesta de casamiento de tu pareja, o la adopción que te ofrecieron.
const plugin = {};
plugin.cmd = ["si"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client }) => {
  const adopcion = textoRespuestaAdopcion(m.sender, responderAdopcion(m.sender, true));
  if (adopcion) return client.sendMessage(m.chat, adopcion, { quoted: m });
  const r = responderCasamiento(m.sender, true);
  if (!r.ok) {
    if (r.motivo === "sinPareja") return client.sendText(m.chat, txt.parejaCasamientoNull, m);
    if (r.motivo === "yaCasados") return client.sendText(m.chat, txt.parejaCasamientoAlready, m);
    return; // sin propuesta pendiente: ".si" es una palabra común, mejor no contestar nada
  }
  const kz = await client.sendText(m.chat, txt.parejaCasamientoSuccess(m.sender, r.pareja), m);
  await esperar(700);
  for (const emoji of ["💗", "❤️‍🔥", "🩵", "💚", "💛", "🩷", "❤️"]) {
    await client.sendMessage(m.chat, { react: { text: emoji, key: kz.key } });
    await esperar(700);
  }
};

export default plugin;
