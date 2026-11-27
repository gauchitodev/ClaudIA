import { textoChangas, publicarChanga, anotarMensajeDeChanga, anotarse } from "../lib/changas.js";
import { updateChat } from "../database-functions.js";
import { leerInterruptor } from "../lib/comandos.js";
import txt from "../lib/strings.js";

// The group changas (lib/changas.js). .changa / .changas: the open one and how they work · .changas on|off (admins):
// Claudia's own, posted now and then · .changa 3 50 Mudanza de la abuela: post one, paid from the pocket ·
// .anotarme: join the open one (reacting to its message does the same).
// The switch isn't one more of config-on-off.js: with no word, those flip, and .changas alone is a question.
const plugin = {};
plugin.cmd = ["changa", "changas", "anotarme"];
plugin.economia = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, command, args = [], isAdmin, isOwner }) => {
  if (command.toLowerCase() === "anotarme") {
    const r = anotarse(m.chat, m.sender);
    return client.sendText(m.chat, r.ok ? r.texto : `❌ ${r.error}`, m, r.mentions?.length ? { mentions: r.mentions } : {});
  }

  if (args.length === 0) {
    const estado = textoChangas(m.chat);
    return client.sendText(m.chat, estado.texto, m, estado.mentions.length ? { mentions: estado.mentions } : {});
  }

  const prender = args.length === 1 ? leerInterruptor(args[0]) : null;
  if (prender !== null) {
    if (!isAdmin && !isOwner) return client.sendText(m.chat, txt.onlyAdmin, m);
    updateChat(m.chat, { changas: prender });
    return client.sendText(m.chat, prender ? "🧰 Listo: cada tanto voy a publicar una changa para armar equipo (un par por día como mucho, de día, y solo si el grupo está charlando). .changas off las apaga." : "🧰 Listo, no publico más changas por mi cuenta. Las de ustedes (.changa 3 50 <qué>) siguen andando.", m);
  }

  const r = publicarChanga(m.chat, m.sender, args);
  if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
  const enviado = await client.sendText(m.chat, r.texto, m, { mentions: r.mentions });
  anotarMensajeDeChanga(r.id, enviado?.key?.id);
};

export default plugin;
