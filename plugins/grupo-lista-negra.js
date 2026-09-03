import { addToBlacklist, removeFromBlacklist, getBlacklist, isBlacklisted, getUser, esOwner } from "../database-functions.js";

// Lista negra de personas, por grupo: quien está en la de un grupo no puede entrar ahí (se rechaza su solicitud y, si
// entra igual, se la expulsa). La manejan los admins de cada grupo; a los admins y a los dueños del bot no se los puede
// meter. El owner, desde el privado, maneja además una lista de todos los grupos ("*"), que vale en cualquiera.
let plugin = {};
plugin.cmd = ["ln", "ln2", "vln", "listanegra"];
plugin.onlyAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  // En un grupo se trabaja con la lista de ese grupo; en el privado (solo llega el owner) con la de todos los grupos.
  const ambito = m.isGroup ? m.chat : "*";

  // Mostrar la lista negra: la del grupo más la global (🌐); en privado, todas con el nombre del grupo
  if (command === "vln" || command === "listanegra") {
    const entries = getBlacklist(m.isGroup ? m.chat : null).reverse();

    if (entries.length === 0) return client.sendText(m.chat, "No hay usuarios en lista negra.", m);

    let msg = entries
      .map((entry, i) => {
        const num = `+${entry.jid.split("@")[0]}`;

        // formatear la fecha
        let fechaTexto = "Desconocida";
        if (entry.dateAdded) {
          const d = new Date(entry.dateAdded);
          fechaTexto = d
            .toLocaleString("es-ES", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
            .replace(",", " -");
        }

        const razon = entry.reason || "Sin razón";
        const añadidoPor = entry.addedBy ? `+${entry.addedBy.split("@")[0]}` : "Desconocido";

        const alcance = entry.chat === "*" ? " 🌐 todos los grupos" : m.isGroup ? "" : ` · ${client.chats[entry.chat]?.subject || entry.chat}`;
        return `${i === 2 && entries.length > 2 ? readMore : ""}${entries.length - i}. ${num}${alcance}\n📝 Razón: ${razon}\n👤 Añadido por: ${añadidoPor}\n📆 Fecha: ${fechaTexto}\n`;
      })
      .join("\n");

    const jids = entries.map((e) => e.jid);
    return client.sendMessage(m.chat, { text: msg, mentions: jids }, { quoted: m });
  }

  // obtener usuario destinatario y la razón de estar en blacklist
  let who, reason;
  let whoLid = null;
  const phoneMatches = text.match(/\+\d[\d\s-]*/g);
  if (phoneMatches && phoneMatches.length > 0) {
    who = phoneMatches[0].replace(/[^\d]/g, "") + "@s.whatsapp.net";
    reason = text.replace(phoneMatches[0], "").trim();
  } else {
    who = m.mentionedJid[0] ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : null;
    reason = who ? text.replace(`@${who.replace("@lid", "")}`, "").trim() : null;
  }

  // si who es LID, obtener su JID desde la db (y guardar el LID para compararlo con los participantes del grupo).
  if (who && who.endsWith("@lid")) {
    whoLid = who;
    who = getUser(who)?.jid;
  } else if (who) {
    whoLid = getUser(who)?.lid || null;
  }

  // si no hay jid valido, retornar
  if (!who) return client.sendText(m.chat, txt.defaultWhoBlackList(usedPrefix, command), m);
  if (who === client.user.jid) return m.react("❌");
  if (who === m.senderJid) return m.react("❌");
  if (command == "ln" && !reason) return client.sendText(m.chat, txt.blistRejectNullReason, m);

  // no afectar a los dueños del bot
  if (esOwner(who) || (whoLid && esOwner(whoLid))) return m.react("❌");

  // los admins del grupo no van a la lista negra: primero habría que sacarles el admin
  if (command === "ln" && m.isGroup) {
    const esAdminDelGrupo = participants.some((p) => p.admin && (p.id === whoLid || p.id === who || p.phoneNumber === who));
    if (esAdminDelGrupo) return client.sendText(m.chat, "No se puede meter a un admin del grupo en la lista negra. Si hace falta, primero sacale el admin.", m);
  }

  const existente = isBlacklisted(who, ambito);
  if (command === "ln") {
    if (existente?.chat === "*" && m.isGroup) return client.sendText(m.chat, "Esa persona ya está en la lista negra de todos los grupos (la maneja el dueño del bot).", m);
    if (existente) {
      // ya estaba en la lista de este ámbito: solo se actualiza el motivo
      addToBlacklist(who, reason, m.senderJid, ambito);
      return client.sendText(m.chat, "Ya estaba en la lista negra. Se actualizó el motivo.", m);
    }

    addToBlacklist(who, reason, m.senderJid, ambito);
    m.react("✅");

    if (m.isGroup) {
      // lista del grupo: se expulsa solo de este grupo
      const isInGroup = participants.some((p) => p.phoneNumber === who || p.id === whoLid);
      if (isInGroup) await client.groupParticipantsUpdate(m.chat, [whoLid || who], "remove");
      return;
    }

    // lista de todos los grupos (owner desde el privado): se expulsa de cada grupo donde esté
    const groupChats = Object.keys(client.chats).filter((key) => key.endsWith("@g.us"));
    for (const chatId of groupChats) {
      const groupParticipants = client.chats[chatId]?.metadata?.participants;
      if (!groupParticipants) continue;
      const isInGroup = groupParticipants.some((p) => p.phoneNumber === who || p.id === whoLid);
      if (isInGroup) await client.groupParticipantsUpdate(chatId, [whoLid || who], "remove").catch((e) => console.error("[lista negra] no se pudo expulsar de", chatId, e.message));
    }
    return;
  } else if (command === "ln2") {
    if (!existente) return client.sendText(m.chat, "Esa persona no estaba en la lista negra.", m);
    if (existente.chat === "*" && m.isGroup) return client.sendText(m.chat, "Está en la lista negra de todos los grupos: solo la puede sacar el dueño del bot, desde el privado.", m);

    removeFromBlacklist(who, ambito);
    m.react("☑️");
    return;
  }
};

export default plugin;

const more = String.fromCharCode(8206);
const readMore = more.repeat(4001);
