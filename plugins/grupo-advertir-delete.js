import { getUser, advertenciasDe, setAdvertencias, MAX_ADVERTENCIAS } from "../database-functions.js";
import { lidMencionado } from "../lib/menciones.js";
import { identidadesDe } from "../lib/identidad.js";

// Saca una advertencia de las de este grupo.
const plugin = {};
plugin.cmd = ["unwarn", "quitaradvertencia"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  const mencionado = lidMencionado(m, text);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  // Igual que en .adv: la mención puede venir como LID o como número, y se escribe con el id que tenga fila.
  const digitos = String(mencionado).split("@")[0];
  const { lid, jid } = identidadesDe(getUser(mencionado) ? [mencionado] : [mencionado, `${digitos}@s.whatsapp.net`], participants);
  const quien = [lid, jid, mencionado].find((id) => id && getUser(id));

  if (lid === client.user.lid || jid === client.user.jid) return m.react("❌");
  if (!quien) return client.sendText(m.chat, "No tengo registro de esa persona todavía.", m);

  const advertencias = advertenciasDe(quien, m.chat);
  if (advertencias === 0) return client.sendText(m.chat, "No tiene advertencias en este grupo.", m);

  setAdvertencias(quien, m.chat, advertencias - 1);
  await client.sendText(m.chat, txt.advertirDeleteSuccess(quien, advertencias - 1, MAX_ADVERTENCIAS), m);
};

export default plugin;
