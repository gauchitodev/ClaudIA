import { setTimeout as esperar } from "node:timers/promises";
import { elegirAlAzar } from "../lib/azar.js";
import { impedimentoParaModerar } from "../lib/roles.js";
import { expulsar } from "../lib/identidad.js";

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
  // Announcement first, then the suspense, then the kick. Not awaiting the announcement let it wait its turn in the
  // queue (lib/envios.js) while the 2 seconds ran, and the kick could land before anyone saw who was chosen.
  await client.sendText(m.chat, txt.ruletaDelBan(user), m);
  await esperar(2000);
  // WhatsApp answers with a status instead of failing: it's read, as .kick does (lib/identidad.js).
  const { ok, status } = await expulsar(client, m.chat, user);
  if (!ok) await client.sendText(m.chat, `La ruleta eligió, pero WhatsApp no me dejó sacarlo (error ${status}).`, m);
};

export default plugin;
