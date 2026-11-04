import { getUser } from "../database-functions.js";
import { textoFamilia, textoFamilias } from "../lib/familia.js";
import { lidMencionadoActual, estaEnGrupo } from "../lib/identidad.js";
import { modoDeNombre, nombrandoPor } from "../lib/menciones.js";

// .familia [@x]: someone's tree (or yours). .familias: the group's families, each as a tree, largest first. Both with
// "nombres" or "numeros" at the end, everyone by their WhatsApp name or by their number (lib/menciones.js).
const plugin = {};
plugin.cmd = ["familia", "mifamilia", "familias"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, command, participants }) => {
  const { modo, texto } = modoDeNombre(text);
  if (command === "familias") return client.sendText(m.chat, nombrandoPor(modo, () => textoFamilias(estaEnGrupo(participants))), m);
  const who = (await lidMencionadoActual(client, m, texto, participants)) || m.sender;
  if (!getUser(who)) return client.sendText(m.chat, "No conozco a esa persona todavía.", m);
  await client.sendText(m.chat, nombrandoPor(modo, () => textoFamilia(who, who === m.sender)), m);
};

export default plugin;
