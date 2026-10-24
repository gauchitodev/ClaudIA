import { addToBlacklist, removeFromBlacklist, getBlacklist, isBlacklisted, esOwner, getUser } from "../database-functions.js";
import { impedimentoParaModerar } from "../lib/roles.js";
import { identidadesDe, buscarEnGrupo, expulsar } from "../lib/identidad.js";
import { guardarVarios } from "../lib/cache-grupos.js";
import { nombreDe, conNombres, lidEnElGrupo } from "../lib/menciones.js";

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

        const razon = (m.isGroup ? razonParaElGrupo(entry) : entry.reason) || "Sin razón";
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
  let who, reason, tecleado;
  // Who goes on the list comes right after the command, the number (".ln +598… estafa") or the mention (".ln @persona
  // estafa"): taken from further on, ".ln @persona le robó a +598…" listed the number's owner and removed them, and
  // ".ln el +598… le robó a @persona" the one robbed. Further on they're part of the reason, which names any mention,
  // by number too: the whole group reads it (.vln), and the digits of a LID were left in it.
  const inicio = text.trimStart();
  const arroba = inicio.match(/^@(\d+)/)?.[1];
  const mencion = arroba && (m.mentionedJid || []).find((j) => j.split("@")[0].split(":")[0] === arroba);
  // How to write it, for when it isn't: in private there's no mentioning anybody.
  const motivo = command === "ln" ? " motivo" : "";
  const forma = m.isGroup ? `${usedPrefix}${command} @persona${motivo} o ${usedPrefix}${command} +59899999999${motivo}` : `${usedPrefix}${command} +59899999999${motivo}${command === "ln2" ? `, o como lo muestra ${usedPrefix}vln` : ""}`;
  if (/^\+\d/.test(inicio)) {
    const numero = numeroTipeado(inicio.match(/^\+\d[\d\s-]*/)[0], participants);
    // What makes it unclear may be a reason that starts with a digit, the number typed all together ("+50012345 2
    // veces"): typing it all together again didn't help.
    if (numero.dudas) return client.sendText(m.chat, `No sé dónde termina el número: puede ser ${alternativas(numero.dudas.map((d) => `+${d}`))}. Mandalo todo junto, sin espacios${command === "ln" ? ", y el motivo después, que no empiece con un número" : ""}.`, m);
    who = `${numero.digitos}@s.whatsapp.net`;
    tecleado = numero.digitos;
    // The number goes with the spaces, dashes or commas after it: "+59899666666 - me estafó" left "- me estafó" as the
    // reason, and ", estafa" or "— estafa" were left too.
    reason = conNombres(inicio.slice(numero.tipeado.length).replace(/^[\s,.:;–—-]+/, ""), m.mentionedJid).trim();
  } else if (mencion) {
    who = mencion;
    // Without the mention's digits (a LID or, in a group listed by number, the number): they were left in it.
    reason = conNombres(inicio.slice(arroba.length + 1), m.mentionedJid).trim();
  } else if (arroba && command === "ln2" && !m.isGroup) {
    tecleado = arroba; // as private .vln shows an entry kept under a LID
  } else if (/\+\d/.test(text) || m.mentionedJid?.length) {
    // Someone named further on, and nobody right after the command. Replying to someone else's message, whoever wrote
    // it may be who was meant, or the one named: it asks, rather than guess and remove the wrong one.
    const accion = command === "ln" ? "anotar" : "sacar";
    const deOtro = m.quoted?.sender && ![m.sender, m.senderJid, client.user.lid, client.user.jid].includes(m.quoted.sender);
    if (deOtro) return client.sendText(m.chat, `No sé a quién ${accion}: si a quien escribió el mensaje que respondiste o a quien nombrás en el texto. Poné primero a quién (${forma}), o respondé el mensaje sin nombrar a nadie más.`, m);
    return client.sendText(m.chat, `Poné a quién ${accion} justo después de ${usedPrefix}${command}: ${forma}.`, m);
  } else {
    who = m.quoted?.sender || null;
    reason = who ? conNombres(text, m.mentionedJid).trim() : null;
  }

  // In private .vln shows each entry by its key, the number or the LID it's kept under, and typed back that's the
  // entry, whoever has the number now: by the person's identities, one kept under a number that is someone else's now
  // came out "no estaba", and nothing else took it off there.
  if (command === "ln2" && !m.isGroup && tecleado) {
    const entrada = getBlacklist("*").find((e) => e.jid.split("@")[0] === tecleado);
    if (entrada) {
      removeFromBlacklist(entrada.jid, "*");
      return m.react("☑️");
    }
    if (!who) return client.sendText(m.chat, "Esa persona no estaba en la lista negra.", m);
  }

  if (!who) return client.sendText(m.chat, txt.defaultWhoBlackList(usedPrefix, command), m);

  // The person's two identities: the number, which is what gets recorded, and the LID, which is what the group lists
  // them under and what WhatsApp removes them by. Both come from the database and from the group's participants.
  // Someone who never wrote may have no known number: then they're recorded by LID, which is still enough to
  // recognize and remove them. A LID only the database knows for the number isn't kept (lidDeLaBase, lib/identidad.js).
  const { jid, lid: whoLid, participante, lidDeLaBase } = identidadesDe(who, m.isGroup ? participants : null);
  who = jid || whoLid || who;
  const lidQueQueda = lidDeLaBase ? null : whoLid;

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
      addToBlacklist(existente.jid, reason, m.senderJid, ambito, lidQueQueda);
      return client.sendText(m.chat, "Ya estaba en la lista negra. Se actualizó el motivo.", m);
    }

    addToBlacklist(who, reason, m.senderJid, ambito, lidQueQueda, whoLid);
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
      // With a LID only the database knows, whoever each group lists with the number goes first: that's who has it.
      const enGrupo = buscarEnGrupo(metadata?.participants, { jid: who, lid: (lidDeLaBase && lidEnElGrupo(metadata?.participants, who)) || whoLid });
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

// A reason as the group reads it (.vln there): without the listed person's own number or LID, which one from before the
// reasons left them out still has ("@59899555555 estafa"), with the LIDs the bot knows as names, and anyone else as
// "@alguien", which is how a reason given now names them: the digits of their LID were left in sight. Glued to a word
// too ("x@59899123456"), unless it's an e-mail's domain ("pepe@12345.com" was "pepe@alguien.com"); leaving out any "@"
// after a letter, the digits of a number or a LID showed again. Anybody else's number doesn't show either
// (numerosOcultos): the whole group reads the list, and an entry of the all-groups list was written by the owner in
// private.
function razonParaElGrupo(entrada) {
  let razon = String(entrada.reason || "");
  for (const id of [entrada.jid, entrada.lid]) {
    const digitos = String(id || "").split("@")[0];
    if (/^\d{5,}$/.test(digitos)) razon = razon.replace(new RegExp(`(?<!\\d)[@+]?${digitos}(?!\\d)`, "g"), "");
  }
  return numerosOcultos(conNombres(razon).replace(/@\d{5,}(?!\d|\.\p{L})/gu, "@alguien"))
    .replace(/\s+/g, " ")
    .trim();
}

// Phone numbers as people write them, as "(número oculto)": with their "+" or a leading 0 or neither, in groups with
// spaces, dashes or parentheses between them ("099 123 456", "+598 (99) 123 456"), dots after a "+" or a 0
// ("+598.99.123.456"), glued to a word ("cel59899123456"). Only "+" and a run of eight digits used to count. Eight
// digits or more is a number; a price with its thousands' dots ("15.000.000") and a date stay.
function numerosOcultos(texto) {
  return texto.replace(/(?<![@\p{N}])\+?\(?\d(?:[\s().-]{0,3}\d)*/gu, (tira) => {
    if (tira.replace(/\D/g, "").length < 8) return tira;
    if (tira.includes(".") && !/^\+|^\(?0/.test(tira)) return tira;
    if (/^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}-\d{1,2}-\d{4})$/.test(tira)) return tira;
    return "(número oculto)";
  });
}

// Where a number typed after .ln ends: the reason may start with digits too. Typed all together, ten digits or more, it
// ends where they do: "+59899666666 2 veces me estafó" listed 598996666662. Spaced out or with dashes, any group may be
// the reason's first word ("+598 99 666 666 2 veces me estafó" listed 598996666662 too, and "+59899666 666" became
// 59899666 when it was taken as typed all together). The cut that is someone the bot knows wins, in the group or in the
// database, unless a shorter one makes a whole number too: the longer one may be the number and the reason's digits,
// someone else's by chance ("+43 664 123456 7 veces" listed whoever had 436641234567). With nobody known, the only cut
// that makes a whole number with its country's code, 10 to 15 digits, and with no cut that long, the only one of 7 or
// more, as long as the shortest numbers are with theirs: "+50012345 2 veces" listed 500123452. With more than one it
// asks, rather than listing someone else. Past 15 digits no cut is a number, and it stops: a long run of spaced digits
// was otherwise copied once for each of them. Returns { tipeado, digitos } or { dudas }.
function numeroTipeado(texto, participants) {
  const cortes = [];
  for (const grupo of texto.matchAll(/\d+/g)) {
    const tipeado = texto.slice(0, grupo.index + grupo[0].length);
    const digitos = tipeado.replace(/\D/g, "");
    if (digitos.length > 15) break;
    cortes.push({ tipeado, digitos });
  }
  if (!cortes.length) return { tipeado: texto.match(/^\+\d+/)[0], digitos: texto.match(/^\+(\d+)/)[1] }; // no number is that long
  if (cortes[0].digitos.length >= 10) return cortes[0];
  const conocidos = cortes.filter(({ digitos }) => {
    const jid = `${digitos}@s.whatsapp.net`;
    return digitos.length >= 7 && ((participants || []).some((p) => p?.phoneNumber === jid || p?.id === jid) || getUser(jid));
  });
  const enteros = cortes.filter(({ digitos }) => digitos.length >= 10);
  const dudas = (opciones) => ({ dudas: opciones.map(({ digitos }) => digitos) });
  if (conocidos.length > 1) return dudas(conocidos);
  if (conocidos.length === 1 && !enteros.some(({ digitos }) => digitos.length < conocidos[0].digitos.length)) return conocidos[0];
  const posibles = enteros.length ? enteros : cortes.filter(({ digitos }) => digitos.length >= 7);
  if (posibles.length > 1) return dudas(posibles);
  return posibles[0] || cortes.at(-1);
}

const alternativas = (opciones) => `${opciones.slice(0, -1).join(", ")} o ${opciones.at(-1)}`;

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
