import { destinatario } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["bloquear", "desbloquear"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text, command, participants }) => {
  // Bloquear es por número: WhatsApp no acepta un LID acá, y antes se le pasaba justamente eso.
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
