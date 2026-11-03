// .culpade: whose fault it is, according to the bot: someone from the group, at random ("Culpa de @persona"). Anyone
// but the bot, whoever asked included.
import { elegirAlAzar } from "../lib/azar.js";
import { esElBot } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["culpade"];
plugin.juego = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, participants }) => {
  // By the id the group lists them under, LID or number, handed in mentions as well: the "@<digits>" alone becomes
  // "<digits>@lid" (sendText, lib/wa-socket.js), which for a number is nobody, and WhatsApp tagged nobody.
  const candidatos = (participants || []).filter((p) => p?.id && !esElBot(p, client)).map((p) => p.id);
  if (!candidatos.length) return client.sendText(m.chat, "No pude ver la lista de miembros del grupo; probá de nuevo en un rato.", m);
  const culpable = elegirAlAzar(candidatos);
  return client.sendText(m.chat, `Culpa de @${culpable.split("@")[0]}`, m, { mentions: [culpable] });
};

export default plugin;
