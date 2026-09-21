import { getUser } from "../database-functions.js";
import { lidMencionado } from "../lib/menciones.js";
import { textoFamilia, textoFamilias } from "../lib/familia.js";

// .familia [@x]: someone's tree (or yours). .familias: the families that have a surname, by size.
const plugin = {};
plugin.cmd = ["familia", "mifamilia", "familias"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, command }) => {
  if (command === "familias") return client.sendText(m.chat, textoFamilias(), m);
  const who = lidMencionado(m, text) || m.sender;
  if (!getUser(who)) return client.sendText(m.chat, "No conozco a esa persona todavía.", m);
  await client.sendText(m.chat, textoFamilia(who, who === m.sender), m);
};

export default plugin;
