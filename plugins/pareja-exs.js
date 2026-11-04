import { getUser } from "../database-functions.js";
import { nombreDe, modoDeNombre, nombrandoPor } from "../lib/menciones.js";
import { lidMencionadoActual } from "../lib/identidad.js";
import { parejaDe, exParejasDe } from "../lib/parejas.js";

// .ex [@x]: someone's exes (or yours) and their current partner. Only whoever it's about is tagged: the rest go by
// name, since tagging the whole list notified every ex. With "nombres" or "numeros", by their WhatsApp name or by their
// number (lib/menciones.js).
const plugin = {};
plugin.cmd = ["ex", "miex", "exs"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  const { modo, texto } = modoDeNombre(text);
  const who = (await lidMencionadoActual(client, m, texto, participants)) || m.sender;
  if (!getUser(who)) return client.sendText(m.chat, txt.parejaDefaultWho(usedPrefix, command), m);

  const exs = exParejasDe(who);
  const p = parejaDe(who);
  const lineas = nombrandoPor(modo, () => {
    const l = [`*Historial de relaciones de @${who.split("@")[0]}:*`, ""];
    if (exs.length) l.push(...exs.map(nombreDe));
    else l.push("No hay parejas anteriores.");
    l.push("", p ? `*Pareja actual:* ${nombreDe(p.pareja)}` : "*Pareja actual: no tiene*");
    return l;
  });
  await client.sendMessage(m.chat, { text: lineas.join("\n"), mentions: [who] }, { quoted: m });
};

export default plugin;
