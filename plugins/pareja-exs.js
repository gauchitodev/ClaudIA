import { getUser } from "../database-functions.js";
import { nombreDe } from "../lib/menciones.js";
import { lidMencionado } from "../lib/identidad.js";
import { parejaDe, exParejasDe } from "../lib/parejas.js";

// .ex [@x]: someone's exes (or yours) and their current partner. Only whoever it's about is tagged: the rest go by
// name, since tagging the whole list notified every ex.
const plugin = {};
plugin.cmd = ["ex", "miex", "exs"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  const who = lidMencionado(m, text, participants) || m.sender;
  if (!getUser(who)) return client.sendText(m.chat, txt.parejaDefaultWho(usedPrefix, command), m);

  const exs = exParejasDe(who);
  const p = parejaDe(who);
  const lineas = [`*Historial de relaciones de @${who.split("@")[0]}:*`, ""];
  if (exs.length) lineas.push(...exs.map(nombreDe));
  else lineas.push("No hay parejas anteriores.");
  lineas.push("", p ? `*Pareja actual:* ${nombreDe(p.pareja)}` : "*Pareja actual: no tiene*");
  await client.sendMessage(m.chat, { text: lineas.join("\n"), mentions: [who] }, { quoted: m });
};

export default plugin;
