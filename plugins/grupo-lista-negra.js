import { addToBlacklist, removeFromBlacklist, getBlacklist, isBlacklisted, esOwner } from "../database-functions.js";
import { identidadesDe, buscarEnGrupo, expulsar } from "../lib/identidad.js";

// Per-group blacklist: whoever is on a group's list can't get in there (their request is rejected and, if they get
// in anyway, they're removed). Each group's admins manage it; admins and the bot's owners can't be put on it. The
// owner also manages an all-groups list ("*") from a private chat, which applies everywhere.
const plugin = {};
plugin.cmd = ["ln", "ln2", "vln", "listanegra"];
plugin.onlyAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants, isBotAdmin }) => {
  // In a group we work with that group's list; in a private chat (only the owner gets there) with the all-groups one.
  const ambito = m.isGroup ? m.chat : "*";

  // Show the blacklist: the group's plus the global one (🌐); in private, all of them with the group's name
  if (command === "vln" || command === "listanegra") {
    const entries = getBlacklist(m.isGroup ? m.chat : null).reverse();

    if (entries.length === 0) return client.sendText(m.chat, "No hay usuarios en lista negra.", m);

    const msg = entries
      .map((entry, i) => {
        // Someone who never wrote has no known number and was recorded by LID: no misleading "+" is shown there.
        const num = entry.jid.endsWith("@lid") ? `@${entry.jid.split("@")[0]}` : `+${entry.jid.split("@")[0]}`;

        // format the date
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

    const jids = entries.map((e) => e.lid || e.jid);
    return client.sendMessage(m.chat, { text: msg, mentions: jids }, { quoted: m });
  }

  // work out the target user and the reason for being blacklisted
  let who, reason;
  const phoneMatches = text.match(/\+\d[\d\s-]*/g);
  if (phoneMatches && phoneMatches.length > 0) {
    who = `${phoneMatches[0].replace(/[^\d]/g, "")}@s.whatsapp.net`;
    reason = text.replace(phoneMatches[0], "").trim();
  } else {
    who = m.mentionedJid[0] ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : null;
    reason = who ? text.replace(`@${who.replace("@lid", "")}`, "").trim() : null;
  }

  if (!who) return client.sendText(m.chat, txt.defaultWhoBlackList(usedPrefix, command), m);

  // The person's two identities: the number, which is what gets recorded, and the LID, which is what the group lists
  // them under and what WhatsApp removes them by. Both come from the database and from the group's participants.
  // Someone who never wrote may have no known number: then they're recorded by LID, which is still enough to
  // recognize and remove them.
  const { jid, lid: whoLid, participante } = identidadesDe(who, m.isGroup ? participants : null);
  who = jid || whoLid || who;

  if (who === client.user.jid || (whoLid && whoLid === client.user.lid)) return m.react("❌");
  if (who === m.senderJid || (whoLid && whoLid === m.sender)) return m.react("❌");
  if (command === "ln" && !reason) return client.sendText(m.chat, txt.blistRejectNullReason, m);

  // leave the bot's owners alone
  if (esOwner(who) || (whoLid && esOwner(whoLid))) return m.react("❌");

  // group admins don't go on the blacklist: you'd have to strip their admin first
  if (command === "ln" && m.isGroup && participante?.admin) {
    return client.sendText(m.chat, "No se puede meter a un admin del grupo en la lista negra. Si hace falta, primero sacale el admin.", m);
  }

  const existente = isBlacklisted([who, whoLid], ambito);
  if (command === "ln") {
    if (existente?.chat === "*" && m.isGroup) return client.sendText(m.chat, "Esa persona ya está en la lista negra de todos los grupos (la maneja el dueño del bot).", m);
    if (existente) {
      // already on this scope's list: the reason is updated (and the LID, if it's only known now)
      addToBlacklist(existente.jid, reason, m.senderJid, ambito, whoLid);
      return client.sendText(m.chat, "Ya estaba en la lista negra. Se actualizó el motivo.", m);
    }

    addToBlacklist(who, reason, m.senderJid, ambito, whoLid);
    m.react("✅");

    if (m.isGroup) {
      // group list: they're removed from this group only
      if (!participante) return client.sendText(m.chat, "Anotado. No está en el grupo ahora, así que lo echo apenas entre.", m);
      if (!isBotAdmin) return client.sendText(m.chat, "Anotado, pero no lo puedo echar porque no soy admin. Hacelo a mano y, si me dan admin, del próximo me encargo yo.", m);
      // Removal uses the id the group lists the person under: it's the only one WhatsApp accepts.
      const { ok, status } = await expulsar(client, m.chat, participante.id);
      if (!ok) return client.sendText(m.chat, `Lo anoté en la lista negra, pero WhatsApp no me dejó echarlo (error ${status}). Sacalo a mano.`, m);
      return;
    }

    // all-groups list (owner from a private chat): they're removed from every group they're in
    const groupChats = Object.keys(client.chats).filter((key) => key.endsWith("@g.us"));
    for (const chatId of groupChats) {
      const enGrupo = buscarEnGrupo(client.chats[chatId]?.metadata?.participants, { jid: who, lid: whoLid });
      if (!enGrupo) continue;
      const { ok, status } = await expulsar(client, chatId, enGrupo.id);
      if (!ok) console.error("[lista negra] no se pudo expulsar de", chatId, status);
    }
    return;
  } else if (command === "ln2") {
    if (!existente) return client.sendText(m.chat, "Esa persona no estaba en la lista negra.", m);
    if (existente.chat === "*" && m.isGroup) return client.sendText(m.chat, "Está en la lista negra de todos los grupos: solo la puede sacar el dueño del bot, desde el privado.", m);

    removeFromBlacklist(existente.jid, ambito);
    m.react("☑️");
    return;
  }
};

export default plugin;

const more = String.fromCharCode(8206);
const readMore = more.repeat(4001);
