import { setTimeout as esperar } from "node:timers/promises";
import { expulsar, idDelAutor } from "../lib/identidad.js";

const plugin = {};
// Careful: it used to answer to ".salir" too, so anyone writing it (to quit a game, say) removed themselves.
plugin.cmd = ["suicidarse", "matarse", "suicidio", "suicidarme", "matarme"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, isOwner, participants }) => {
  if (isOwner) return;
  await client.sendMessage(m.chat, { text: `*@${m.sender.split("@")[0]} ACABA DE EJECUTAR SU ELIMINACIÓN😐*`, mentions: [m.sender] }, { quoted: m });
  await esperar(1500);
  const { ok, status } = await expulsar(client, m.chat, idDelAutor(m, participants));
  if (!ok) await client.sendText(m.chat, `No pude sacarte (error ${status}).`, m);
};

export default plugin;
