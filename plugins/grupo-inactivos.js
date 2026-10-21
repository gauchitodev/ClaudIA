import { avisarInactivos, INACTIVOS } from "../lib/inactivos.js";

const plugin = {};
plugin.cmd = ["inactivos"];
plugin.onlyMod = true;
plugin.onlyGroup = true;

// .inactivos [días]: tags who hasn't written in that many days (INACTIVOS.DIAS if none) and warns them. It used to tag
// only who had never written, and the newly arrived along with them.
plugin.run = async (m, { client, participants, text }) => {
  const pedido = String(text || "").trim();
  const dias = pedido ? Number(pedido) : INACTIVOS.DIAS;
  if (!Number.isInteger(dias) || dias < 1 || dias > 365) return client.sendText(m.chat, `Decime cuántos días sin escribir: .inactivos 30 (sin número son ${INACTIVOS.DIAS}).`, m);

  const { texto, mentions } = avisarInactivos(m.chat, participants, client, { dias });
  await client.sendMessage(m.chat, { text: texto, mentions }, { quoted: mentions.length ? null : m });
};

export default plugin;
