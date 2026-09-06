import { setTimeout as esperar } from "node:timers/promises";

const plugin = {};
plugin.cmd = ["ap", "aprobar", "pendientes"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, command }) => {
  const groupId = m.chat;
  try {
    if (command === "pendientes") {
      const participants = await client.groupRequestParticipantsList(groupId);
      if (!participants.length) {
        await client.sendText(m.chat, "No hay participantes pendientes de aprobación.", m);
        return;
      }
      let message = "Lista de participantes pendientes de aprobación:\n\n";
      participants.forEach((participant, index) => {
        const phoneNumber = participant.jid.split("@")[0];
        message += `${index + 1}. JID: @${phoneNumber}\n* Se unió a través de: ${participant.request_method}\n\n`;
      });
      await client.sendText(m.chat, message, m);
    } else if (command === "ap" || command === "aprobar") {
      const participants = await client.groupRequestParticipantsList(groupId);
      if (!participants.length) {
        await client.sendText(m.chat, "No hay participantes pendientes de aprobación.", m);
        return;
      }
      const jids = participants.map((p) => p.jid);
      await client.groupRequestParticipantsUpdate(groupId, jids, "approve");
      await esperar(2000);
      m.react("✅");
    }
  } catch (error) {
    console.log(error);
    await client.sendText(m.chat, "Hubo un error al procesar el comando.", m);
  }
};

export default plugin;
