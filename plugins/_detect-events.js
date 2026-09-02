import { getUser, isBlacklisted } from "../database-functions.js";

// mapa para demote de bot
const timers = new Map();

let plugin = (m) => m;
plugin.before = async function (m, { client, participants, isBotAdmin, chat }) {
  if (!m.messageStubType || !m.isGroup) return;
  const raw = m?.messageStubParameters?.[0] || null;
  const parseStub = safeJSON(raw);
  const userLid = parseStub?.id || null;

  const groupAdmins = participants.filter((p) => p.admin);

  // se sale el bot del grupo a los 60 segundos de quitarle el permiso administrador en el grupo
  /*if (m.messageStubType == 30 && userLid === client.user.jid) {
    if (timers.has(m.chat)) {
      clearTimeout(timers.get(m.chat));
    }

    const timer = setTimeout(async () => {
      if (timers.has(m.chat)) {
        await client.groupLeave(m.chat);
        timers.delete(m.chat);
      }
    }, 60000);

    client.sendText(m.chat, txt.demoteBot, null, { mentions: [...groupAdmins.map((v) => v.id)] });
    timers.set(m.chat, timer);
  }

  if (m.messageStubType == 29 && userLid === client.user.jid) {
    if (timers.has(m.chat)) {
      clearTimeout(timers.get(m.chat));
      timers.delete(m.chat);
    }
  }*/

  // solicitud de unirse de un usuario que está en lista negra.
  if (m.messageStubType == 172) {
    if (!isBotAdmin) return;
    try {
      const pendientes = await client.groupRequestParticipantsList(m.chat);
      const usuariosRechazar = [];

      for (const participante of pendientes) {
        const phone = participante.phone_number || null;

        const userReject = rejectUsers(phone);
        if (userReject) {
          usuariosRechazar.push(phone);
        }
      }

      if (usuariosRechazar.length > 0) {
        await client.groupRequestParticipantsUpdate(m.chat, usuariosRechazar, "reject");
      }
    } catch (error) {
      console.error("Error procesando el stubType 172:", error);
    }
  }

  if (!chat.detect) return;
  if (chat.isBanned) return;

  // Si el evento involucra a un owner del bot, retornar para no lanzar alerta al chat.
  const ownerJids = globalThis.owners.map((owner) => owner + "@s.whatsapp.net");
  for (const ownerJid of ownerJids) {
    const ownerLid = getUser(ownerJid)?.lid;
    // Comparación estricta: con == un owner sin fila en la base (undefined) coincidía con userLid null y silenciaba todo.
    if (ownerLid && (m.sender === ownerLid || userLid === ownerLid)) return;
  }

  if (chat.detect && m.messageStubType == 23) {
    await client.sendText(m.chat, txt.detectEventsResetLink(m.sender), null, { mentions: [m.sender, userLid, ...groupAdmins.map((v) => v.id)].filter(Boolean) });
  } else if (chat.detect && m.messageStubType == 29) {
    await client.sendText(m.chat, txt.detectEventsPromote(userLid, m.sender), null, { mentions: [m.sender, userLid, ...groupAdmins.map((v) => v.id)].filter(Boolean) });
  } else if (chat.detect && m.messageStubType == 30) {
    await client.sendText(m.chat, txt.detectEventsDemote(userLid, m.sender), null, { mentions: [m.sender, userLid, ...groupAdmins.map((v) => v.id)].filter(Boolean) });
  }

  return;
};

export default plugin;

function rejectUsers(jid) {
  return Boolean(isBlacklisted(jid));
}

function safeJSON(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
