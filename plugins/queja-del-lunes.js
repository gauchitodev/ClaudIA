import { obtenerEntradasHashtag } from "../database-functions.js";
import { semanaDe } from "../lib/hashtags.js";

let plugin = {};
plugin.cmd = ["quejas", "quejadelunes"];
plugin.onlyGroup = true;

plugin.run = async (m, { client }) => {
  const semana = semanaDe(Date.now());
  const entradas = obtenerEntradasHashtag(m.chat, "quejadelunes", semana);

  if (entradas.length === 0) {
    return client.sendText(m.chat, "😤 Todavía no hay quejas esta semana. Descargate con #quejadelunes", m);
  }

  let texto = `😤 *Quejas de esta semana*\n\n`;
  entradas.forEach((entrada, i) => {
    const resumen = entrada.contenido.replace(/#\w+/gi, "").trim();
    texto += `*${i + 1}.* @${entrada.usuario.split("@")[0]} — ${resumen}\n\n`;
  });

  const mentions = entradas.map((e) => e.usuario);
  await client.sendMessage(m.chat, { text: texto.trim(), mentions }, { quoted: m });
};

export default plugin;
