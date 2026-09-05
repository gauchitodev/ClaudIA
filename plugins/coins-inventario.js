import { textoInventario } from "../lib/tienda.js";

let plugin = {};
plugin.cmd = ["inventario", "mochila", "inv"];
plugin.economia = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, user }) => {
  const contenido = textoInventario(m.chat, m.sender, user);
  const texto = contenido ? `🎒 *Tu inventario*\n\n${contenido}` : "🎒 Tu inventario está vacío. Mirá qué hay en .tienda";
  await client.sendText(m.chat, texto, m);
};

export default plugin;
