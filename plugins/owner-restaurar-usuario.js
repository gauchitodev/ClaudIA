import { deleteUser } from "../database-functions.js";
import { destinatarioActual, esOwnerDe } from "../lib/identidad.js";
import txt from "../lib/strings.js";

const plugin = {};
plugin.cmd = ["rd", "resetuser", "userreset", "restaurarusuario"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  // deleteUser deletes by LID, so the LID is what's needed: it used to be built by hand from whatever was typed.
  const { filas, lid, jid, mencionado } = await destinatarioActual(client, m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  // The rows they have: the LID's, or the one kept under the number for someone the bot knew by it alone, and both for
  // someone who writes from their number alone somewhere (lib/identidad.js, filasDe): left behind, that one kept the
  // silence and the ban .mute and .banuser put there.
  const aBorrar = filas.length ? filas : [lid].filter(Boolean);
  if (!aBorrar.length) return client.sendText(m.chat, "No tengo registro de esa persona.", m);

  // leave the bot's owners alone, unless they're resetting themselves
  if (esOwnerDe([mencionado, ...aBorrar, jid]) && !aBorrar.includes(m.sender)) return m.react("❌");

  // Nothing to reset when the LID WhatsApp gives for a number has no row: it said "Se reinició" all the same.
  if (!aBorrar.map((id) => deleteUser(id).changes).some(Boolean)) return client.sendText(m.chat, "No tengo registro de esa persona.", m);
  // With the mention: of someone the bot knows by their number alone, the "@" in the text tagged nobody (sendText).
  client.sendText(m.chat, txt.rdSuccess(aBorrar[0]), m, { mentions: [aBorrar[0]] });
};

export default plugin;
