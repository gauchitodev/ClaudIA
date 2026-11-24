import { MAX_ADVERTENCIAS } from "../database-functions.js";
import { destinatarioActual, esElBot, esOwnerDe } from "../lib/identidad.js";
import { impedimentoParaModerar } from "../lib/roles.js";
import { darAdvertencia } from "../lib/advertencias.js";
import txt from "../lib/strings.js";

// Moderation warnings, counted per group: on the third one they're kicked from here. Another group's don't count.
const plugin = {};
plugin.cmd = ["advertir", "adv", "warn"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants, isOwner, isWaAdmin }) => {
  const { quien, lid, jid, mencionado, participante } = await destinatarioActual(client, m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  // The reason is whatever is left once the mentions are stripped. The old parsing used a regex with \s that kept
  // swallowing the reason's digits: ".adv @59899111111 3 veces seguidas" ended up warning "598991111113".
  const razon = text.replace(/@\d{3,}/g, "").trim();
  if (!razon) return client.sendText(m.chat, txt.advertirNoRazon, m);

  if (esElBot([lid, jid], client)) return m.react("❌");
  if (esOwnerDe([mencionado, lid, jid])) return m.react("❌");
  // The third warning removes them, so warning follows the same rule as .kick: only from strictly above.
  const impedimento = impedimentoParaModerar(m.chat, { lid: m.sender, esOwner: isOwner, esAdminWhatsApp: isWaAdmin }, { lid: lid || quien, jid, esAdminWhatsApp: Boolean(participante?.admin) }, participants);
  if (impedimento) return client.sendText(m.chat, `No lo puedo advertir: ${impedimento}`, m);
  if (!quien) return client.sendText(m.chat, "No tengo registro de esa persona todavía: que escriba algo en el grupo y probá de nuevo.", m);

  // The count, the record and, on the third, the removal: lib/advertencias.js, which the anti-flood gives them through
  // too. Removal uses the id the group lists the person under.
  const r = await darAdvertencia(client, m.chat, quien, { motivo: razon, dadoPor: m.sender, expulsarA: participante?.id || lid || quien, citado: m });
  // A third warning that came in while another one was still removing them (the anti-flood's, in the middle of a flood).
  if (r.saliendo) return client.sendText(m.chat, `Ya lo estoy sacando: con la advertencia anterior llegó a ${MAX_ADVERTENCIAS}.`, m);
};

export default plugin;
