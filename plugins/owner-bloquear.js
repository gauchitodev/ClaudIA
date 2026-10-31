import { numeroActual, numeroSinConfirmar } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["bloquear", "desbloquear"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  // Blocking goes by number: WhatsApp takes no LID here, and a LID is exactly what it used to be handed. The number as
  // they have it now (numeroActual).
  const { numero, mencionado, porQue } = await numeroActual(client, m, text, participants);
  if (!mencionado) return;
  if (porQue) return client.sendText(m.chat, numeroSinConfirmar(porQue, `${usedPrefix}${command}`), m);
  if (!numero) return client.sendText(m.chat, "No sé el número de esa persona, así que no la puedo bloquear.", m);

  try {
    await client.updateBlockStatus(numero, command === "bloquear" ? "block" : "unblock");
    m.react("☑️");
  } catch (e) {
    client.sendText(m.chat, `No pude ${command}: ${e?.message || "error"}`, m);
  }
};

export default plugin;
