import { updateUser } from "../database-functions.js";
import { destinatarioActual, esElBot, esOwnerDe } from "../lib/identidad.js";
import txt from "../lib/strings.js";

const plugin = {};
plugin.cmd = ["banuser", "unbanuser"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  // The mention may arrive as a LID or as a number: it's resolved to an id that exists before writing, because an
  // UPDATE against a row that isn't there used to pass as good.
  const { quien, filas, lid, jid, mencionado } = await destinatarioActual(client, m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);
  if (esElBot([lid, jid], client)) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  // leave the bot's owners alone (this used to call getUser without importing it, so the command always blew up)
  if (esOwnerDe([mencionado, lid, jid])) return m.react("❌");
  if (!quien) return client.sendText(m.chat, "No tengo registro de esa persona todavía: que escriba algo y probá de nuevo.", m);

  // On every row of theirs (lib/identidad.js, filasDe): their commands from a group that lists people by number may
  // bring the number alone, and the bot reads the row kept under it.
  const guardados = filas.map((fila) => updateUser(fila, { banned: command === "banuser" }));
  if (!guardados.every(Boolean)) return client.sendText(m.chat, "No pude guardar el cambio.", m);
  m.react("☑️");
};

export default plugin;
