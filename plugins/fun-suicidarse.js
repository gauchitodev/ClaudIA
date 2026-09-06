import { setTimeout as esperar } from "node:timers/promises";

const plugin = {};
// Ojo: antes también respondía a ".salir", y cualquiera que lo escribiera (por ejemplo para salir de un juego) se autoexpulsaba.
plugin.cmd = ["suicidarse", "matarse", "suicidio", "suicidarme", "matarme"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, isOwner }) => {
  if (isOwner) return;
  await client.sendMessage(m.chat, { text: `*@${m.sender.split("@")[0]} ACABA DE EJECUTAR SU ELIMINACIÓN😐*`, mentions: [m.sender] }, { quoted: m });
  await esperar(1500);
  client.groupParticipantsUpdate(m.chat, [m.sender], "remove");
};

export default plugin;
