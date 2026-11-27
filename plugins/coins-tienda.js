import { textoTienda } from "../lib/tienda.js";

// .tienda: the shop's shelves (lib/tienda.js); .tienda bienes (or estatus, pueblo, servicios, juego) shows one.
const plugin = {};
plugin.cmd = ["tienda", "shop"];
plugin.economia = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, args = [] }) => {
  await client.sendText(m.chat, textoTienda(m.chat, args.join(" ")), m);
};

export default plugin;
