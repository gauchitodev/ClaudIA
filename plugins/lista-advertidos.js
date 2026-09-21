import { advertidos, MAX_ADVERTENCIAS } from "../database-functions.js";
import { nombreDe } from "../lib/menciones.js";

const plugin = {};
plugin.cmd = ["listaadv", "listaadvertidos", "advertidos"];
plugin.onlyOwner = true;

plugin.run = async (m, { client }) => {
  // En un grupo, las advertencias de ese grupo; desde el privado, las de todos, con el nombre del grupo.
  const lista = advertidos(m.isGroup ? m.chat : null);
  if (!lista.length) return client.sendText(m.chat, "⚠️ No hay nadie con advertencias.", m);

  // Se los nombra sin etiquetarlos: una lista de advertidos no tiene por qué notificar a cada uno.
  const lineas = lista.map((u) => `│ ${nombreDe(u.lid)} *(${u.warn}/${MAX_ADVERTENCIAS})*${m.isGroup ? "" : ` · ${client.chats?.[u.chat]?.subject || u.chat}`}`);

  await client.sendText(m.chat, `⚠️ \`USUARIOS ADVERTIDOS\` ⚠️\n\n│ *Total : ${lista.length}*\n│ - - - - - - - - -\n${lineas.join("\n")}`, m);
};

export default plugin;
