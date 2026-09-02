import { programarReintento } from "../lib/pendientes.js";

let plugin = {};
plugin.cmd = ["reintentar", "retry"];
plugin.onlyGroup = true;

plugin.run = async (m, { client }) => {
  const r = programarReintento(m.chat, m.sender);
  await client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
