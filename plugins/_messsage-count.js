import { sumarMensajeEnGrupo } from "../database-functions.js";
import { registrarPresencia, anotarPresencia, NO_SON_MENSAJES } from "../lib/inactivos.js";

// What isn't a message of its own doesn't count (NO_SON_MENSAJES): a reaction, a deletion or an edit, a poll vote, a
// pin. They used to, and reacting a lot or deleting a lot climbed the ranks (lib/rangos.js).

const plugin = (m) => m;
plugin.before = async (m, { client, user }) => {
  // One the bot couldn't decrypt comes without a message: for .inactivos it's a sign of life all the same
  // (anotarPresencia), and the ranks don't count it.
  if (!m.message) return anotarPresencia(m);
  if (!m.isGroup || NO_SON_MENSAJES.has(m.mtype)) return;

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
