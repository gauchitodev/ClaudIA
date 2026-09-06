import { textoTienda } from "../lib/tienda.js";

const plugin = {};
plugin.cmd = ["tienda", "shop"];
plugin.economia = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client }) => {
  await client.sendText(m.chat, textoTienda(), m);
};

export default plugin;
