import { getUser } from "../database-functions.js";
import { lidMencionado, nombreDe } from "../lib/menciones.js";
import { emanciparse, desheredar } from "../lib/familia.js";

// .emancipar: you leave your family. .desheredar @child: a parent removes a child. In both cases, if they bore the
// family surname, they drop it.
const plugin = {};
plugin.cmd = ["emancipar", "emanciparse", "emanciparme", "desheredar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  if (command === "desheredar") {
    const who = lidMencionado(m, text);
    if (!who || !getUser(who)) return client.sendText(m.chat, `¿A quién? Uso: ${usedPrefix}${command} @hijo`, m);
    const r = desheredar(m.sender, who);
    if (!r.ok) return client.sendText(m.chat, `${nombreDe(who)} no es hijo tuyo.`, m);
    return client.sendText(m.chat, `📜 ${nombreDe(m.sender)} desheredó a ${nombreDe(who)}: ya no es parte de la familia${r.apellidoPerdido ? ` y deja el apellido ${r.apellidoPerdido}` : ""}. Qué drama.`, m);
  }
  const r = emanciparse(m.sender);
  if (!r.ok) return client.sendText(m.chat, "No tenés padres de quién emanciparte.", m);
  await client.sendText(m.chat, `🧳 ${nombreDe(m.sender)} se emancipó: ya no es hijo de ${r.padres.map(nombreDe).join(" y ")}${r.apellidoPerdido ? ` y deja el apellido ${r.apellidoPerdido}` : ""}.`, m);
};

export default plugin;
