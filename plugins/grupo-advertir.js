import { esOwner, advertenciasDe, setAdvertencias, MAX_ADVERTENCIAS } from "../database-functions.js";
import { destinatario, expulsar } from "../lib/identidad.js";

// Advertencias de moderación, contadas por grupo: a la tercera se lo echa de acá. Las de otro grupo no cuentan.
const plugin = {};
plugin.cmd = ["advertir", "adv", "warn"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  const { quien, lid, jid, mencionado, participante } = destinatario(m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  // La razón es lo que queda al sacar las menciones. El recorte viejo usaba un regex con \s que seguía comiéndose los
  // dígitos de la razón: ".adv @59899111111 3 veces seguidas" terminaba advirtiendo a "598991111113".
  const razon = text.replace(/@\d{3,}/g, "").trim();
  if (!razon) return client.sendText(m.chat, txt.advertirNoRazon, m);

  if (lid === client.user.lid || jid === client.user.jid) return m.react("❌");
  if (esOwner(mencionado) || (lid && esOwner(lid)) || (jid && esOwner(jid))) return m.react("❌");
  if (!quien) return client.sendText(m.chat, "No tengo registro de esa persona todavía: que escriba algo en el grupo y probá de nuevo.", m);

  const advertencias = advertenciasDe(quien, m.chat) + 1;

  if (advertencias >= MAX_ADVERTENCIAS) {
    await client.sendText(m.chat, txt.advertirKick(quien), m);
    // Se expulsa con el id con el que el grupo lista a la persona, y la cuenta se borra solo si WhatsApp aceptó.
    const { ok, status } = await expulsar(client, m.chat, participante?.id || lid || quien);
    if (ok) return setAdvertencias(quien, m.chat, 0);
    setAdvertencias(quien, m.chat, advertencias);
    return client.sendText(m.chat, `No me dejaron echarlo (error ${status}). Le quedan anotadas las ${advertencias} advertencias.`, m);
  }

  setAdvertencias(quien, m.chat, advertencias);
  await client.sendText(m.chat, txt.advertirSuccess(quien, razon, advertencias, MAX_ADVERTENCIAS), m);
};

export default plugin;
