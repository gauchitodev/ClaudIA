import { armarRecap } from "../lib/recap.js";

let plugin = {};
plugin.cmd = ["recap"];
plugin.onlyGroup = true;

// .recap: el resumen de la semana en curso, a pedido (el automático sale el domingo de noche si está activo).
plugin.run = async (m, { client }) => {
  const r = await armarRecap(m.chat);
  if (!r) return client.sendText(m.chat, "Esta semana todavía no hay nada que contar.", m);
  await client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m });
};

export default plugin;
