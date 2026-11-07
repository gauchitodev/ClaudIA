import { pedirResumen } from "../lib/resumen.js";
import { configuracion } from "../lib/configuracion.js";

const plugin = {};
plugin.cmd = ["resumen", "quemeperdi"];
plugin.onlyGroup = true;

// .resumen [tiempo]: an AI summary of what the group said lately (15 minutes unless they say, 6 hours at most). The
// work is lib/resumen.js's, which keeps the summaries made and the limit, so saving this file doesn't reset them.
plugin.run = async (m, { client, args }) => {
  if (!configuracion.geminiApiKey) return client.sendText(m.chat, "Falta configurar la API key de Gemini en config.toml (geminiApiKey).", m);
  // The "typing..." is a nicety: a failure there used to end the command with the cooldown already set.
  const escribiendo = () => client.sendPresenceUpdate("composing", m.chat).catch(() => {});
  const { texto } = await pedirResumen(m.chat, m.sender, args, { escribiendo });
  await client.sendText(m.chat, texto, m);
};

export default plugin;
