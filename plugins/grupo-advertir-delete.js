import { advertenciasDe, setAdvertencias, MAX_ADVERTENCIAS } from "../database-functions.js";
import { destinatario } from "../lib/identidad.js";

// Removes one of this group's warnings.
const plugin = {};
plugin.cmd = ["unwarn", "quitaradvertencia"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  const { quien, lid, jid, mencionado } = destinatario(m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  if (lid === client.user.lid || jid === client.user.jid) return m.react("❌");
  if (!quien) return client.sendText(m.chat, "No tengo registro de esa persona todavía.", m);

  const advertencias = advertenciasDe(quien, m.chat);
  if (advertencias === 0) return client.sendText(m.chat, "No tiene advertencias en este grupo.", m);

  setAdvertencias(quien, m.chat, advertencias - 1);
  await client.sendText(m.chat, txt.advertirDeleteSuccess(quien, advertencias - 1, MAX_ADVERTENCIAS), m);
};

export default plugin;
