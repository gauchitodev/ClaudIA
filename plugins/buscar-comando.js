import { textoBuscarComando, bloqueadosEn } from "../lib/menu.js";

// .buscarcomando <palabra>: the five commands most like it, with their menu line, by their name though misspelled or
// by what they do. Only what whoever asks can use there. .menu <palabra> does the same when the word isn't a topic, and
// so does the answer to a command that doesn't exist (handle-message.js). The search is lib/menu.js's.
const plugin = {};
plugin.cmd = ["buscarcomando", "buscarcomandos", "buscacomando"];

plugin.run = async (m, { client, text, usedPrefix, chat, isBotAdmin = true, isMod, isAdmin, isOwner }) => {
  const bloqueados = bloqueadosEn(m.chat, { isGroup: m.isGroup, datosChat: chat });
  const texto = textoBuscarComando(text, { usedPrefix, isGroup: m.isGroup, datosChat: chat, isBotAdmin, isOwner, isAdmin, isMod, bloqueados });
  return client.sendText(m.chat, texto, m);
};

export default plugin;
