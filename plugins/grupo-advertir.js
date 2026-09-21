import { esOwner, advertenciasDe, setAdvertencias, MAX_ADVERTENCIAS } from "../database-functions.js";
import { destinatario, expulsar } from "../lib/identidad.js";

// Moderation warnings, counted per group: on the third one they're kicked from here. Another group's don't count.
const plugin = {};
plugin.cmd = ["advertir", "adv", "warn"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  const { quien, lid, jid, mencionado, participante } = destinatario(m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  // The reason is whatever is left once the mentions are stripped. The old parsing used a regex with \s that kept
  // swallowing the reason's digits: ".adv @59899111111 3 veces seguidas" ended up warning "598991111113".
  const razon = text.replace(/@\d{3,}/g, "").trim();
  if (!razon) return client.sendText(m.chat, txt.advertirNoRazon, m);

  if (lid === client.user.lid || jid === client.user.jid) return m.react("❌");
  if (esOwner(mencionado) || (lid && esOwner(lid)) || (jid && esOwner(jid))) return m.react("❌");
  if (!quien) return client.sendText(m.chat, "No tengo registro de esa persona todavía: que escriba algo en el grupo y probá de nuevo.", m);

  const advertencias = advertenciasDe(quien, m.chat) + 1;

  if (advertencias >= MAX_ADVERTENCIAS) {
    await client.sendText(m.chat, txt.advertirKick(quien), m);
    // Removal uses the id the group lists the person under, and the count is cleared only if WhatsApp accepted.
    const { ok, status } = await expulsar(client, m.chat, participante?.id || lid || quien);
    if (ok) return setAdvertencias(quien, m.chat, 0);
    setAdvertencias(quien, m.chat, advertencias);
    return client.sendText(m.chat, `No me dejaron echarlo (error ${status}). Le quedan anotadas las ${advertencias} advertencias.`, m);
  }

  setAdvertencias(quien, m.chat, advertencias);
  await client.sendText(m.chat, txt.advertirSuccess(quien, razon, advertencias, MAX_ADVERTENCIAS), m);
};

export default plugin;
