import { destinatario, cambiarParticipante } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["p", "promote"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  const { objetivo, mencionado, participante } = destinatario(m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  // Con el id con el que el grupo lista a la persona, y mirando lo que contesta WhatsApp.
  const { ok, status } = await cambiarParticipante(client, m.chat, participante?.id || objetivo, "promote");
  if (!ok) return client.sendText(m.chat, `No pude darle admin (error ${status}).`, m);
};

export default plugin;
