import { getUser } from "../database-functions.js";
import { lidMencionado } from "../lib/menciones.js";
import { textoFamilia, textoFamilias } from "../lib/familia.js";

// .familia [@x]: el árbol de alguien (o el tuyo). .familias: las familias con apellido, por tamaño.
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
