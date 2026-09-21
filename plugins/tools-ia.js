import { preguntarGemini } from "../lib/gemini.js";

const plugin = {
  // The bot's number is one of the commands: since "@" is a prefix, mentioning her with "@<number> something" talks
  // to the AI. It's resolved when cmd is read and not when the plugin is imported, because plugins load before the
  // socket exists and client isn't there yet. If it somehow gets read offline, the usual aliases remain.
  get cmd() {
    const botLid = globalThis.client?.user?.lid?.split("@")[0];
    return botLid ? [botLid, "gemini", "ia", "bot"] : ["gemini", "ia", "bot"];
  },
};
plugin.botAdmin = true;

plugin.run = async (m, { client, text }) => {
  if (!text) return client.sendText(m.chat, txt.iaPeticion, m);

  if (!globalThis.geminiApiKey) {
    return client.sendText(m.chat, "Falta configurar la API key de Gemini en config.toml (geminiApiKey).", m);
  }

  await client.sendPresenceUpdate("composing", m.chat);

  const respuesta = await preguntarGemini(text);
  if (respuesta.ok) {
    return client.sendText(m.chat, respuesta.texto, m);
  } else if (respuesta.sinCuota) {
    return client.sendText(m.chat, "Se me acabó la cuota gratis de la IA por hoy, probá de nuevo mañana.", m);
  } else {
    return client.sendText(m.chat, "Ta, se me complicó pensar ahora, probá de nuevo en un rato bo.", m);
  }
};

export default plugin;
