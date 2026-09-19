import { preguntarGemini } from "../lib/gemini.js";

const plugin = {
  // El número del bot es uno de los comandos: como "@" es prefijo, mencionarla con "@<número> algo" le habla a la IA.
  // Se resuelve al leer cmd y no al importar el plugin, porque los plugins se cargan antes de que exista el socket
  // y ahí client todavía no está. Si por algo se lee sin conexión, quedan los alias de siempre.
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
