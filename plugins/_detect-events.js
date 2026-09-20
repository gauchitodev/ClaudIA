import { getUser } from "../database-functions.js";
import { estaEnListaNegra } from "../lib/lista-negra.js";

const plugin = (m) => m;
plugin.before = async (m, { client, participants, isBotAdmin, chat }) => {
  if (!m.messageStubType || !m.isGroup) return;
  const raw = m?.messageStubParameters?.[0] || null;
  const parseStub = safeJSON(raw);
  const userLid = parseStub?.id || null;

  const groupAdmins = participants.filter((p) => p.admin);

  // solicitud de unirse de un usuario que está en lista negra.
  if (Number(m.messageStubType) === 172) {
    if (!isBotAdmin) return;
    try {
      const pendientes = await client.groupRequestParticipantsList(m.chat);
      const usuariosRechazar = [];

      for (const participante of pendientes) {
        // La solicitud trae el LID y, cuando WhatsApp lo manda, el número: se mira la lista negra por los dos y se
        // rechaza con el id con el que la solicitud vino listada. Antes se miraba solo el número y, si no venía, se
        // colaba (y se empujaba un null a la lista de rechazos).
        const ids = [participante.jid, participante.phone_number].filter(Boolean);
        if (ids.length === 0) continue;
        if (!estaEnListaNegra(ids, m.chat)) continue;
        usuariosRechazar.push(ids[0]);
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
  const ownerJids = globalThis.owners.map((owner) => `${owner}@s.whatsapp.net`);
  for (const ownerJid of ownerJids) {
    const ownerLid = getUser(ownerJid)?.lid;
    // Comparación estricta: con == un owner sin fila en la base (undefined) coincidía con userLid null y silenciaba todo.
    if (ownerLid && (m.sender === ownerLid || userLid === ownerLid)) return;
  }

  if (chat.detect && Number(m.messageStubType) === 23) {
    await client.sendText(m.chat, txt.detectEventsResetLink(m.sender), null, { mentions: [m.sender, userLid, ...groupAdmins.map((v) => v.id)].filter(Boolean) });
  } else if (chat.detect && Number(m.messageStubType) === 29) {
    await client.sendText(m.chat, txt.detectEventsPromote(userLid, m.sender), null, { mentions: [m.sender, userLid, ...groupAdmins.map((v) => v.id)].filter(Boolean) });
  } else if (chat.detect && Number(m.messageStubType) === 30) {
    await client.sendText(m.chat, txt.detectEventsDemote(userLid, m.sender), null, { mentions: [m.sender, userLid, ...groupAdmins.map((v) => v.id)].filter(Boolean) });
  }

  return;
};

export default plugin;

function safeJSON(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
