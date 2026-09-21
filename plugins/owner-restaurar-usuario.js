import { deleteUser, esOwner } from "../database-functions.js";
import { destinatario } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["rd", "resetuser", "userreset", "restaurarusuario"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  // deleteUser deletes by LID, so the LID is what's needed: it used to be built by hand from whatever was typed.
  const { quien, lid, jid, mencionado } = destinatario(m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  const aBorrar = lid || quien;
  if (!aBorrar) return client.sendText(m.chat, "No tengo registro de esa persona.", m);

  // leave the bot's owners alone, unless they're resetting themselves
  if ((esOwner(mencionado) || esOwner(aBorrar) || (jid && esOwner(jid))) && m.sender !== aBorrar) return m.react("❌");

  deleteUser(aBorrar);
  client.sendText(m.chat, txt.rdSuccess(aBorrar), m);
};

export default plugin;
