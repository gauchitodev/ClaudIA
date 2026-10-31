import { getUser } from "../database-functions.js";
import { lidsMencionadosActual } from "../lib/identidad.js";
import { textoParentesco } from "../lib/familia.js";

// .parentesco @x: what that person is to you. .parentesco @a @b: what a is to b. Blood, in-laws, the couple and the
// exes (lib/familia.js, parentescoEntre). Replying to someone's message works like mentioning them.
const plugin = {};
plugin.cmd = ["parentesco", "pariente"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, participants }) => {
  const lids = await lidsMencionadosActual(client, m, text, participants);
  if (!lids.length) return client.sendText(m.chat, `¿De quién? ${usedPrefix}parentesco @persona te dice qué es tuyo, y ${usedPrefix}parentesco @a @b qué es una de la otra.`, m);
  const [quien, deQuien] = lids.length >= 2 ? lids : [lids[0], m.sender];
  if (!getUser(quien) || !getUser(deQuien)) return client.sendText(m.chat, "No conozco a esa persona todavía.", m);
  await client.sendText(m.chat, textoParentesco(quien, deQuien, deQuien === m.sender), m);
};

export default plugin;
