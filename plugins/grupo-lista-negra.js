import { addToBlacklist, removeFromBlacklist, getBlacklist, isBlacklisted, esOwner } from "../database-functions.js";
import { identidadesDe, buscarEnGrupo, expulsar } from "../lib/lista-negra.js";

// Lista negra de personas, por grupo: quien está en la de un grupo no puede entrar ahí (se rechaza su solicitud y, si
// entra igual, se la expulsa). La manejan los admins de cada grupo; a los admins y a los dueños del bot no se los puede
// meter. El owner, desde el privado, maneja además una lista de todos los grupos ("*"), que vale en cualquiera.
const plugin = {};
plugin.cmd = ["ln", "ln2", "vln", "listanegra"];
plugin.onlyAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants, isBotAdmin }) => {
  // En un grupo se trabaja con la lista de ese grupo; en el privado (solo llega el owner) con la de todos los grupos.
  const ambito = m.isGroup ? m.chat : "*";

  // Mostrar la lista negra: la del grupo más la global (🌐); en privado, todas con el nombre del grupo
  if (command === "vln" || command === "listanegra") {
    const entries = getBlacklist(m.isGroup ? m.chat : null).reverse();

    if (entries.length === 0) return client.sendText(m.chat, "No hay usuarios en lista negra.", m);

    const msg = entries
      .map((entry, i) => {
        // A quien nunca escribió no se le conoce el número y quedó anotado por LID: ahí no se muestra un "+" que engañe.
        const num = entry.jid.endsWith("@lid") ? `@${entry.jid.split("@")[0]}` : `+${entry.jid.split("@")[0]}`;

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

    const jids = entries.map((e) => e.lid || e.jid);
    return client.sendMessage(m.chat, { text: msg, mentions: jids }, { quoted: m });
  }

  // obtener usuario destinatario y la razón de estar en blacklist
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

  // Las dos identidades de la persona: el número, que es lo que se anota, y el LID, que es con lo que el grupo la
  // lista y WhatsApp la expulsa. Se sacan de la base y de los participantes del grupo. A quien nunca escribió puede
  // no conocérsele el número: entonces se lo anota por LID, que igual alcanza para reconocerlo y echarlo.
  const { jid, lid: whoLid, participante } = identidadesDe(who, m.isGroup ? participants : null);
  who = jid || whoLid || who;

  if (who === client.user.jid || (whoLid && whoLid === client.user.lid)) return m.react("❌");
  if (who === m.senderJid || (whoLid && whoLid === m.sender)) return m.react("❌");
  if (command === "ln" && !reason) return client.sendText(m.chat, txt.blistRejectNullReason, m);

  // no afectar a los dueños del bot
  if (esOwner(who) || (whoLid && esOwner(whoLid))) return m.react("❌");

  // los admins del grupo no van a la lista negra: primero habría que sacarles el admin
  if (command === "ln" && m.isGroup && participante?.admin) {
    return client.sendText(m.chat, "No se puede meter a un admin del grupo en la lista negra. Si hace falta, primero sacale el admin.", m);
  }

  const existente = isBlacklisted([who, whoLid], ambito);
  if (command === "ln") {
    if (existente?.chat === "*" && m.isGroup) return client.sendText(m.chat, "Esa persona ya está en la lista negra de todos los grupos (la maneja el dueño del bot).", m);
    if (existente) {
      // ya estaba en la lista de este ámbito: se actualiza el motivo (y el LID, si recién ahora se conoce)
      addToBlacklist(existente.jid, reason, m.senderJid, ambito, whoLid);
      return client.sendText(m.chat, "Ya estaba en la lista negra. Se actualizó el motivo.", m);
    }

    addToBlacklist(who, reason, m.senderJid, ambito, whoLid);
    m.react("✅");

    if (m.isGroup) {
      // lista del grupo: se expulsa solo de este grupo
      if (!participante) return client.sendText(m.chat, "Anotado. No está en el grupo ahora, así que lo echo apenas entre.", m);
      if (!isBotAdmin) return client.sendText(m.chat, "Anotado, pero no lo puedo echar porque no soy admin. Hacelo a mano y, si me dan admin, del próximo me encargo yo.", m);
      // Se expulsa con el id con el que el grupo lista a la persona: es el único que WhatsApp acepta.
      const { ok, status } = await expulsar(client, m.chat, participante.id);
      if (!ok) return client.sendText(m.chat, `Lo anoté en la lista negra, pero WhatsApp no me dejó echarlo (error ${status}). Sacalo a mano.`, m);
      return;
    }

    // lista de todos los grupos (owner desde el privado): se expulsa de cada grupo donde esté
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
