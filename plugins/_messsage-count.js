import { sumarMensajeEnGrupo } from "../database-functions.js";
import { registrarPresencia } from "../lib/inactivos.js";

// What isn't a message of its own doesn't count: a reaction, a deletion or an edit (protocolMessage, editedMessage), a
// poll vote, a pin. They used to, and reacting a lot or deleting a lot climbed the ranks (lib/rangos.js).
const NO_SON_MENSAJES = new Set(["reactionMessage", "encReactionMessage", "protocolMessage", "editedMessage", "pollUpdateMessage", "pinInChatMessage", "keepInChatMessage"]);

const plugin = (m) => m;
plugin.before = async (m, { client, user }) => {
  if (!m.isGroup || !m.message || NO_SON_MENSAJES.has(m.mtype)) return;

  // Counted over the row as it is now, not over "user": that copy was read when the message arrived, and writing it
  // back whole undid whatever changed in between (a mute, a warning) and lost the count of a message handled meanwhile.
  const total = sumarMensajeEnGrupo(m.sender, m.chat);
  // The copy is kept in step for the hooks after this one (the ranks read the count from it).
  if (total != null && user?.inGroup?.[m.chat]) user.inGroup[m.chat].messageCount = total;

  // When they last wrote, for .inactivos; someone it had warned is spared.
  await registrarPresencia(client, m).catch((e) => console.error("[inactivos] ERROR:", e));

  return;
};

export default plugin;
