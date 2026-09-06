import { setTimeout as esperar } from "node:timers/promises";
import { responderCasamiento } from "../lib/parejas.js";

// .si: acepta la propuesta de casamiento de tu pareja.
const plugin = {};
plugin.cmd = ["si"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client }) => {
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
