import { registrarCumple, textoCumples } from "../lib/cumpleanos.js";

let plugin = {};
plugin.cmd = ["cumple", "cumples", "cumpleanos", "cumpleaños"];
plugin.onlyGroup = true;

// .cumple 14/03 anota el propio · .cumple lo muestra · .cumple borrar · .cumples lista los del grupo
plugin.run = async (m, { client, text, command }) => {
  if (command !== "cumple") {
    const r = textoCumples(m.chat);
    return client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m });
  }
  const r = registrarCumple(m.chat, m.sender, text);
  await client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
