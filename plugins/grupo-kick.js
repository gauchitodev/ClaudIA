import { esOwner } from "../database-functions.js";
import { destinatario, expulsar } from "../lib/identidad.js";
import { setTimeout as esperar } from "node:timers/promises";

const plugin = {};
plugin.cmd = ["k", "kick", "rifle", "andate", "morite", "chau"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, participants, text, groupMetadata, usedPrefix, command }) => {
  try {
    // The identity is resolved before removing: the old parsing built "<digits>@lid" from whatever was typed, and
    // with a phone number that is a LID which doesn't exist.
    const { quien, lid, jid, mencionado, participante } = destinatario(m, text, participants);
    if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

    if (lid === client.user.lid || jid === client.user.jid) return client.sendText(m.chat, `No me quiero ir 😔😭`, m);
    if (esOwner(mencionado) || (lid && esOwner(lid)) || (jid && esOwner(jid))) return client.sendText(m.chat, `A los dueños del bot no los saco.`, m);

    const groupAdmins = participants.filter((p) => p.admin);
    const owner = groupMetadata.owner || groupAdmins.find((p) => p.admin === "superadmin")?.id || `${m.chat.split("-")[0]}@lid`;
    if (owner === lid || owner === jid || owner === mencionado) {
      m.react("❌");
      return client.sendText(m.chat, txt.kickOwner(owner), m);
    }

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
