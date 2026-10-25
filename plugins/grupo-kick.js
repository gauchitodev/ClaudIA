import { destinatarioActual, expulsar, esElBot, esOwnerDe } from "../lib/identidad.js";
import { impedimentoParaModerar } from "../lib/roles.js";
import { sacarInactivos } from "../lib/inactivos.js";
import { setTimeout as esperar } from "node:timers/promises";

const plugin = {};
plugin.cmd = ["k", "kick", "rifle", "andate", "morite", "chau"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, participants, text, groupMetadata, usedPrefix, command, isOwner, isWaAdmin, isAdmin }) => {
  try {
    // .k inactivos [confirmar]: the warned who stayed quiet (lib/inactivos.js). Removing in bulk is for admins only.
    const inactivos = String(text || "").trim().match(/^inactivos(?:\s+(confirmar|si|sí))?$/i);
    if (inactivos) {
      if (!isAdmin) return client.sendText(m.chat, "Sacar inactivos en bloque es solo para admins.", m);
      // Awaited inside the try: a failure (the connection dropping halfway through) used to get past this plugin's catch.
      return await sacarInactivos(client, m, participants, { confirmar: Boolean(inactivos[1]) });
    }

    // The identity is resolved before removing: the old parsing built "<digits>@lid" from whatever was typed, and
    // with a phone number that is a LID which doesn't exist.
    const { quien, lid, jid, mencionado, participante } = await destinatarioActual(client, m, text, participants);
    if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

    if (esElBot([lid, jid], client)) return client.sendText(m.chat, `No me quiero ir 😔😭`, m);
    if (esOwnerDe([mencionado, lid, jid])) return client.sendText(m.chat, `A los dueños del bot no los saco.`, m);

    const groupAdmins = participants.filter((p) => p.admin);
    const owner = groupMetadata.owner || groupAdmins.find((p) => p.admin === "superadmin")?.id || `${m.chat.split("-")[0]}@lid`;
    if (owner === lid || owner === jid || owner === mencionado) {
      m.react("❌");
      return client.sendText(m.chat, txt.kickOwner(owner), m);
    }

    // Only from strictly above: a moderator can't remove an admin, nor another moderator. Checked before deleting
    // anything, so a refused kick leaves the messages where they were.
    const impedimento = impedimentoParaModerar(m.chat, { lid: m.sender, esOwner: isOwner, esAdminWhatsApp: isWaAdmin }, { lid: lid || quien, jid, esAdminWhatsApp: Boolean(participante?.admin) });
    if (impedimento) return client.sendText(m.chat, `No lo puedo sacar: ${impedimento}`, m);

    await m.quoted?.delete();
    await esperar(300);
    await m.delete();
    await esperar(1000);

    // Removal uses the id the group lists the person under, and WhatsApp's answer is checked: handing the number to
    // a LID-addressed group throws no error, it returns a status nobody used to read.
    const { ok, status } = await expulsar(client, m.chat, participante?.id || lid || quien || mencionado);
    if (!ok) return client.sendText(m.chat, `No pude sacarlo (error ${status}).`, m);
  } catch (e) {
    console.log(e);
  }
};

export default plugin;
