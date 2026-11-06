import { esGrupoDeVentas } from "../lib/modo.js";
import { textoMenuVentas } from "../lib/menu-ventas.js";

// The marketplace mode menu: what's useful in a sales group, without the games or the economy. Its text lives in
// lib/menu-ventas.js, where the command guide (docs/comandos.md) reads it too.
const plugin = {};
plugin.cmd = ["menuventas", "menuventa", "menucompraventa", "ventas"];
plugin.onlyGroup = true;

plugin.run = async (m, { client, chat }) => {
  // The same test the loose sales are read by (plugins/_compraventa.js): this menu used to call a group buy-and-sell
  // while the hook, asking for every switch off, had stopped reading them.
  await client.sendText(m.chat, textoMenuVentas(esGrupoDeVentas(chat)), m);
};

export default plugin;
