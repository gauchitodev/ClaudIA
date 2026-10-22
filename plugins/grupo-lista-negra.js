import { addToBlacklist, removeFromBlacklist, getBlacklist, isBlacklisted, esOwner } from "../database-functions.js";
import { impedimentoParaModerar } from "../lib/roles.js";
import { identidadesDe, buscarEnGrupo, expulsar } from "../lib/identidad.js";
import { guardarVarios } from "../lib/cache-grupos.js";
import { nombreDe, conNombres } from "../lib/menciones.js";

// Per-group blacklist: whoever is on a group's list can't get in there (their request is rejected and, if they get
// in anyway, they're removed). Each group's admins manage it; admins and the bot's owners can't be put on it. The
// owner also manages an all-groups list ("*") from a private chat, which applies everywhere.
const plugin = {};
plugin.cmd = ["ln", "ln2", "vln", "listanegra"];
plugin.onlyAdmin = true;

// The last list .vln showed in each group, number → entry, so ".ln2 <number>" takes off the one that was on screen even
// after another came off (the numbers move up). In memory, for a while.
if (!globalThis.listaNegraMostrada) globalThis.listaNegraMostrada = new Map();
const MOSTRADA_MS = 30 * 60 * 1000;

plugin.run = async (m, { client, text, usedPrefix, command, participants, isBotAdmin, isOwner, isWaAdmin }) => {
  // In a group we work with that group's list; in a private chat (only the owner gets there) with the all-groups one.
  const ambito = m.isGroup ? m.chat : "*";

  // Show the blacklist: the group's plus the global one (🌐); in private, all of them with the group's name
  if (command === "vln" || command === "listanegra") {
    const entries = getBlacklist(m.isGroup ? m.chat : null).reverse();

    if (entries.length === 0) return client.sendText(m.chat, "No hay usuarios en lista negra.", m);

    // In a group the whole group reads the list: each one by name, without tagging them, and without their number or
    // the number of the admin who listed them (an admin takes one off with .ln2 and its number in the list). In the
    // owner's private chat, the numbers.
    const msg = entries
      .map((entry, i) => {
        // Someone who never wrote has no known number and was recorded by LID: no misleading "+" is shown there.
        const num = m.isGroup ? nombreDe(entry.lid || entry.jid) : entry.jid.endsWith("@lid") ? `@${entry.jid.split("@")[0]}` : `+${entry.jid.split("@")[0]}`;

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
        const añadidoPor = !entry.addedBy ? "Desconocido" : m.isGroup ? nombreDe(entry.addedBy) : `+${entry.addedBy.split("@")[0]}`;

        const alcance = entry.chat === "*" ? " 🌐 todos los grupos" : m.isGroup ? "" : ` · ${client.chats[entry.chat]?.subject || entry.chat}`;
        return `${i === 2 && entries.length > 2 ? readMore : ""}${entries.length - i}. ${num}${alcance}\n📝 Razón: ${razon}\n👤 Añadido por: ${añadidoPor}\n📆 Fecha: ${fechaTexto}\n`;
      })
      .join("\n");

    if (m.isGroup) {
      globalThis.listaNegraMostrada.set(m.chat, { fecha: Date.now(), porNumero: new Map(entries.map((e, i) => [entries.length - i, { jid: e.jid, chat: e.chat }])) });
      return client.sendMessage(m.chat, { text: `${msg}\nPara sacar a alguien: ${usedPrefix}ln2 <su número en esta lista>` }, { quoted: m });
    }
    const jids = entries.map((e) => e.lid || e.jid);
    return client.sendMessage(m.chat, { text: msg, mentions: jids }, { quoted: m });
  }

  // ".ln2 3" in a group takes off the third one on .vln's list, which there shows no numbers: someone on it is out of
  // the group by then, and can't be mentioned either.
  const deLaLista = command === "ln2" && m.isGroup ? (text || "").trim().match(/^#?(\d{1,3})$/) : null;
  if (deLaLista) {
    const numero = Number(deLaLista[1]);
    const entradas = getBlacklist(m.chat);
    // The one with that number in the last .vln, and only a recent one: the numbers move up when someone comes off the
    // list, and going by the list as it stood then took off someone other than the one on the screen.
    const mostrada = globalThis.listaNegraMostrada.get(m.chat);
    const vigente = mostrada && Date.now() - mostrada.fecha < MOSTRADA_MS ? mostrada : null;
    if (!vigente) return client.sendText(m.chat, `Mirá la lista negra con ${usedPrefix}vln y después usá ${usedPrefix}ln2 con el número que aparece ahí: los números cambian cuando alguien sale de la lista.`, m);
    const vista = vigente.porNumero.get(numero);
    const entrada = vista && entradas.find((e) => e.jid === vista.jid && e.chat === vista.chat);
    if (!entrada) return client.sendText(m.chat, `No hay ningún ${numero} en la lista negra de este grupo${vista ? ": ya lo sacaron" : ""}. Mirala con ${usedPrefix}vln.`, m);
    if (entrada.chat === "*") return client.sendText(m.chat, "Está en la lista negra de todos los grupos: solo la puede sacar el dueño del bot, desde el privado.", m);
    removeFromBlacklist(entrada.jid, m.chat);
    // By name, so whoever asked sees it was the right one.
    return client.sendText(m.chat, `☑️ Saqué de la lista negra a ${nombreDe(entrada.lid || entrada.jid)}.`, m);
  }

  // work out the target user and the reason for being blacklisted
  let who, reason;
  const phoneMatches = text.match(/\+\d[\d\s-]*/g);
  if (phoneMatches && phoneMatches.length > 0) {
    who = `${phoneMatches[0].replace(/[^\d]/g, "")}@s.whatsapp.net`;
    reason = text.replace(phoneMatches[0], "").trim();
  } else {
    who = m.mentionedJid[0] ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : null;
    // Without the mention of who goes on the list, by its digits (it comes as a LID or, in a group listed by number, as
    // the number), and with any other one as a name: the whole group reads the reason (.vln), and the number was left
    // in it.
    reason = who ? conNombres(text.replace(`@${who.split("@")[0]}`, ""), m.mentionedJid).trim() : null;
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
  // The same rule for the bot's own roles: a bot admin can't blacklist another bot admin. See lib/roles.js.
  if (command === "ln" && m.isGroup) {
    const impedimento = impedimentoParaModerar(m.chat, { lid: m.sender, esOwner: isOwner, esAdminWhatsApp: isWaAdmin }, { lid: whoLid, jid, esAdminWhatsApp: Boolean(participante?.admin) });
    if (impedimento) return client.sendText(m.chat, `No lo puedo anotar: ${impedimento}`, m);
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

    // All-groups list (owner from a private chat): they're removed from every group they're in. The groups are asked
    // of WhatsApp in one query instead of read from memory: the copy there can lack a group (a change invalidates it
    // until someone writes there) or someone who joined after it was taken, and those were skipped without a word.
    const pedida = Date.now();
    const grupos = await client.groupFetchAllParticipating().catch(() => null);
    if (!grupos) return client.sendText(m.chat, "Anotado en la lista negra de todos los grupos, pero WhatsApp no me pasó la lista de grupos, así que no lo saqué de ninguno. Si está en alguno, lo echo cuando escriba.", m);
    guardarVarios(client, grupos, pedida); // the query is already paid for: it may as well fill the cache
    const sacado = [];
    const aMano = [];
    for (const [chatId, metadata] of Object.entries(grupos)) {
      const enGrupo = buscarEnGrupo(metadata?.participants, { jid: who, lid: whoLid });
      if (!enGrupo) continue;
      const nombre = metadata.subject || chatId;
      // Where the bot isn't admin WhatsApp would refuse anyway: no point asking.
      if (!buscarEnGrupo(metadata.participants, { jid: client.user.jid, lid: client.user.lid })?.admin) {
        aMano.push(`${nombre} (no soy admin)`);
        continue;
      }
      const { ok, status } = await expulsar(client, chatId, enGrupo.id);
      if (ok) sacado.push(nombre);
      else aMano.push(`${nombre} (error ${status})`);
    }
    return client.sendText(m.chat, textoBarrido(sacado, aMano), m);
  } else if (command === "ln2") {
    if (!existente) return client.sendText(m.chat, "Esa persona no estaba en la lista negra.", m);
    if (existente.chat === "*" && m.isGroup) return client.sendText(m.chat, "Está en la lista negra de todos los grupos: solo la puede sacar el dueño del bot, desde el privado.", m);

    removeFromBlacklist(existente.jid, ambito);
    m.react("☑️");
    return;
  }
};

export default plugin;

// What the all-groups sweep tells the owner: where the person was removed from, and where it's up to them.
function textoBarrido(sacado, aMano) {
  const lineas = ["Anotado en la lista negra de todos los grupos."];
  if (!sacado.length && !aMano.length) lineas.push("No está en ninguno de mis grupos ahora: lo echo apenas entre en uno.");
  if (sacado.length) lineas.push(`Lo saqué de: ${sacado.join(", ")}.`);
  if (aMano.length) lineas.push(`No lo pude sacar de: ${aMano.join(", ")}. Ahí sacalo a mano.`);
  return lineas.join("\n");
}

const more = String.fromCharCode(8206);
const readMore = more.repeat(4001);
