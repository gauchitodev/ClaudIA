import { getUser } from "../database-functions.js";
import { destinatario } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["id"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  const { quien, lid, jid, mencionado } = destinatario(m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  const whoData = quien ? getUser(quien) : null;
  const whoJid = whoData?.jid || jid || "";
  const whoLid = whoData?.lid || lid || "";

  // Careful: don't name this variable "txt", it shadows the texts global and breaks txt.defaultWho above.
  const info = `Usuario: ${whoJid ? `+${whoJid.split("@")[0]}` : "número desconocido"}\n\nNombre actual: ${whoData?.pushName || "—"}\n\nLid: ${whoLid || "—"}\n\nEn la base: ${whoData ? "sí" : "no, todavía no escribió"}\n\nChat actual: ${m.chat}`;
  client.sendText(m.chat, info, m);
};

export default plugin;
