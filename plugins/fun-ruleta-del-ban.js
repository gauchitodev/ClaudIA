import { setTimeout as esperar } from "node:timers/promises";
import { elegirAlAzar } from "../lib/azar.js";
import { impedimentoParaModerar } from "../lib/roles.js";

const plugin = {};
plugin.cmd = ["ruletadelban", "ruletaban", "banruleta"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, groupMetadata, isOwner, isWaAdmin }) => {
  // The bot and any admin are left out (including the group's creator, whom WhatsApp won't let you remove), and so is
  // anyone whoever spins it couldn't remove by hand: a bot admin's roulette doesn't get to take out another bot admin.
  const quien = { lid: m.sender, esOwner: isOwner, esAdminWhatsApp: isWaAdmin };
  const psmap = groupMetadata.participants.filter((v) => v.id !== client.user.lid && !v.admin && !impedimentoParaModerar(m.chat, quien, { lid: v.id, esAdminWhatsApp: false })).map((v) => v.id);
  if (psmap.length === 0) return client.sendText(m.chat, `*No se encontraron candidatos para la ruleta o todos son admintradores*`, m);
  const user = elegirAlAzar(psmap);
  client.sendText(m.chat, txt.ruletaDelBan(user), m);
  await esperar(2000);
  await client.groupParticipantsUpdate(m.chat, [user], "remove");
};

export default plugin;
