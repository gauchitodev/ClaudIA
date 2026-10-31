import { deleteUser } from "../database-functions.js";
import { destinatarioActual, esOwnerDe } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["rd", "resetuser", "userreset", "restaurarusuario"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  // deleteUser deletes by LID, so the LID is what's needed: it used to be built by hand from whatever was typed.
  const { quien, lid, jid, mencionado } = await destinatarioActual(client, m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  const aBorrar = lid || quien;
  if (!aBorrar) return client.sendText(m.chat, "No tengo registro de esa persona.", m);

  // leave the bot's owners alone, unless they're resetting themselves
  if (esOwnerDe([mencionado, aBorrar, jid]) && m.sender !== aBorrar) return m.react("❌");

  // Nothing to reset when the LID WhatsApp gives for a number has no row: it said "Se reinició" all the same.
  if (!deleteUser(aBorrar).changes) return client.sendText(m.chat, "No tengo registro de esa persona.", m);
  client.sendText(m.chat, txt.rdSuccess(aBorrar), m);
};

export default plugin;
