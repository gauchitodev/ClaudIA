import { puedeRecuperarCitado } from "../lib/vista-unica.js";
import { mencionesParaTodos, textoSinNadie } from "../lib/menciones-generales.js";

const plugin = {};
plugin.cmd = ["hidetag", "ht"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, text, participants, isAdmin, isOwner, chat }) => {
  // Moderators get here too, and forwarding someone else's view-once to everyone is only for admins
  // (lib/vista-unica.js).
  if (!puedeRecuperarCitado(m, { isAdmin, isOwner })) return client.sendText(m.chat, txt.recoveryOnceRestrict, m);
  if (!chat.mentions && !isOwner) return client.sendText(m.chat, txt.mentionsDisabled, m);
  if (!text && !m.quoted) return client.sendText(m.chat, txt.hidetagNull, m);

  // Hidden, but it notifies just the same: whoever opted out with .notagall is left out (lib/menciones-generales.js).
  const { ids: users, fuera } = mencionesParaTodos(m.chat, participants, { client });
  if (!users.length) return client.sendText(m.chat, textoSinNadie(fuera), m);
  try {
    if (!isOwner) {
      await client.sendMessage(m.chat, { forward: m.quoted.fakeObj, mentions: users }, { quoted: m });
    } else if (isOwner) {
      await client.sendMessage(m.chat, { forward: m.quoted.fakeObj, mentions: users });
    }
  } catch {
    if (!isOwner) {
      await client.sendMessage(m.chat, { text: text ? text : "", mentions: users }, { quoted: m }, { ephemeralExpiration: 24 * 60 * 100, disappearingMessagesInChat: 24 * 60 * 100 });
    } else if (isOwner) {
      await client.sendMessage(m.chat, { text: text ? text : "", mentions: users }, { ephemeralExpiration: 24 * 60 * 100, disappearingMessagesInChat: 24 * 60 * 100 });
    }
  }
};

export default plugin;
