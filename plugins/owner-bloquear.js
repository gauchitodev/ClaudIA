import { destinatario } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["bloquear", "desbloquear"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text, command, participants }) => {
  // Blocking goes by number: WhatsApp takes no LID here, and a LID is exactly what it used to be handed.
  const { jid, mencionado } = destinatario(m, text, participants);
  if (!mencionado) return;
  if (!jid) return client.sendText(m.chat, "No sé el número de esa persona, así que no la puedo bloquear.", m);

  try {
    await client.updateBlockStatus(jid, command === "bloquear" ? "block" : "unblock");
    m.react("☑️");
  } catch (e) {
    client.sendText(m.chat, `No pude ${command}: ${e?.message || "error"}`, m);
  }
};

export default plugin;
