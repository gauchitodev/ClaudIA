import { esOwner } from "../database-functions.js";
import { destinatario, expulsar } from "../lib/identidad.js";
import { setTimeout as esperar } from "node:timers/promises";

const plugin = {};
plugin.cmd = ["k", "kick", "andate", "morite", "chau"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, participants, text, groupMetadata, usedPrefix, command }) => {
  try {
    // Se resuelve la identidad antes de expulsar: el recorte viejo armaba "<dígitos>@lid" con lo que estuviera
    // escrito, y con un teléfono eso es un LID que no existe.
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

    // Se expulsa con el id con el que el grupo lista a la persona, y se mira lo que contesta WhatsApp: mandarle el
    // número a un grupo que trabaja por LID no tira error, devuelve un status que antes nadie leía.
    const { ok, status } = await expulsar(client, m.chat, participante?.id || lid || quien || mencionado);
    if (!ok) return client.sendText(m.chat, `No pude sacarlo (error ${status}).`, m);
  } catch (e) {
    console.log(e);
  }
};

export default plugin;
