import { setTimeout as esperar } from "node:timers/promises";
import { elegirAlAzar } from "../lib/azar.js";

const plugin = {};
plugin.cmd = ["ruletadelban", "ruletaban", "banruleta"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, groupMetadata }) => {
  // Quedan afuera el bot y cualquier admin (incluido el creador del grupo, al que WhatsApp no deja expulsar).
  const psmap = groupMetadata.participants.filter((v) => v.id !== client.user.lid && !v.admin).map((v) => v.id);
  if (psmap.length === 0) return client.sendText(m.chat, `*No se encontraron candidatos para la ruleta o todos son admintradores*`, m);
  const user = elegirAlAzar(psmap);
  client.sendText(m.chat, txt.ruletaDelBan(user), m);
  await esperar(2000);
  await client.groupParticipantsUpdate(m.chat, [user], "remove");
};

export default plugin;
