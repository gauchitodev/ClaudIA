import { armarRecap } from "../lib/recap.js";

const plugin = {};
plugin.cmd = ["recap"];
plugin.onlyGroup = true;

// .recap: the current week's summary, on demand (the automatic one goes out on Sunday night if it's on).
plugin.run = async (m, { client }) => {
  const r = await armarRecap(m.chat);
  if (!r) return client.sendText(m.chat, "Esta semana todavía no hay nada que contar.", m);
  await client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m });
};

export default plugin;
