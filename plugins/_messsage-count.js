import { sumarMensajeEnGrupo } from "../database-functions.js";

const plugin = (m) => m;
plugin.before = async (m, { client, user }) => {
  if (!m.isGroup || !m.message) return;

  // Counted over the row as it is now, not over "user": that copy was read when the message arrived, and writing it
  // back whole undid whatever changed in between (a mute, a warning) and lost the count of a message handled meanwhile.
  const total = sumarMensajeEnGrupo(m.sender, m.chat);
  // The copy is kept in step for the hooks after this one (the ranks read the count from it).
  if (total != null && user?.inGroup?.[m.chat]) user.inGroup[m.chat].messageCount = total;

  return;
};

export default plugin;
