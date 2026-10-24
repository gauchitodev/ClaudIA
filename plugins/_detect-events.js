import { esOwner } from "../database-functions.js";
import { estaEnListaNegra } from "../lib/lista-negra.js";
import { idsDeParticipante } from "../lib/identidad.js";

const plugin = (m) => m;
plugin.before = async (m, { client, participants, isBotAdmin, chat }) => {
  if (!m.messageStubType || !m.isGroup) return;
  const raw = m?.messageStubParameters?.[0] || null;
  const parseStub = safeJSON(raw);
  const userLid = parseStub?.id || null;

  const groupAdmins = participants.filter((p) => p.admin);

  // a join request from a user who is on the blacklist.
  if (Number(m.messageStubType) === 172) {
    if (!isBotAdmin) return;
    try {
      const pendientes = await client.groupRequestParticipantsList(m.chat);
      const usuariosRechazar = [];

      for (const participante of pendientes) {
        // The request carries the LID and, when WhatsApp sends it, the number: the blacklist is checked against both
        // and the rejection uses the id the request came listed under. It used to check the number only and, when that
        // was missing, they slipped through (and a null was pushed onto the rejection list).
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

  // The rest says who did it ("Acción hecha por: @…"). A notice that doesn't name them, keyed by a participant it
  // doesn't bring (Baileys, Socket/messages-recv.js) or by an account m.sender can't name (@hosted), came out as
  // "Acción hecha por: @", with nobody after the "@". Those used to be cut before the hooks; of them, only the join
  // request above has to get here.
  if (!m.sender) return;
  if (!chat.detect) return;
  if (chat.isBanned) return;

  // If the event involves one of the bot's owners, whoever did it or whoever it was done to, bail out so no alert is
  // posted to the chat. By every identity they may come under (esOwner takes the number or the LID): a group that lists
  // people by number brings them by it, and comparing with the owner's LID alone posted the owner's promotion.
  if ([m.sender, m.senderJid, ...idsDeParticipante(parseStub || userLid)].some((id) => esOwner(id))) return;

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
