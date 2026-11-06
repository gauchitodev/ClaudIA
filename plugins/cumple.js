import { registrarCumple, textoCumples } from "../lib/cumpleanos.js";
import { estaEnGrupo, conIndice } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["cumple", "cumples", "cumpleanos"];
plugin.onlyGroup = true;

// .cumple 14/03/1995 records yours, with the year · .cumple shows it · .cumple borrar · .cumples lists the group's,
// with whoever isn't in it anymore apart. With no list of the group at hand (empty), nobody is set apart: they'd all
// be.
plugin.run = async (m, { client, text, command, participants }) => {
  if (command !== "cumple") {
    const r = textoCumples(m.chat, new Date(), participants?.length ? estaEnGrupo(conIndice(participants)) : null);
    return client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m });
  }
  const r = registrarCumple(m.chat, m.sender, text);
  await client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
