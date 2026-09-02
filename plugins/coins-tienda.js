import { textoTienda } from "../lib/tienda.js";

let plugin = {};
plugin.cmd = ["tienda", "shop"];
plugin.onlyGroup = true;

plugin.run = async (m, { client }) => {
  await client.sendText(m.chat, textoTienda(), m);
};

export default plugin;
