import { getUser } from "../database-functions.js";
import { lidMencionado } from "../lib/menciones.js";
import { parejaDe, exParejasDe } from "../lib/parejas.js";

// .ex [@x]: someone's exes (or yours) and their current partner.
const plugin = {};
plugin.cmd = ["ex", "miex", "exs"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  const who = lidMencionado(m, text) || m.sender;
  if (!getUser(who)) return client.sendText(m.chat, txt.parejaDefaultWho(usedPrefix, command), m);

  const exs = exParejasDe(who);
  const p = parejaDe(who);
  const lineas = [`*Historial de relaciones de @${who.split("@")[0]}:*`, ""];
  if (exs.length) lineas.push(...exs.map((ex) => `@${ex.split("@")[0]}`));
  else lineas.push("No hay parejas anteriores.");
  lineas.push("", p ? `*Pareja actual:* @${p.pareja.split("@")[0]}` : "*Pareja actual: no tiene*");
  await client.sendMessage(m.chat, { text: lineas.join("\n"), mentions: [who, ...exs, ...(p ? [p.pareja] : [])] }, { quoted: m });
};

export default plugin;
