import { deleteUser, esOwner } from "../database-functions.js";
import { destinatario } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["rd", "resetuser", "userreset", "restaurarusuario"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  // deleteUser borra por LID, así que hace falta el LID: antes se armaba a mano con lo que estuviera escrito.
  const { quien, lid, jid, mencionado } = destinatario(m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  const aBorrar = lid || quien;
  if (!aBorrar) return client.sendText(m.chat, "No tengo registro de esa persona.", m);

  // no afectar a owners del bot, salvo que se esté reseteando a sí mismo
  if ((esOwner(mencionado) || esOwner(aBorrar) || (jid && esOwner(jid))) && m.sender !== aBorrar) return m.react("❌");

  deleteUser(aBorrar);
  client.sendText(m.chat, txt.rdSuccess(aBorrar), m);
};

export default plugin;
